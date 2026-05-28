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
import { OrdersService } from "../orders/orders.service";
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
    private readonly ordersService: OrdersService,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Shopkeeper.name)
    private readonly shopkeeperModel: Model<Shopkeeper>,
  ) {}

  /**
   * Step 1 of customer checkout. We do NOT create the Order yet — that
   * happens after Razorpay confirms capture, so abandoned modals don't
   * leave ghost orders in the shopkeeper's list. We snapshot the cart on
   * the Payment record and create the Razorpay order.
   */
  async createPaymentOrder(dto: CreatePaymentOrderDto, customerUserId?: string) {
    if (!dto.order) {
      throw new BadRequestException("Cart payload (order) is required.");
    }
    if (dto.order.shopkeeperId !== dto.shopkeeperId) {
      throw new BadRequestException(
        "shopkeeperId in cart payload must match top-level shopkeeperId.",
      );
    }

    const shop = await this.shopkeeperModel.findById(dto.shopkeeperId);
    if (!shop) throw new NotFoundException("Shopkeeper not found");

    // Direct is now the default. Only legacy shops with mode explicitly set
    // to "standard" or "route" (and an accountId from the old soft-onboarding)
    // still go through Route. Everyone else — including new shops whose
    // razorpay sub-doc hasn't been created yet — goes through Direct.
    const explicitMode = shop.razorpay?.mode;
    const isDirect =
      !explicitMode || explicitMode === "direct" || !shop.razorpay?.accountId;

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

    // Amount source: the cart's totalAmount. The Order doesn't exist yet,
    // so we trust the snapshot — but we also save it on the Payment so the
    // verify path uses the same amount that was charged. Re-pricing here
    // (e.g., re-summing items × server-side price) belongs in a later pass.
    const amount = Number(dto.order.totalAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      throw new BadRequestException("Cart has no valid total amount.");
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

    // Client-supplied human-readable orderId is used only as the receipt
    // tag — it identifies the cart in Razorpay's dashboard. The Mongo
    // Order._id doesn't exist yet (we'll mint it on capture).
    const cartTag = String(dto.order.orderId || `kc_${Date.now()}`).slice(0, 40);
    const result = await gateway.createOrder(
      {
        amount,
        currency,
        receipt: cartTag,
        notes: {
          kioscart_order_id: cartTag,
          shopkeeper_id: dto.shopkeeperId,
          ...(customerUserId ? { user_id: customerUserId } : {}),
        },
      },
      directCreds,
    );

    const payment = await this.paymentModel.create({
      // orderId left unset — populated when we materialize the Order on capture
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
      pendingOrderData: dto.order,
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
   * Step 2 of customer checkout. Verifies the Razorpay signature, then —
   * if no Order is linked yet — materializes the Order from the cart
   * snapshot. Idempotent: a second call (or a webhook racing this one)
   * is a no-op.
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
    }

    // Materialize the Order if it doesn't exist yet. This is the moment a
    // captured payment becomes a real order row visible to the shopkeeper.
    await this.ensureOrderForPayment(payment, dto.razorpayPaymentId);

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
      orderId: payment.orderId,
      transferId: payment.transferId,
      transferStatus: payment.transferStatus,
      ...(transferError ? { transferError } : {}),
    };
  }

  /**
   * Creates the Order from `pendingOrderData` if it hasn't been created
   * yet. Safe to call from both /payments/verify and the
   * payment.captured webhook — guards via payment.orderId presence.
   */
  async ensureOrderForPayment(
    payment: PaymentDocument,
    gatewayPaymentId?: string,
  ): Promise<PaymentDocument> {
    if (payment.orderId) return payment;
    if (!payment.pendingOrderData) {
      this.logger.warn(
        `Payment ${payment._id} captured but pendingOrderData missing — cannot materialize Order.`,
      );
      return payment;
    }

    const dto: any = {
      ...payment.pendingOrderData,
      paymentConfirmed: true,
      transactionId: gatewayPaymentId || payment.gatewayPaymentId,
    };

    const created: any = await this.ordersService.createOrder(dto);
    const newOrderId =
      created?._id || created?.id || created?.data?._id;
    if (!newOrderId) {
      this.logger.error(
        `ordersService.createOrder returned no _id for payment ${payment._id}`,
      );
      return payment;
    }

    await this.orderModel.findByIdAndUpdate(newOrderId, {
      paymentId: payment._id,
      paymentProvider: payment.gateway,
      paymentStatus: "paid",
      transactionId: gatewayPaymentId || payment.gatewayPaymentId,
    });

    payment.orderId = newOrderId as Types.ObjectId;
    payment.pendingOrderData = undefined;
    await payment.save();

    this.logger.log(
      `Order ${newOrderId} materialized from captured payment ${payment._id}`,
    );
    return payment;
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
