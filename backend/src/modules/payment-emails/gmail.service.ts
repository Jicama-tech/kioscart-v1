import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { google, gmail_v1 } from "googleapis";
import {
  GmailConnection,
  GmailConnectionDocument,
} from "./schemas/gmail-connection.schema";

export interface GmailMessage {
  id: string;
  subject: string;
  from: string;
  body: string;
  receivedAt: Date;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    @InjectModel(GmailConnection.name)
    private gmailConnectionModel: Model<GmailConnectionDocument>,
  ) {}

  getOAuth2Client() {
    return new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI ||
        `${process.env.BACKEND_URL}/payment-emails/connect/callback`,
    );
  }

  getAuthUrl(shopkeeperId: string): string {
    const oauth2Client = this.getOAuth2Client();
    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
      state: shopkeeperId,
    });
  }

  async handleCallback(
    code: string,
    shopkeeperId: string,
  ): Promise<GmailConnection> {
    const oauth2Client = this.getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    this.logger.log(`OAuth tokens received — scopes: ${tokens.scope}, has refresh: ${!!tokens.refresh_token}`);

    oauth2Client.setCredentials(tokens);

    // Get user email
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;

    // Upsert connection
    const connection = await this.gmailConnectionModel.findOneAndUpdate(
      { shopkeeperId },
      {
        shopkeeperId,
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : new Date(Date.now() + 3600 * 1000),
        isActive: true,
      },
      { upsert: true, new: true },
    );

    return connection;
  }

  async disconnect(shopkeeperId: string): Promise<void> {
    await this.gmailConnectionModel.deleteOne({ shopkeeperId });
  }

  async getStatus(shopkeeperId: string): Promise<GmailConnection | null> {
    return this.gmailConnectionModel
      .findOne({ shopkeeperId })
      .select("-accessToken -refreshToken")
      .lean();
  }

  async toggleActive(
    shopkeeperId: string,
    isActive: boolean,
  ): Promise<GmailConnection | null> {
    return this.gmailConnectionModel.findOneAndUpdate(
      { shopkeeperId },
      { isActive },
      { new: true },
    );
  }

  async getActiveConnections(): Promise<GmailConnectionDocument[]> {
    return this.gmailConnectionModel.find({ isActive: true });
  }

  async fetchPaymentEmails(
    connection: GmailConnectionDocument,
  ): Promise<GmailMessage[]> {
    const oauth2Client = this.getOAuth2Client();

    // Check if token needs refresh
    if (
      connection.tokenExpiry &&
      new Date() >= new Date(connection.tokenExpiry)
    ) {
      oauth2Client.setCredentials({ refresh_token: connection.refreshToken });
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        connection.accessToken = credentials.access_token;
        connection.tokenExpiry = credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : new Date(Date.now() + 3600 * 1000);
        await connection.save();
      } catch (err) {
        this.logger.error(
          `Token refresh failed for ${connection.shopkeeperId}: ${err.message}`,
        );
        connection.isActive = false;
        await connection.save();
        return [];
      }
    }

    oauth2Client.setCredentials({
      access_token: connection.accessToken,
      refresh_token: connection.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    try {
      // Search for unread emails from the last hour with payment-related keywords
      const query = "is:unread newer_than:1h";

      this.logger.log(`Polling Gmail for shopkeeper ${connection.shopkeeperId} — query: ${query}`);

      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 10,
      });

      const messages: GmailMessage[] = [];

      this.logger.log(`Found ${listRes.data.messages?.length || 0} unread emails`);

      if (!listRes.data.messages || listRes.data.messages.length === 0) {
        return messages;
      }

      for (const msg of listRes.data.messages) {
        try {
          const fullMsg = await gmail.users.messages.get({
            userId: "me",
            id: msg.id,
            format: "full",
          });

          const headers = fullMsg.data.payload?.headers || [];
          const subject =
            headers.find((h) => h.name?.toLowerCase() === "subject")?.value ||
            "";
          const from =
            headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
          const dateHeader =
            headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";

          const body = this.extractBody(fullMsg.data.payload);

          messages.push({
            id: msg.id,
            subject,
            from,
            body,
            receivedAt: dateHeader ? new Date(dateHeader) : new Date(),
          });

          // No need to mark as read — dedup via gmailMessageId handles it
        } catch (msgErr) {
          this.logger.warn(`Failed to fetch message ${msg.id}: ${msgErr.message}`);
        }
      }

      // Update last polled time
      connection.lastPolledAt = new Date();
      await connection.save();

      return messages;
    } catch (err) {
      this.logger.error(
        `Gmail fetch failed for ${connection.shopkeeperId}: ${err.message}`,
      );
      return [];
    }
  }

  private extractBody(payload: gmail_v1.Schema$MessagePart): string {
    if (!payload) return "";

    // Direct body
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }

    // Multipart — look for text/plain or text/html
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
      }
      // Fallback to HTML if no plain text
      for (const part of payload.parts) {
        if (part.mimeType === "text/html" && part.body?.data) {
          const html = Buffer.from(part.body.data, "base64").toString("utf-8");
          return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        }
      }
      // Recursive for nested multipart
      for (const part of payload.parts) {
        const nested = this.extractBody(part);
        if (nested) return nested;
      }
    }

    return "";
  }
}
