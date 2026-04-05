import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Query,
  Param,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { GmailService } from "./gmail.service";
import { PaymentEmailsService } from "./payment-emails.service";

@Controller("payment-emails")
export class PaymentEmailsController {
  constructor(
    private gmailService: GmailService,
    private paymentEmailsService: PaymentEmailsService,
  ) {}

  // Initiate Gmail OAuth — shopkeeper clicks "Connect Gmail"
  @Get("connect")
  connect(@Query("shopkeeperId") shopkeeperId: string, @Res() res: any) {
    if (!shopkeeperId) {
      return res.status(400).json({ message: "shopkeeperId is required" });
    }
    const url = this.gmailService.getAuthUrl(shopkeeperId);
    return res.redirect(url);
  }

  // Gmail OAuth callback
  @Get("connect/callback")
  async callback(@Query("code") code: string, @Query("state") shopkeeperId: string, @Res() res: any) {
    try {
      await this.gmailService.handleCallback(code, shopkeeperId);
      // Redirect to frontend settings page with success
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
      return res.redirect(`${frontendUrl}/shopkeeper/dashboard?gmailConnected=true`);
    } catch (err) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
      return res.redirect(`${frontendUrl}/shopkeeper/dashboard?gmailError=${encodeURIComponent(err.message)}`);
    }
  }

  // Check connection status
  @Get("status")
  @UseGuards(AuthGuard("jwt"))
  async status(@Req() req: any) {
    const shopkeeperId = req.user?.userId || req.user?.sub || req.user?._id;
    const connection = await this.gmailService.getStatus(shopkeeperId);
    return { connected: !!connection, connection };
  }

  // Disconnect Gmail
  @Delete("disconnect")
  @UseGuards(AuthGuard("jwt"))
  async disconnect(@Req() req: any) {
    const shopkeeperId = req.user?.userId || req.user?.sub || req.user?._id;
    await this.gmailService.disconnect(shopkeeperId);
    return { message: "Gmail disconnected successfully" };
  }

  // Toggle active/inactive
  @Patch("toggle")
  @UseGuards(AuthGuard("jwt"))
  async toggle(@Req() req: any, @Query("active") active: string) {
    const shopkeeperId = req.user?.userId || req.user?.sub || req.user?._id;
    const isActive = active === "true";
    const connection = await this.gmailService.toggleActive(shopkeeperId, isActive);
    return { connection };
  }

  // Manual poll trigger
  @Post("poll")
  @UseGuards(AuthGuard("jwt"))
  async manualPoll(@Req() req: any) {
    const shopkeeperId = req.user?.userId || req.user?.sub || req.user?._id;
    const connections = await this.gmailService.getActiveConnections();
    const connection = connections.find(
      (c) => c.shopkeeperId === shopkeeperId,
    );
    if (!connection) {
      return { message: "No active Gmail connection found" };
    }
    await this.paymentEmailsService.pollForShopkeeper(connection);
    return { message: "Poll completed" };
  }

  // Get detected payment emails
  @Get("emails")
  @UseGuards(AuthGuard("jwt"))
  async getEmails(@Req() req: any, @Query("status") status?: string) {
    const shopkeeperId = req.user?.userId || req.user?.sub || req.user?._id;
    const emails = await this.paymentEmailsService.getPaymentEmails(
      shopkeeperId,
      status,
    );
    return { emails };
  }

  // Update payment email status (confirm/ignore)
  @Patch("emails/:id")
  @UseGuards(AuthGuard("jwt"))
  async updateEmailStatus(
    @Param("id") id: string,
    @Query("status") status: "confirmed" | "ignored",
  ) {
    const updated = await this.paymentEmailsService.updatePaymentEmailStatus(
      id,
      status,
    );
    return { email: updated };
  }
}
