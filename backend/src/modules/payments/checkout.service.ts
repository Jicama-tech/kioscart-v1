import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
  TransferStatus,
} from "./schemas/payment.schema";
import {
  CheckoutIntent,
  CheckoutIntentDocument,
} from "./schemas/checkout-intent.schema";
import { Order } from "../orders/entities/order.entity";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { PaymentGatewayFactory } from "../payment-gateways/gateway.factory";
import {
  CreatePaymentOrderDto,
  InitiateRazorpayPaymentDto,
  VerifyPaymentDto,
} from "./dto/checkout.dto";
import { decryptSecret } from "../../common/secrets.util";
import { OrdersService } from "../orders/orders.service";

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
    @InjectModel(CheckoutIntent.name)
    private readonly checkoutIntentModel: Model<CheckoutIntentDocument>,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
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

  // -------------------------------------------------------------------
  //  LAZY-CREATION FLOW — preferred path for Razorpay checkout
  // -------------------------------------------------------------------

  /**
   * Razorpay checkout step 1 — `initiate`. The customer hits "Pay with
   * Razorpay"; we create the Razorpay order and stash the full cart
   * payload in a CheckoutIntent. NO Order or Payment doc is written here.
   * If the customer abandons, the intent TTL-expires and the DB stays clean.
   */
  async initiateRazorpayPayment(
    dto: InitiateRazorpayPaymentDto,
    customerUserId?: string,
  ) {
    const shop = await this.shopkeeperModel.findById(dto.shopkeeperId);
    if (!shop) throw new NotFoundException("Shopkeeper not found");

    // Three flavors of Razorpay checkout, decided by shop.razorpay.mode:
    //   "platform" — use KiosCart's keys (from env); money pools in our
    //                master account; admin disburses to shop manually
    //   "direct"   — use shop's pasted keys; money goes to shop's own account
    //   "route"    — use KiosCart's keys; money split to shop's linked account
    const mode: "platform" | "direct" | "route" =
      shop.razorpay?.mode === "platform"
        ? "platform"
        : shop.razorpay?.mode === "direct"
          ? "direct"
          : "route";
    const isPlatform = mode === "platform";
    const isDirect = mode === "direct";

    if (isDirect) {
      if (
        !shop.razorpay?.directKeyId ||
        !shop.razorpay?.directKeySecretEncrypted
      ) {
        throw new BadRequestException(
          "Shopkeeper has not configured Razorpay Direct keys yet.",
        );
      }
      if (shop.razorpay.directEnabled === false) {
        throw new BadRequestException(
          "Card payments are currently disabled for this shop. Please use the QR code option.",
        );
      }
    } else if (!isPlatform) {
      // Route mode — needs a linked account
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
    // Platform mode has zero shop-side requirements — checkout always works.

    const country = (
      shop.country ||
      shop.razorpay?.country ||
      "IN"
    ).toUpperCase();
    const gateway = this.gatewayFactory.forCountry(country);
    const currency = (dto.currency ||
      COUNTRY_TO_CURRENCY[country] ||
      "INR") as "INR" | "SGD";

    const amount = dto.totalAmount;
    if (typeof amount !== "number" || amount < 1) {
      throw new BadRequestException("Invalid totalAmount");
    }
    const commissionPct = (shop as any).commissionPercentage ?? 2;
    const commission = Math.round(amount * commissionPct) / 100;
    const netAmount = Math.round((amount - commission) * 100) / 100;

    // Only direct mode passes per-shop creds. Platform + route both use
    // the env-level keys baked into the gateway constructor.
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
        receipt: `kc_${dto.orderId}`.slice(0, 40),
        notes: {
          kioscart_order_id: dto.orderId,
          shopkeeper_id: dto.shopkeeperId,
          gateway_mode: mode,
          ...(customerUserId ? { user_id: customerUserId } : {}),
        },
      },
      directCreds,
    );

    await this.checkoutIntentModel.create({
      gatewayOrderId: result.gatewayOrderId,
      shopkeeperId: new Types.ObjectId(dto.shopkeeperId),
      customerWhatsApp: dto.customerWhatsApp,
      customerName: dto.customerName || dto.fullName,
      customerEmail: dto.customerEmail,
      orderId: dto.orderId,
      items: dto.items,
      totalAmount: dto.totalAmount,
      orderType: dto.orderType,
      deliveryAddress: dto.deliveryAddress,
      pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : undefined,
      pickupTime: dto.pickupTime,
      couponCode: dto.couponCode,
      instructions: dto.instructions,
      amount,
      currency,
      commissionAmount: commission,
      netAmount,
      gatewayMode: mode,
      shopkeeperAccountId: isPlatform || isDirect
        ? undefined
        : shop.razorpay?.accountId,
      rawGatewayOrder: result.raw,
    });

    return {
      gatewayOrderId: result.gatewayOrderId,
      amount,
      currency,
      keyId: isDirect
        ? shop.razorpay!.directKeyId
        : process.env.RAZORPAY_PARTNER_KEY_ID,
      shopkeeperAccountId: isPlatform || isDirect
        ? undefined
        : shop.razorpay?.accountId,
      mode,
      customer: {
        name: dto.customerName || dto.fullName,
        email: dto.customerEmail,
        contact: dto.customerWhatsApp,
      },
    };
  }

  /**
   * Razorpay checkout step 2 — `verify-and-create`. Frontend calls this from
   * the Razorpay SDK's onSuccess. We verify the signature, then materialize
   * the Order + Payment from the stashed intent. Idempotent:
   *  - If an Order with this gatewayOrderId already exists (because the
   *    webhook beat the frontend to it), we return it without redoing work.
   *  - The Order schema has a unique sparse index on gatewayOrderId, so
   *    even concurrent calls can't double-create.
   */
  async verifyAndCreateOrder(dto: VerifyPaymentDto) {
    const gatewayOrderId = dto.razorpayOrderId;

    // ---- Idempotency short-circuit ----
    const existingOrder: any = await this.orderModel.findOne({ gatewayOrderId });
    if (existingOrder) {
      const existingPayment = await this.paymentModel.findOne({
        gatewayOrderId,
      });
      return {
        success: true,
        orderId: existingOrder._id,
        publicOrderId: existingOrder.orderId,
        paymentId: existingPayment?._id,
        transferId: existingPayment?.transferId,
        transferStatus: existingPayment?.transferStatus,
        alreadyProcessed: true,
      };
    }

    const intent = await this.checkoutIntentModel.findOne({ gatewayOrderId });
    if (!intent) {
      throw new NotFoundException(
        "Checkout intent not found — may have expired or already been consumed.",
      );
    }

    // ---- Verify signature ----
    const shop = await this.shopkeeperModel.findById(intent.shopkeeperId);
    const isDirect = intent.gatewayMode === "direct";
    const isPlatform = intent.gatewayMode === "platform";
    const directCreds: RazorpayCreds =
      isDirect &&
      shop?.razorpay?.directKeyId &&
      shop?.razorpay?.directKeySecretEncrypted
        ? {
            keyId: shop.razorpay.directKeyId,
            keySecret: decryptSecret(shop.razorpay.directKeySecretEncrypted),
          }
        : undefined;
    const gateway = this.gatewayFactory.forProvider("razorpay");
    const ok = gateway.verifyPaymentSignature(
      {
        gatewayOrderId,
        gatewayPaymentId: dto.razorpayPaymentId,
        signature: dto.razorpaySignature,
      },
      directCreds,
    );
    if (!ok) throw new BadRequestException("Invalid payment signature");

    // ---- Create the actual Order (delegates inventory deduct, user create, etc.) ----
    let order: any;
    try {
      order = await this.ordersService.createOrder({
        orderId: intent.orderId,
        shopkeeperId: String(intent.shopkeeperId),
        items: intent.items as any,
        totalAmount: intent.totalAmount,
        orderType: intent.orderType as any,
        deliveryAddress: intent.deliveryAddress as any,
        pickupDate: intent.pickupDate?.toISOString(),
        pickupTime: intent.pickupTime,
        couponCode: intent.couponCode,
        instructions: intent.instructions,
        whatsAppNumber: intent.customerWhatsApp,
        fullName: intent.customerName,
        paymentConfirmed: true,
        transactionId: dto.razorpayPaymentId,
      } as any);
    } catch (err: any) {
      // Duplicate-key on gatewayOrderId index = a concurrent caller (webhook)
      // beat us to it. Re-read and return.
      if (err?.code === 11000) {
        const dup: any = await this.orderModel.findOne({ gatewayOrderId });
        if (dup) {
          const dupPay = await this.paymentModel.findOne({ gatewayOrderId });
          return {
            success: true,
            orderId: dup._id,
            publicOrderId: dup.orderId,
            paymentId: dupPay?._id,
            transferId: dupPay?.transferId,
            transferStatus: dupPay?.transferStatus,
            alreadyProcessed: true,
          };
        }
      }
      throw err;
    }

    // Tag the Order with gatewayOrderId so future calls can dedupe + mark paid
    await this.orderModel.findByIdAndUpdate(order._id, {
      gatewayOrderId,
      paymentProvider: "razorpay",
      paymentStatus: "paid",
    });

    // ---- Create Payment doc directly in CAPTURED state ----
    const payment = await this.paymentModel.create({
      orderId: order._id,
      shopkeeperId: intent.shopkeeperId,
      gateway: "razorpay",
      gatewayMode: intent.gatewayMode,
      gatewayOrderId,
      gatewayPaymentId: dto.razorpayPaymentId,
      gatewaySignature: dto.razorpaySignature,
      amount: intent.amount,
      commissionAmount: intent.commissionAmount,
      netAmount: intent.netAmount,
      currency: intent.currency,
      country: shop?.country || "IN",
      status: PaymentStatus.Captured,
      capturedAt: new Date(),
      // Platform mode: nothing transfers (money pools in KiosCart's master,
      // admin disburses out-of-band) — transferStatus stays "none".
      // Direct mode: payment goes straight to shop's account — "released".
      // Route mode: needs explicit on-hold transfer — "pending" until that runs.
      transferStatus: isPlatform
        ? TransferStatus.None
        : isDirect
          ? TransferStatus.Released
          : TransferStatus.Pending,
      ...(isDirect ? { releasedAt: new Date() } : {}),
    });

    await this.orderModel.findByIdAndUpdate(order._id, {
      paymentId: payment._id,
    });

    // ---- Create on-hold Route transfer if applicable ----
    let transferError: string | undefined;
    // Skip transfer entirely for platform (no Route account) and direct
    // (money already in shop's account). Only Route mode creates one.
    if (!isDirect && !isPlatform) {
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

    // ---- Intent's job is done ----
    await this.checkoutIntentModel.deleteOne({ _id: intent._id });

    return {
      success: true,
      orderId: order._id,
      publicOrderId: intent.orderId,
      paymentId: payment._id,
      transferId: payment.transferId,
      transferStatus: payment.transferStatus,
      ...(transferError ? { transferError } : {}),
    };
  }

  /**
   * Webhook fallback: payment.captured arrived but no Payment record exists
   * yet (frontend verify never reached us — ngrok died, customer's tab
   * crashed, etc.). Same effect as `verifyAndCreateOrder` but uses the
   * webhook payload instead of frontend-supplied signature. Razorpay already
   * verified the event signature in the controller.
   */
  async finalizeFromWebhook(
    gatewayOrderId: string,
    gatewayPaymentId: string,
  ): Promise<{ created: boolean; orderId?: any; paymentId?: any }> {
    const existing: any = await this.orderModel.findOne({ gatewayOrderId });
    if (existing) {
      const pay = await this.paymentModel.findOne({ gatewayOrderId });
      return { created: false, orderId: existing._id, paymentId: pay?._id };
    }

    const intent = await this.checkoutIntentModel.findOne({ gatewayOrderId });
    if (!intent) {
      this.logger.warn(
        `Webhook payment.captured for ${gatewayOrderId}: no intent found, ` +
          `cannot create Order (intent may have expired).`,
      );
      return { created: false };
    }

    const shop = await this.shopkeeperModel.findById(intent.shopkeeperId);

    let order: any;
    try {
      order = await this.ordersService.createOrder({
        orderId: intent.orderId,
        shopkeeperId: String(intent.shopkeeperId),
        items: intent.items as any,
        totalAmount: intent.totalAmount,
        orderType: intent.orderType as any,
        deliveryAddress: intent.deliveryAddress as any,
        pickupDate: intent.pickupDate?.toISOString(),
        pickupTime: intent.pickupTime,
        couponCode: intent.couponCode,
        instructions: intent.instructions,
        whatsAppNumber: intent.customerWhatsApp,
        fullName: intent.customerName,
        paymentConfirmed: true,
        transactionId: gatewayPaymentId,
      } as any);
    } catch (err: any) {
      if (err?.code === 11000) {
        const dup: any = await this.orderModel.findOne({ gatewayOrderId });
        if (dup) {
          const dupPay = await this.paymentModel.findOne({ gatewayOrderId });
          return { created: false, orderId: dup._id, paymentId: dupPay?._id };
        }
      }
      throw err;
    }

    await this.orderModel.findByIdAndUpdate(order._id, {
      gatewayOrderId,
      paymentProvider: "razorpay",
      paymentStatus: "paid",
    });

    const isDirect = intent.gatewayMode === "direct";
    const isPlatform = intent.gatewayMode === "platform";
    const payment = await this.paymentModel.create({
      orderId: order._id,
      shopkeeperId: intent.shopkeeperId,
      gateway: "razorpay",
      gatewayMode: intent.gatewayMode,
      gatewayOrderId,
      gatewayPaymentId,
      amount: intent.amount,
      commissionAmount: intent.commissionAmount,
      netAmount: intent.netAmount,
      currency: intent.currency,
      country: shop?.country || "IN",
      status: PaymentStatus.Captured,
      capturedAt: new Date(),
      transferStatus: isPlatform
        ? TransferStatus.None
        : isDirect
          ? TransferStatus.Released
          : TransferStatus.Pending,
      ...(isDirect ? { releasedAt: new Date() } : {}),
    });

    await this.orderModel.findByIdAndUpdate(order._id, {
      paymentId: payment._id,
    });

    if (!isDirect && !isPlatform) {
      try {
        await this.createOnHoldTransferForPayment(payment);
      } catch (err: any) {
        this.logger.warn(
          `Webhook fallback: transfer create failed for ${payment._id}: ${err.message}`,
        );
      }
    }

    await this.checkoutIntentModel.deleteOne({ _id: intent._id });

    return { created: true, orderId: order._id, paymentId: payment._id };
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
