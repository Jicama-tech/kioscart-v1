import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { randomBytes } from "crypto";
import { Model, Types } from "mongoose";
import { Order } from "../orders/entities/order.entity";
import { OrdersService } from "../orders/orders.service";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { KioskPayment, KioskPaymentDocument } from "./kiosk-payment.schema";
import { payNowImageUrl, qrKindFor, qrSetupHint } from "./kiosk-payment-qr";

const LIFETIME_MS = 48 * 60 * 60 * 1000;
const CURRENCY_BY_COUNTRY: Record<string, string> = { IN: "INR", SG: "SGD" };

export interface NewKioskPayment {
  source: "kioscart-kiosk" | "combox-kiosk";
  externalRef?: string;
  amount: number;
  currency?: string | null;
  customerName?: string;
  customerWhatsApp?: string;
  lines: { name: string; quantity: number; lineTotal: number; option?: string | null }[];
  // the order to place once paid (OrdersService.createOrder input), with its public reference in orderId
  order: Record<string, any>;
}

/**
 * Kiosk sales paid by QR (PayNow / UPI): "Payment pending" until the customer presses "I have paid" on the payment
 * link, or the staff confirm it at the kiosk. Only then is the order placed, so it appears in Orders.
 */
@Injectable()
export class KioskPaymentsService {
  private readonly logger = new Logger(KioskPaymentsService.name);

