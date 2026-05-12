import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
  TransferStatus,
} from "./schemas/payment.schema";
import { Order } from "../orders/entities/order.entity";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { PaymentGatewayFactory } from "../payment-gateways/gateway.factory";
import { CreatePaymentOrderDto, VerifyPaymentDto } from "./dto/checkout.dto";
import { decryptSecret } from "../../common/secrets.util";

type RazorpayCreds = { keyId: string; keySecret: string } | undefined;

const COUNTRY_TO_CURRENCY: Record<string, "INR" | "SGD"> = {
  IN: "INR",
  SG: "SGD",
};

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly gatewayFactory: PaymentGatewayFactory,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Shopkeeper.name)
    private readonly shopkeeperModel: Model<Shopkeeper>,
  ) {}

  /**
   * Step 1 of customer checkout. Creates a Razorpay order on the partner
   * account and a Payment record we'll later attach the gateway payment +
   * transfer to.
   */
  async createPaymentOrder(dto: CreatePaymentOrderDto, customerUserId?: string) {
    const order = await this.orderModel.findById(dto.orderId);
    if (!order) throw new NotFoundException("Order not found");
    if (order.paymentStatus === "paid") {
      throw new BadRequestException("Order is already paid.");
    }

    const shop = await this.shopkeeperModel.findById(dto.shopkeeperId);
    if (!shop) throw new NotFoundException("Shopkeeper not found");

    const isDirect = shop.razorpay?.mode === "direct";

    if (isDirect) {
      if (!shop.razorpay?.directKeyId || !shop.razorpay?.directKeySecretEncrypted) {
        throw new BadRequestException(
          "Shopkeeper has not configured Razorpay Direct keys yet.",
        );
      }
      // Per-shop kill switch — toggle is OFF in Settings. Customer should
      // fall back to the QR flow, not see a Razorpay error.
      if (shop.razorpay.directEnabled === false) {
        throw new BadRequestException(
          "Card payments are currently disabled for this shop. Please use the QR code option.",
        );
      }
    } else {
      if (!shop.razorpay?.accountId) {
        throw new BadRequestException(
          "Shopkeeper has not completed payment-gateway onboarding.",
        );
      }
      if (shop.razorpay.status !== "active") {
        throw new BadRequestException(
          `Shopkeeper KYC is ${shop.razorpay.status}. Card payments unavailable until KYC is approved.`,
        );
      }
    }

    const country = (shop.country || shop.razorpay?.country || "IN").toUpperCase();
    const gateway = this.gatewayFactory.forCountry(country);
    const currency = (dto.currency || COUNTRY_TO_CURRENCY[country] || "INR") as
      | "INR"
      | "SGD";

    // SECURITY: amount comes from the persisted order, never the client.
    // Tampering protection — without this a customer can POST any amount.
    const amount = (order as any).totalAmount;
    if (typeof amount !== "number" || amount < 1) {
      throw new BadRequestException("Order has no valid total amount.");
    }
    const commissionPct = (shop as any).commissionPercentage ?? 2;
    const commission = Math.round(amount * commissionPct) / 100;
    const netAmount = Math.round((amount - commission) * 100) / 100;

    const directCreds: RazorpayCreds = isDirect
      ? {
          keyId: shop.razorpay!.directKeyId!,
          keySecret: decryptSecret(shop.razorpay!.directKeySecretEncrypted!),
        }
      : undefined;

    const result = await gateway.createOrder(
      {
        amount,
        currency,
        receipt: `kc_${order.orderId}`.slice(0, 40),
        notes: {
          kioscart_order_id: order.orderId,
          shopkeeper_id: dto.shopkeeperId,
          ...(customerUserId ? { user_id: customerUserId } : {}),
        },
      },
      directCreds,
    );

    const payment = await this.paymentModel.create({
      orderId: order._id,
      shopkeeperId: new Types.ObjectId(dto.shopkeeperId),
      gateway: gateway.providerName,
      gatewayMode: isDirect ? "direct" : "route",
      gatewayOrderId: result.gatewayOrderId,
      amount,
      commissionAmount: commission,
      netAmount,
      currency,
      country,
      status: PaymentStatus.Created,
      transferStatus: isDirect ? TransferStatus.Released : TransferStatus.Pending,
    });

    await this.orderModel.findByIdAndUpdate(order._id, {
      paymentId: payment._id,
      paymentProvider: gateway.providerName,
      paymentStatus: "pending",
    });

    return {
      paymentId: payment._id,
      gatewayOrderId: result.gatewayOrderId,
      amount,
      currency,
      keyId: isDirect
        ? shop.razorpay!.directKeyId
        : process.env.RAZORPAY_PARTNER_KEY_ID,
      shopkeeperAccountId: isDirect ? undefined : shop.razorpay?.accountId,
      mode: isDirect ? "direct" : "route",
      customer: {
        name: dto.customerName,
        email: dto.customerEmail,
        contact: dto.customerPhone,
      },
    };
  }

  /**
   * Step 2 of customer checkout. Verifies the signature returned by the
   * Razorpay SDK, marks Payment captured, then creates an on-hold Route
   * transfer to the shopkeeper's linked account (gross - commission).
   * Idempotent — a second call after the webhook has already run is a no-op.
   */
  async verifyPayment(dto: VerifyPaymentDto) {
    const payment = await this.paymentModel.findOne({
      gatewayOrderId: dto.razorpayOrderId,
    });
    if (!payment) throw new NotFoundException("Payment not found");

    const shop = await this.shopkeeperModel.findById(payment.shopkeeperId);
    const isDirect =
      (payment as any).gatewayMode === "direct" ||
      shop?.razorpay?.mode === "direct";

    const directCreds: RazorpayCreds =
      isDirect && shop?.razorpay?.directKeyId && shop?.razorpay?.directKeySecretEncrypted
        ? {
            keyId: shop.razorpay.directKeyId,
            keySecret: decryptSecret(shop.razorpay.directKeySecretEncrypted),
          }
        : undefined;

    const gateway = this.gatewayFactory.forProvider(payment.gateway);
    const ok = gateway.verifyPaymentSignature(
      {
        gatewayOrderId: dto.razorpayOrderId,
        gatewayPaymentId: dto.razorpayPaymentId,
        signature: dto.razorpaySignature,
      },
      directCreds,
    );
    if (!ok) throw new BadRequestException("Invalid payment signature");

    if (payment.status !== PaymentStatus.Captured) {
      payment.gatewayPaymentId = dto.razorpayPaymentId;
      payment.gatewaySignature = dto.razorpaySignature;
      payment.status = PaymentStatus.Captured;
      payment.capturedAt = new Date();
      if (isDirect) {
        payment.transferStatus = TransferStatus.Released;
        payment.releasedAt = new Date();
      }
      await payment.save();

      await this.orderModel.findByIdAndUpdate(payment.orderId, {
        paymentStatus: "paid",
        transactionId: dto.razorpayPaymentId,
      });
    }

    let transferError: string | undefined;
    if (
      !isDirect &&
      !payment.transferId &&
      payment.transferStatus !== TransferStatus.OnHold &&
      payment.transferStatus !== TransferStatus.Released
    ) {
      try {
        await this.createOnHoldTransferForPayment(payment);
      } catch (err: any) {
        transferError = err?.message || "Transfer creation failed";
        this.logger.warn(
          `Payment ${payment._id} captured but on-hold transfer failed: ${transferError}. ` +
            `Will be retried by webhook handler.`,
        );
      }
    }

    return {
      success: true,
      paymentId: payment._id,
      transferId: payment.transferId,
      transferStatus: payment.transferStatus,
      ...(transferError ? { transferError } : {}),
    };
  }

  /**
   * Earnings summary for a shopkeeper. Held = sum of net awaiting admin
   * release. LifetimeReleased = sum of net already released. The
   * dashboard widget reads this.
   */
  async earningsSummaryFor(shopkeeperId: string) {
    const objectId = new Types.ObjectId(shopkeeperId);
    const result = await this.paymentModel.aggregate([
      { $match: { shopkeeperId: objectId } },
      {
        $group: {
          _id: { currency: "$currency", transferStatus: "$transferStatus" },
          total: { $sum: "$netAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const summary: Record<string, { held: number; released: number; pendingCapture: number; count: number }> = {};
    for (const row of result) {
      const cur = row._id.currency;
      if (!summary[cur])
        summary[cur] = { held: 0, released: 0, pendingCapture: 0, count: 0 };
      summary[cur].count += row.count;
      if (row._id.transferStatus === "on_hold") summary[cur].held += row.total;
      else if (row._id.transferStatus === "released")
        summary[cur].released += row.total;
      else if (row._id.transferStatus === "pending")
        summary[cur].pendingCapture += row.total;
    }
    return summary;
  }

  /**
   * Internal helper. Creates the on-hold Route transfer to the shopkeeper.
   * Safe to call from either the verify endpoint or the payment.captured
   * webhook — guards against double-creation via transferId presence.
   */
  async createOnHoldTransferForPayment(payment: PaymentDocument) {
    if (payment.transferId) return payment;
    if (!payment.gatewayPaymentId) {
      throw new BadRequestException(
        "Cannot create transfer: payment not yet captured.",
      );
    }

    const shop = await this.shopkeeperModel.findById(payment.shopkeeperId);
    if (!shop?.razorpay?.accountId) {
      throw new BadRequestException(
        "Shopkeeper linked account missing for transfer.",
      );
    }

    const gateway = this.gatewayFactory.forProvider(payment.gateway);
    const transfer = await gateway.createOnHoldTransfer({
      paymentId: payment.gatewayPaymentId,
      linkedAccountId: shop.razorpay.accountId,
      amount: payment.netAmount,
      currency: "INR",
      notes: {
        kioscart_payment_id: String(payment._id),
        kioscart_order_id: String(payment.orderId),
      },
    });

    payment.transferId = transfer.transferId;
    payment.transferStatus = TransferStatus.OnHold;
    payment.heldAt = new Date();
    await payment.save();
    this.logger.log(
      `On-hold transfer ${transfer.transferId} created for payment ${payment._id}`,
    );
    return payment;
  }
}
