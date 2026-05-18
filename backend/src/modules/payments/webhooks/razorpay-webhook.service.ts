import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  forwardRef,
  Inject,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PaymentGatewayFactory } from "../../payment-gateways/gateway.factory";
import { ShopkeepersService } from "../../shopkeepers/shopkeepers.service";
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
  TransferStatus,
} from "../schemas/payment.schema";
import { Order } from "../../orders/entities/order.entity";
import { CheckoutService } from "../checkout.service";
import { OtpService } from "../../otp/otp.service";
import { Shopkeeper, ShopkeeperDocument } from "../../shopkeepers/schemas/shopkeeper.schema";

/**
 * Verifies and dispatches Razorpay webhook events. Idempotent: any event
 * we've already processed is a no-op.
 */
@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);

  constructor(
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly shopkeepersService: ShopkeepersService,
    @Inject(forwardRef(() => CheckoutService))
    private readonly checkoutService: CheckoutService,
    @Inject(forwardRef(() => OtpService))
    private readonly otpService: OtpService,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Shopkeeper.name)
    private readonly shopkeeperModel: Model<ShopkeeperDocument>,
  ) {}

  async handle(rawBody: string, signature: string, payload: any) {
    const gateway = this.gatewayFactory.forProvider("razorpay");
    const valid = gateway.verifyWebhook({ rawBody, signature });
    if (!valid) {
      this.logger.warn("Razorpay webhook signature mismatch — rejecting.");
      throw new UnauthorizedException("Invalid signature");
    }

    const event: string = payload?.event || "";
    this.logger.log(`Razorpay webhook: ${event}`);

    try {
      switch (event) {
        case "account.under_review":
          await this.onAccountUnderReview(payload);
          break;
        case "account.activated":
          await this.onAccountActivated(payload);
          break;
        case "account.rejected":
          await this.onAccountRejected(payload);
          break;
        case "account.suspended":
          await this.onAccountSuspended(payload);
          break;
        case "payment.captured":
          await this.onPaymentCaptured(payload);
          break;
        case "payment.failed":
          await this.onPaymentFailed(payload);
          break;
        case "transfer.processed":
          await this.onTransferProcessed(payload);
          break;
        case "transfer.failed":
          await this.onTransferFailed(payload);
          break;
        case "refund.processed":
          await this.onRefundProcessed(payload);
          break;
        default:
          this.logger.log(`Ignoring webhook event: ${event}`);
      }
    } catch (err: any) {
      this.logger.error(`Webhook handler ${event} failed: ${err.message}`);
      // Razorpay retries on non-2xx — only throw if the failure is transient.
      throw new BadRequestException(err.message);
    }

    return { received: true, event };
  }

  // ---- Account lifecycle ----

  private extractAccountId(payload: any): string | undefined {
    return (
      payload?.payload?.account?.entity?.id ||
      payload?.payload?.merchant?.entity?.id
    );
  }

  private async onAccountUnderReview(payload: any) {
    const id = this.extractAccountId(payload);
    if (!id) return;
    await this.shopkeepersService.applyRazorpayAccountWebhook(
      id,
      "under_review",
    );
  }

  private async onAccountActivated(payload: any) {
    const id = this.extractAccountId(payload);
    if (!id) return;
    await this.shopkeepersService.applyRazorpayAccountWebhook(id, "active");
  }

  private async onAccountRejected(payload: any) {
    const id = this.extractAccountId(payload);
    if (!id) return;
    const reason =
      payload?.payload?.account?.entity?.rejection_reason ||
      payload?.payload?.account?.entity?.notes?.rejection_reason;
    await this.shopkeepersService.applyRazorpayAccountWebhook(
      id,
      "rejected",
      reason,
    );
  }

  private async onAccountSuspended(payload: any) {
    const id = this.extractAccountId(payload);
    if (!id) return;
    await this.shopkeepersService.applyRazorpayAccountWebhook(id, "suspended");
  }

  // ---- Payment / transfer lifecycle (used by Phase 4) ----

  private async onPaymentCaptured(payload: any) {
    const entity = payload?.payload?.payment?.entity;
    if (!entity) return;

    let payment = await this.paymentModel.findOne({
      gatewayOrderId: entity.order_id,
    });

    // Lazy-creation fallback path: if no Payment doc exists, either the
    // frontend verify-create call hasn't completed yet OR it never reached
    // us at all (ngrok dropped, customer's tab crashed). Materialize the
    // Order + Payment from the stashed CheckoutIntent. Idempotency is
    // enforced inside finalizeFromWebhook via the unique gatewayOrderId
    // index on Order.
    if (!payment) {
      try {
        const result = await this.checkoutService.finalizeFromWebhook(
          entity.order_id,
          entity.id,
        );
        if (!result.paymentId) {
          // No intent either — nothing we can do beyond logging. This means
          // a Razorpay payment landed for an order we have no record of.
          this.logger.warn(
            `No Payment record AND no CheckoutIntent for ${entity.order_id} — skipping`,
          );
          return;
        }
        payment = await this.paymentModel.findById(result.paymentId);
        if (!payment) return;
      } catch (err: any) {
        this.logger.error(
          `Webhook fallback finalize failed for ${entity.order_id}: ${err.message}`,
        );
        return;
      }
    }

    if (payment.status === PaymentStatus.Captured) {
      // Already captured (verify endpoint won the race). Webhook is just
      // confirming the state — still fire the shopkeeper notify in case
      // verify-create didn't (no harm: notify is idempotent in practice).
      this.notifyShopkeeperOnPayment(payment).catch((err) => {
        this.logger.warn(
          `Shopkeeper WhatsApp notify failed for payment ${payment._id}: ${err?.message || err}`,
        );
      });
      return;
    }

    payment.gatewayPaymentId = entity.id;
    payment.status = PaymentStatus.Captured;
    payment.capturedAt = new Date();
    await payment.save();

    await this.orderModel.findByIdAndUpdate(payment.orderId, {
      paymentId: payment._id,
      paymentStatus: "paid",
      transactionId: entity.id,
    });

    // Create the on-hold Route transfer if the verify endpoint didn't.
    // Failures here shouldn't reject the webhook (Razorpay would retry the
    // payment.captured event and double-create); we'll surface via logs.
    if (!payment.transferId) {
      try {
        await this.checkoutService.createOnHoldTransferForPayment(payment);
      } catch (err: any) {
        this.logger.error(
          `Auto on-hold transfer failed for payment ${payment._id}: ${err.message}`,
        );
      }
    }

    // Best-effort shopkeeper notification — never let WhatsApp problems
    // bounce the webhook (Razorpay would retry, we'd double-notify).
    this.notifyShopkeeperOnPayment(payment).catch((err) => {
      this.logger.warn(
        `Shopkeeper WhatsApp notify failed for payment ${payment._id}: ${err?.message || err}`,
      );
    });
  }

  /** TEST-ONLY entry point: looks up an order by its public orderId (ORD-xxx)
   *  and runs notifyShopkeeperOnPayment with a synthetic Payment shim.
   *  Wire-only — remove the controller route before shipping to prod. */
  async _debugNotifyByOrderId(orderId: string) {
    const order: any = await this.orderModel.findOne({ orderId }).lean();
    if (!order) throw new BadRequestException(`Order ${orderId} not found`);
    const fakePayment = { orderId: order._id } as unknown as PaymentDocument;
    await this.notifyShopkeeperOnPayment(fakePayment);
    return {
      ok: true,
      orderId: order.orderId,
      shopkeeperId: String(order.shopkeeperId),
    };
  }

  /** Send a paid-order ping to the shopkeeper on WhatsApp so they can start
   *  processing immediately. Pulls order + shop, formats a compact summary,
   *  fires through OtpService (which owns the Baileys socket). Swallows all
   *  errors — this is decorative, not transactional. */
  private async notifyShopkeeperOnPayment(payment: PaymentDocument) {
    const order: any = await this.orderModel.findById(payment.orderId).lean();
    if (!order) {
      this.logger.warn(
        `Order ${payment.orderId} not found — skipping shopkeeper notify`,
      );
      return;
    }
    const shop: any = await this.shopkeeperModel
      .findById(order.shopkeeperId)
      .lean();
    const phone = shop?.whatsappNumber;
    if (!phone) {
      this.logger.warn(
        `Shopkeeper ${order.shopkeeperId} has no whatsappNumber — skipping notify`,
      );
      return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const itemLines = items
      .slice(0, 8)
      .map((it: any) => {
        const name = it?.productName || "Item";
        const qty = it?.quantity || 1;
        const variant = it?.variantTitle ? ` (${it.variantTitle})` : "";
        return `  • ${name}${variant} × ${qty}`;
      })
      .join("\n");
    const moreItems =
      items.length > 8 ? `\n  …and ${items.length - 8} more` : "";

    const customer =
      order.customerName ||
      order.customerEmail ||
      order.customerWhatsApp ||
      "Customer";
    const phoneLine = order.customerWhatsApp
      ? `\nPhone: ${order.customerWhatsApp}`
      : "";

    const message =
      `🛒 *New paid order on KiosCart*\n\n` +
      `Order: *${order.orderId}*\n` +
      `Customer: ${customer}${phoneLine}\n` +
      `Total: ₹${Number(order.totalAmount || 0).toFixed(2)}\n` +
      `Items:\n${itemLines}${moreItems}\n\n` +
      `Please confirm and start processing.\n\n` +
      `— KiosCart`;

    await this.otpService.sendWhatsAppMessage(String(phone), message);
    this.logger.log(
      `WhatsApp notify sent to shopkeeper ${shop._id} (${phone}) for order ${order.orderId}`,
    );
  }

  private async onPaymentFailed(payload: any) {
    const entity = payload?.payload?.payment?.entity;
    if (!entity) return;
    const payment = await this.paymentModel.findOne({
      gatewayOrderId: entity.order_id,
    });
    if (!payment) return;
    payment.status = PaymentStatus.Failed;
    payment.failedAt = new Date();
    payment.failureReason = entity.error_description || entity.error_reason;
    await payment.save();
    await this.orderModel.findByIdAndUpdate(payment.orderId, {
      paymentStatus: "failed",
    });
  }

  private async onTransferProcessed(payload: any) {
    const entity = payload?.payload?.transfer?.entity;
    if (!entity) return;
    const payment = await this.paymentModel.findOne({ transferId: entity.id });
    if (!payment) return;
    if (entity.on_hold === false || entity.on_hold === 0) {
      payment.transferStatus = TransferStatus.Released;
      payment.releasedAt = payment.releasedAt || new Date();
    }
    await payment.save();
  }

  private async onTransferFailed(payload: any) {
    const entity = payload?.payload?.transfer?.entity;
    if (!entity) return;
    const payment = await this.paymentModel.findOne({ transferId: entity.id });
    if (!payment) return;
    payment.transferStatus = TransferStatus.Failed;
    await payment.save();
  }

  private async onRefundProcessed(payload: any) {
    const entity = payload?.payload?.refund?.entity;
    if (!entity) return;
    const payment = await this.paymentModel.findOne({
      gatewayPaymentId: entity.payment_id,
    });
    if (!payment) return;
    payment.status = PaymentStatus.Refunded;
    payment.refundId = entity.id;
    payment.refundedAt = new Date();
    await payment.save();
    await this.orderModel.findByIdAndUpdate(payment.orderId, {
      paymentStatus: "refunded",
    });
  }
}