  constructor(
    @InjectModel(KioskPayment.name) private readonly paymentModel: Model<KioskPaymentDocument>,
    @InjectModel(Shopkeeper.name) private readonly shopModel: Model<Shopkeeper>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * The shop id as the ObjectId payments are stored with. Queries must use it: a plain string is not cast on this
   * path, so `{ shopkeeperId: "<hex>" }` matches nothing and a payment just created is "not found" (and, with the
   * unique shop + externalRef index, a repeated externalRef fails instead of returning the same payment).
   */
  private shopOid(shopkeeperId: string | Types.ObjectId): Types.ObjectId {
    return new Types.ObjectId(String(shopkeeperId));
  }

  private async loadShop(shopkeeperId: string | Types.ObjectId): Promise<any> {
    const shop: any = await this.shopModel.findById(shopkeeperId).select("shopName country phone paymentURL").lean();
    if (!shop) throw new NotFoundException("Shop not found");
    return shop;
  }

  /** Whether this shop can take QR payments, which kind, and what to set up if not. */
  async qrSupport(shopkeeperId: string) {
    const shop = await this.loadShop(shopkeeperId);
    const kind = qrKindFor(shop);
    return { qr: kind !== null, qrKind: kind, qrSetup: kind ? null : qrSetupHint(shop) };
  }

  /** Puts a sale on "Payment pending". The same externalRef again returns the same payment. */
  async create(shopkeeperId: string, input: NewKioskPayment) {
    const shop = await this.loadShop(shopkeeperId);
    if (!qrKindFor(shop)) throw new BadRequestException(`QR payment is not set up for this shop. ${qrSetupHint(shop)}`);
    if (!(input.amount > 0)) throw new BadRequestException("The amount must be more than zero.");

    if (input.externalRef) {
      const existing = await this.paymentModel.findOne({ shopkeeperId: this.shopOid(shopkeeperId), externalRef: input.externalRef }).lean();
      if (existing) return this.present(existing, shop);
    }

    const orderRef = String(input.order.orderId || "").trim();
    if (!orderRef) throw new BadRequestException("The order has no reference.");

    try {
      const payment = await this.paymentModel.create({
        shopkeeperId: this.shopOid(shopkeeperId),
        token: randomBytes(18).toString("base64url"),
        status: "pending",
        source: input.source,
        externalRef: input.externalRef,
        amount: Math.round(input.amount * 100) / 100,
        currency: input.currency || CURRENCY_BY_COUNTRY[String(shop.country || "IN").toUpperCase()] || null,
        customerName: input.customerName,
        customerWhatsApp: input.customerWhatsApp,
        lines: input.lines,
        order: { ...input.order, shopkeeperId: String(shopkeeperId), paymentMethod: "qr" },
        orderRef,
        expiresAt: new Date(Date.now() + LIFETIME_MS),
      });
      return this.present(payment.toObject(), shop);
    } catch (e: any) {
      // two identical requests at once: the unique index let one through
      if (input.externalRef && /E11000/.test(String(e?.message))) {
        const existing = await this.paymentModel.findOne({ shopkeeperId: this.shopOid(shopkeeperId), externalRef: input.externalRef }).lean();
        if (existing) return this.present(existing, shop);
      }
      throw e;
    }
  }

  /** The shop's payments, newest first: by default the ones still waiting and those settled in the last day. */
  async list(shopkeeperId: string, opts: { source?: string; status?: string } = {}) {
    await this.expireStale(shopkeeperId);
    const filter: any = { shopkeeperId: this.shopOid(shopkeeperId) };
    if (opts.source) filter.source = opts.source;
    if (opts.status) {
      filter.status = opts.status;
    } else {
      filter.$or = [{ status: "pending" }, { updatedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }];
    }
    const [payments, shop] = await Promise.all([
      this.paymentModel.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
      this.loadShop(shopkeeperId),
    ]);
    return { payments: payments.map((p) => this.present(p, shop)) };
  }

  async getForShop(shopkeeperId: string, id: string) {
    const payment = await this.findForShop(shopkeeperId, id);
    return this.present(payment, await this.loadShop(shopkeeperId));
  }

  /** Staff at the kiosk saw the payment: the order is placed (also for a link that has just expired). */
  async markPaidByStaff(shopkeeperId: string, id: string) {
    const payment = await this.findForShop(shopkeeperId, id);
    return this.settle(payment, "staff");
  }

  async cancel(shopkeeperId: string, id: string) {
    const payment = await this.findForShop(shopkeeperId, id);
    const updated = await this.paymentModel
      .findOneAndUpdate({ _id: payment._id, status: { $in: ["pending", "expired"] } }, { $set: { status: "cancelled" } }, { new: true })
      .lean();
    if (!updated) throw new BadRequestException(`This payment is already ${payment.status}.`);
    return this.present(updated, await this.loadShop(shopkeeperId));
  }

  // ---- the customer's payment page ----------------------------------------

  async publicView(token: string) {
    const payment = await this.findByToken(token);
    const shop = await this.loadShop(payment.shopkeeperId);
    const view = this.present(payment, shop);
    return {
      shopName: shop.shopName || "Shop",
      country: String(shop.country || "IN").toUpperCase(),
      status: view.status,
      amount: view.amount,
      currency: view.currency,
      customerName: view.customerName,
      lines: view.lines,
      orderRef: view.orderRef,
      qr: view.qr,
      expiresAt: view.expiresAt,
      paidAt: view.paidAt,
    };
  }

  /** The customer pressed "I have paid": the order is placed. */
  async markPaidByCustomer(token: string) {
    const payment = await this.findByToken(token);
    const result = await this.settle(payment, "customer");
    return { status: result.status, orderRef: result.orderRef };
  }

  // ---- internals ------------------------------------------------------------

  private async findForShop(shopkeeperId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Payment not found");
    const payment = await this.paymentModel.findOne({ _id: new Types.ObjectId(id), shopkeeperId: this.shopOid(shopkeeperId) }).lean();
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  private async findByToken(token: string) {
    const payment = await this.paymentModel.findOne({ token: String(token || "") }).lean();
    if (!payment) throw new NotFoundException("This payment link does not exist.");
    if (payment.status === "pending" && new Date(payment.expiresAt).getTime() < Date.now()) {
      await this.paymentModel.updateOne({ _id: payment._id, status: "pending" }, { $set: { status: "expired" } });
      return { ...payment, status: "expired" as const };
    }
    return payment;
  }

  private async expireStale(shopkeeperId: string) {
    await this.paymentModel.updateMany({ shopkeeperId: this.shopOid(shopkeeperId), status: "pending", expiresAt: { $lt: new Date() } }, { $set: { status: "expired" } });
  }

  /**
   * Marks the payment paid and places its order, once: whoever confirms first places it, a second confirmation just
   * returns it. If the order cannot be placed (e.g. an item ran out meanwhile) the payment goes back to pending.
   */
  private async settle(payment: any, by: "customer" | "staff") {
    const shop = await this.loadShop(payment.shopkeeperId);
    if (payment.status === "paid") return this.present(payment, shop);

    const open = by === "staff" ? ["pending", "expired"] : ["pending"];
    const claimed: any = await this.paymentModel
      .findOneAndUpdate(
        { _id: payment._id, status: { $in: open }, ...(by === "customer" ? { expiresAt: { $gt: new Date() } } : {}) },
        { $set: { status: "paid", paidAt: new Date(), paidBy: by } },
        { new: true },
      )
      .lean();

    if (!claimed) {
      const now: any = await this.paymentModel.findById(payment._id).lean();
      if (now?.status === "paid") return this.present(now, shop);
      if (now?.status === "cancelled") throw new BadRequestException("This payment was cancelled by the shop.");
      throw new BadRequestException("This payment link has expired. Please ask the shop for a new one.");
    }

    try {
      const order: any = await this.ordersService.createOrder({
        ...claimed.order,
        orderId: claimed.orderRef,
        paymentMethod: "qr",
        paymentProvider: "manual",
        paymentStatus: "paid",
        paymentConfirmed: true,
      } as any);
      const placed: any = await this.paymentModel
        .findByIdAndUpdate(claimed._id, { $set: { orderMongoId: String(order?._id || "") } }, { new: true })
        .lean();
      return this.present(placed || claimed, shop);
    } catch (e: any) {
      // placed already by an earlier attempt (the order's integrationRef is unique per shop)
      const ref = claimed.order?.integrationRef;
      if (ref && /E11000/.test(String(e?.message))) {
        const existing: any = await this.orderModel.findOne({ shopkeeperId: claimed.order.shopkeeperId, integrationRef: ref }).lean();
        if (existing) {
          await this.paymentModel.updateOne({ _id: claimed._id }, { $set: { orderMongoId: String(existing._id) } });
          return this.present({ ...claimed, orderMongoId: String(existing._id) }, shop);
        }
      }
      await this.paymentModel.updateOne({ _id: claimed._id, status: "paid" }, { $set: { status: payment.status }, $unset: { paidAt: 1, paidBy: 1 } });
      this.logger.warn(`Kiosk payment ${claimed._id}: the order could not be placed: ${e?.message}`);
      throw new BadRequestException(String(e?.message || "The order could not be placed.").replace(/^Failed to create order: /, ""));
    }
  }

  present(p: any, shop: any) {
    const base = (process.env.FRONTEND_URL || "https://kioscart.com").replace(/\/+$/, "");
    const kind = qrKindFor(shop);
    return {
      id: String(p._id),
      status: p.status,
      source: p.source,
      amount: p.amount,
      currency: p.currency || null,
      customerName: p.customerName || null,
      customerWhatsApp: p.customerWhatsApp || null,
      lines: p.lines || [],
      orderRef: p.orderRef,
      orderPlaced: !!p.orderMongoId,
      payUrl: `${base}/kiosk-pay/${p.token}`,
      qr: {
        kind,
        // PayNow: an image of the QR with the amount; UPI: the shop's uploaded QR, read on the payment page
        imageUrl: kind === "paynow" ? payNowImageUrl(shop.phone, p.amount, p.orderRef, new Date(p.expiresAt)) : null,
        upiQrPath: kind === "upi" ? shop.paymentURL || null : null,
      },
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      paidAt: p.paidAt || null,
      paidBy: p.paidBy || null,
    };
  }
}
