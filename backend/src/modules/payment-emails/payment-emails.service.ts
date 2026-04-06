import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Cron } from "@nestjs/schedule";
import { GmailService } from "./gmail.service";
import { EmailParserService } from "./email-parser.service";
import { OtpService } from "../otp/otp.service";
import {
  PaymentEmail,
  PaymentEmailDocument,
} from "./schemas/payment-email.schema";

@Injectable()
export class PaymentEmailsService {
  private readonly logger = new Logger(PaymentEmailsService.name);

  constructor(
    @InjectModel(PaymentEmail.name)
    private paymentEmailModel: Model<PaymentEmailDocument>,
    @InjectModel("Order") private orderModel: Model<any>,
    @InjectModel("Shopkeeper") private shopkeeperModel: Model<any>,
    private gmailService: GmailService,
    private emailParser: EmailParserService,
    private otpService: OtpService,
  ) {}

  // Poll every 60 seconds
  @Cron("*/60 * * * * *")
  async pollAllConnections() {
    const connections = await this.gmailService.getActiveConnections();
    if (connections.length === 0) return;

    for (const connection of connections) {
      try {
        await this.pollForShopkeeper(connection);
      } catch (err) {
        this.logger.error(
          `Poll failed for shopkeeper ${connection.shopkeeperId}: ${err.message}`,
        );
      }
    }
  }

  async pollForShopkeeper(connection: any) {
    const messages = await this.gmailService.fetchPaymentEmails(connection);

    for (const msg of messages) {
      // Skip if already processed
      const exists = await this.paymentEmailModel.exists({
        gmailMessageId: msg.id,
      });
      if (exists) continue;

      // Check if it's a payment email
      if (!this.emailParser.isPaymentEmail(msg.subject, msg.body)) continue;

      // Parse payment details
      const parsed = this.emailParser.parse(msg.subject, msg.body);
      if (!parsed.amount) continue; // Skip if we couldn't extract an amount

      // Try to match to a pending order
      const matchResult = await this.matchToOrder(
        connection.shopkeeperId,
        parsed.amount,
      );

      // Save the payment email record
      const paymentEmail = await this.paymentEmailModel.create({
        shopkeeperId: connection.shopkeeperId,
        gmailMessageId: msg.id,
        from: msg.from,
        subject: msg.subject,
        amount: parsed.amount,
        currency: parsed.currency,
        senderName: parsed.senderName,
        referenceId: parsed.referenceId,
        bankOrProvider: parsed.bankOrProvider,
        receivedAt: msg.receivedAt,
        matchedOrderId: matchResult.bestMatch?.orderId || null,
        status: matchResult.bestMatch ? "matched" : "unmatched",
        rawSnippet: msg.body.substring(0, 500),
      });

      // Notify shopkeeper
      await this.notifyShopkeeper(
        connection.shopkeeperId,
        paymentEmail,
        matchResult,
      );

      this.logger.log(
        `Payment email detected: ${parsed.currency} ${parsed.amount} from ${parsed.senderName || "unknown"} for shopkeeper ${connection.shopkeeperId}`,
      );
    }
  }

  private async matchToOrder(
    shopkeeperId: string,
    amount: number,
  ): Promise<{
    bestMatch: any | null;
    candidates: any[];
  }> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find pending orders for this shopkeeper within last 24h
    const pendingOrders = await this.orderModel
      .find({
        shopkeeperId,
        status: "pending",
        createdAt: { $gte: oneDayAgo },
      })
      .lean();

    if (pendingOrders.length === 0) {
      return { bestMatch: null, candidates: [] };
    }

    // Match by amount (exact or within 1% tolerance for fees)
    const tolerance = amount * 0.01;
    const candidates = pendingOrders.filter(
      (order: any) =>
        Math.abs(order.totalAmount - amount) <= tolerance,
    );

    if (candidates.length === 1) {
      return { bestMatch: candidates[0], candidates };
    }

    // Multiple matches — return all candidates, pick closest amount
    if (candidates.length > 1) {
      const sorted = candidates.sort(
        (a: any, b: any) =>
          Math.abs(a.totalAmount - amount) - Math.abs(b.totalAmount - amount),
      );
      return { bestMatch: sorted[0], candidates };
    }

    return { bestMatch: null, candidates: [] };
  }

  private async notifyShopkeeper(
    shopkeeperId: string,
    paymentEmail: PaymentEmailDocument,
    matchResult: { bestMatch: any | null; candidates: any[] },
  ) {
    const amountStr = `${paymentEmail.currency} ${paymentEmail.amount}`;
    const sender = paymentEmail.senderName || paymentEmail.from || "Unknown";
    const provider = paymentEmail.bankOrProvider || "Unknown";
    const ref = paymentEmail.referenceId ? `\nRef: ${paymentEmail.referenceId}` : "";

    let message = `💰 *Payment Received*\n\nAmount: *${amountStr}*\nFrom: ${sender}\nVia: ${provider}${ref}`;

    if (matchResult.bestMatch) {
      message += `\n\n✅ *Matched to Order #${matchResult.bestMatch.orderId}*`;
      this.logger.log(`💰 Payment ${amountStr} from ${sender} via ${provider}${ref} → Matched Order #${matchResult.bestMatch.orderId}`);
    } else {
      message += `\n\n⚠️ No matching order found`;
      this.logger.log(`💰 Payment ${amountStr} from ${sender} via ${provider}${ref} → No matching order found`);
    }

    // Send WhatsApp notification to shopkeeper via Baileys
    try {
      const shopkeeper: any = await this.shopkeeperModel.findById(shopkeeperId).lean();
      if (shopkeeper?.whatsappNumber) {
        await this.otpService.sendWhatsAppMessage(shopkeeper.whatsappNumber, message);
        this.logger.log(`WhatsApp notification sent to shopkeeper ${shopkeeperId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to send WhatsApp notification: ${err.message}`);
    }
  }

  // API methods for controller
  async getPaymentEmails(
    shopkeeperId: string,
    status?: string,
  ): Promise<PaymentEmail[]> {
    const query: any = { shopkeeperId };
    if (status) query.status = status;
    return this.paymentEmailModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async updatePaymentEmailStatus(
    id: string,
    status: "confirmed" | "ignored",
  ): Promise<PaymentEmail> {
    const updated = await this.paymentEmailModel.findByIdAndUpdate(id, { status }, { new: true });

    // If confirmed and matched to an order, update order status to processing
    if (status === "confirmed" && updated?.matchedOrderId) {
      try {
        await this.orderModel.findOneAndUpdate(
          { orderId: updated.matchedOrderId, status: "pending" },
          { status: "processing" },
        );
        this.logger.log(`Order #${updated.matchedOrderId} updated to processing after payment confirmation`);
      } catch (err) {
        this.logger.warn(`Failed to update order status: ${err.message}`);
      }
    }

    return updated;
  }
}
