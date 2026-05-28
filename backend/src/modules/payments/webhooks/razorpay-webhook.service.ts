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
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
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
    const payment = await this.paymentModel.findOne({
      gatewayOrderId: entity.order_id,
    });
    if (!payment) {
      this.logger.warn(`No Payment record for order ${entity.order_id}`);
      return;
    }

    if (payment.status !== PaymentStatus.Captured) {
      payment.gatewayPaymentId = entity.id;
      payment.status = PaymentStatus.Captured;
      payment.capturedAt = new Date();
      await payment.save();
    }

    // Materialize the Order if the verify endpoint never ran (modal-close
    // race, browser crash, network drop). Idempotent: skipped if orderId
    // is already set.
    await this.checkoutService.ensureOrderForPayment(payment, entity.id);

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
