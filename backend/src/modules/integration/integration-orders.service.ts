import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Order } from "../orders/entities/order.entity";
import { OrderType } from "../orders/dto/create-order.dto";
import { OrdersService } from "../orders/orders.service";
import { Product } from "../products/entities/product.entity";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { RazorpayGateway } from "../payment-gateways/razorpay.gateway";
import { decryptSecret } from "../../common/secrets.util";
import {
  IntegrationCreateOrderDto,
  IntegrationQuoteDto,
} from "./dto/integration-order.dto";
import {
  OrderPricingError,
  PricedLine,
  Totals,
  priceLine,
  totalsFor,
} from "./integration-pricing";

const CURRENCY_BY_COUNTRY: Record<string, "INR" | "SGD"> = { IN: "INR", SG: "SGD" };
const PAYMENT_LINK_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_REFRESH_PER_CALL = 20;

/**
 * Orders placed by a chat integration (ComBox) on behalf of a customer on WhatsApp.
 *
 * Everything that costs money is decided here, never by the caller: prices, delivery fee, discount and tax come from
 * the shop's data (integration-pricing.ts). Stock is checked before anything is created, repeating a request with the
 * same externalRef returns the same order, and the order is created through OrdersService.createOrder so inventory,
 * customer records and the shop-owner notification behave exactly as for a storefront order.
 */
@Injectable()
export class IntegrationOrdersService {
  private readonly logger = new Logger(IntegrationOrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Shopkeeper.name) private readonly shopModel: Model<Shopkeeper>,
    private readonly ordersService: OrdersService,
    private readonly razorpay: RazorpayGateway,
  ) {}

  // ---- helpers ----------------------------------------------------------

  private async loadShop(shopkeeperId: string): Promise<any> {
    const shop: any = await this.shopModel
      .findById(shopkeeperId)
      .select(
        "shopName country taxPercentage discountPercentage deliveryEnabled deliveryRules razorpay shopClosedFromDate shopClosedToDate",
      )
      .lean();
    if (!shop) throw new NotFoundException("Shop not found");
    return shop;
  }

  private assertOpen(shop: any) {
    const from = shop.shopClosedFromDate ? new Date(shop.shopClosedFromDate) : null;
    const to = shop.shopClosedToDate ? new Date(shop.shopClosedToDate) : null;
    const now = new Date();
    if (from && to && now >= from && now <= new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1)) {
      throw new BadRequestException(
        `The shop is closed until ${to.toISOString().slice(0, 10)}. Orders can be placed after it reopens.`,
      );
    }
  }

  /** Direct-mode Razorpay keys, when this shop can take a payment link. */
  private paymentLinkCreds(shop: any): { keyId: string; keySecret: string } | null {
    const rz = shop.razorpay;
    const direct = !rz?.mode || rz.mode === "direct" || !rz?.accountId;
    if (!direct || rz?.directEnabled === false) return null;
    if (!rz?.directKeyId || !rz?.directKeySecretEncrypted) return null;
    return { keyId: rz.directKeyId, keySecret: decryptSecret(rz.directKeySecretEncrypted) };
  }

  private canTakeOnline(shop: any): boolean {
    const country = String(shop.country || "IN").toUpperCase();
    return country === "IN" && this.paymentLinkCreds(shop) !== null;
  }

  private async priceBasket(shopkeeperId: string, shop: any, dto: IntegrationQuoteDto) {
    const orderType = dto.orderType || "delivery";
    if (orderType === "delivery" && shop.deliveryEnabled === false) {
      throw new BadRequestException("This shop does not deliver. Choose pickup instead.");
    }

    const ids = [...new Set(dto.items.map((i) => i.productId))];
    // products.shopkeeperId is stored as a string; the shop comes from the API key, never from the request
    const products = await this.productModel
      .find({ _id: { $in: ids }, shopkeeperId: String(shopkeeperId), isSoftDeleted: { $ne: true } })
      .lean();
    const byId = new Map(products.map((p: any) => [String(p._id), p]));

    // The same product and choice twice is one line, so stock is checked against the combined quantity
    const merged = new Map<string, any>();
    for (const item of dto.items) {
      const key = [item.productId, item.optionTitle || "", item.subcategoryName || "", item.variantTitle || ""].join("|");
      const seen = merged.get(key);
      merged.set(key, seen ? { ...seen, quantity: seen.quantity + item.quantity } : { ...item });
    }

    let lines: PricedLine[];
    try {
      lines = [...merged.values()].map((item) => {
        const product = byId.get(item.productId);
        if (!product) throw new OrderPricingError("One of the products was not found in this shop.");
        return priceLine(product, item);
      });
    } catch (e) {
      if (e instanceof OrderPricingError) throw new BadRequestException(e.message);
      throw e;
    }

    return { lines, totals: totalsFor(shop, lines, orderType), orderType };
  }

  private presentOrder(order: any) {
    return {
      id: String(order._id),
      orderId: order.orderId,
      status: order.status,
      paymentMethod: order.paymentMethod || null,
      paymentStatus: order.paymentStatus || "pending",
      paymentUrl: order.paymentMethod === "online" && order.paymentStatus === "pending" ? order.paymentLinkUrl || null : null,
      transactionId: order.transactionId || null,
      totalAmount: order.totalAmount,
      orderType: order.orderType,
      createdAt: order.createdAt,
    };
  }

  // ---- quote ------------------------------------------------------------

  async quote(shopkeeperId: string, dto: IntegrationQuoteDto) {
    const shop = await this.loadShop(shopkeeperId);
    this.assertOpen(shop);
    const { lines, totals, orderType } = await this.priceBasket(shopkeeperId, shop, dto);

    return {
      currency: CURRENCY_BY_COUNTRY[String(shop.country || "IN").toUpperCase()] || null,
      orderType,
      lines: lines.map((l) => ({
        productId: l.productId,
        name: l.productName,
        quantity: l.quantity,
        unitPrice: l.price,
        lineTotal: l.lineTotal,
        option: l.optionTitle || null,
        type: l.subcategoryName || null,
        variant: l.variantTitle || null,
      })),
      totals,
      paymentMethods: { cod: true, online: this.canTakeOnline(shop), cash: true },
    };
  }

  // ---- create -----------------------------------------------------------

  async create(shopkeeperId: string, dto: IntegrationCreateOrderDto) {
    // A repeated request (same externalRef) is the same order, not a second one
    if (dto.externalRef) {
      const existing = await this.orderModel.findOne({ shopkeeperId, integrationRef: dto.externalRef, isSoftDeleted: { $ne: true } }).lean();
      if (existing) return { created: false, order: this.presentOrder(existing) };
    }

    const shop = await this.loadShop(shopkeeperId);
    this.assertOpen(shop);
    const { lines, totals, orderType } = await this.priceBasket(shopkeeperId, shop, dto);

    if (dto.paymentMethod === "online" && !this.canTakeOnline(shop)) {
      throw new BadRequestException(
        "Online payment is not available for this shop. Choose pay on delivery (cod).",
      );
    }
    if (!(totals.total > 0)) throw new BadRequestException("The order total must be more than zero.");

    const digits = dto.customer.whatsAppNumber.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      throw new BadRequestException("whatsAppNumber must be a phone number with country code.");
    }
    const whatsAppNumber = `+${digits}`;

    const slug = String(shop.shopName || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "store";
    const orderRef = `${slug}-order-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;

    const online = dto.paymentMethod === "online";

    // The payment link comes first: if Razorpay refuses, nothing has been created or reserved, so there is nothing to undo.
    let paymentLink: { id: string; shortUrl: string } | null = null;
    if (online) {
      try {
        paymentLink = await this.razorpay.createPaymentLink(
          {
            amount: totals.total,
            currency: "INR",
            referenceId: orderRef,
            description: `Order ${orderRef} at ${shop.shopName || "the shop"}`,
            customer: { name: dto.customer.name, contact: whatsAppNumber, ...(dto.customer.email ? { email: dto.customer.email } : {}) },
            notes: { kioscart_order_ref: orderRef, shopkeeper_id: String(shopkeeperId), source: "integration" },
            expireBy: Math.floor((Date.now() + PAYMENT_LINK_LIFETIME_MS) / 1000),
          },
          this.paymentLinkCreds(shop)!,
        );
      } catch (e: any) {
        this.logger.error(`Payment link failed for ${orderRef}: ${e?.message}`);
        throw new BadRequestException("The payment link could not be created. Please try again or choose pay on delivery.");
      }
    }

    const orderDto: any = {
      orderId: orderRef,
      shopkeeperId,
      items: lines.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        price: l.price,
        quantity: l.quantity,
        trackQuantity: l.trackQuantity,
        image: l.image,
        optionTitle: l.optionTitle,
        optionPrice: l.optionPrice,
        subcategoryName: l.subcategoryName,
        variantTitle: l.variantTitle,
      })),
      totalAmount: totals.total,
      orderType: orderType === "pickup" ? OrderType.Pickup : OrderType.Delivery,
      ...(orderType === "delivery" ? { deliveryAddress: { zip: "", ...dto.deliveryAddress } } : {}),
      whatsAppNumber,
      fullName: dto.customer.name,
      notes: dto.notes,
      // how this order was paid / will be paid, and where it came from
      paymentMethod: dto.paymentMethod,
      paymentProvider: online ? "razorpay" : "manual",
      // a cash sale at the counter is paid the moment it is placed
      paymentStatus: dto.paymentMethod === "cash" ? "paid" : "pending",
      ...(paymentLink ? { paymentLinkId: paymentLink.id, paymentLinkUrl: paymentLink.shortUrl } : {}),
      integrationRef: dto.externalRef,
      source: "integration",
    };

    let order: any;
    try {
      order = await this.ordersService.createOrder(orderDto);
    } catch (e: any) {
      // two simultaneous requests with the same externalRef: the unique index let one through
      if (dto.externalRef && /E11000/.test(String(e?.message))) {
        const existing = await this.orderModel.findOne({ shopkeeperId, integrationRef: dto.externalRef }).lean();
        if (existing) return { created: false, order: this.presentOrder(existing) };
      }
      throw new BadRequestException(String(e?.message || "The order could not be created.").replace(/^Failed to create order: /, ""));
    }

    const fresh = await this.orderModel.findById(order._id).lean();
    return { created: true, order: this.presentOrder(fresh), totals, paymentUrl: paymentLink ? paymentLink.shortUrl : null };
  }

  // ---- reading an order, and keeping payment status current --------------

  async getOrder(shopkeeperId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException("Order not found");
    const order: any = await this.orderModel.findOne({ _id: id, shopkeeperId, isSoftDeleted: { $ne: true } }).lean();
    if (!order) throw new NotFoundException("Order not found");

    await this.refreshPayments(shopkeeperId, [order]);
    return { ...order, id: String(order._id), ...this.presentOrder(order) };
  }

  /**
   * Orders waiting on a payment link: ask Razorpay whether they were paid and record it. Mutates the given rows so
   * the response already shows the new status. Failures are logged and skipped; the next read tries again.
   */
  async refreshPayments(shopkeeperId: string, orders: any[]): Promise<void> {
    const pending = orders
      .filter((o) => o.paymentMethod === "online" && o.paymentStatus === "pending" && o.paymentLinkId)
      .slice(0, MAX_REFRESH_PER_CALL);
    if (pending.length === 0) return;

    const shop = await this.loadShop(shopkeeperId).catch(() => null);
    const creds = shop ? this.paymentLinkCreds(shop) : null;
    if (!creds) return;

    for (const order of pending) {
      try {
        const link = await this.razorpay.getPaymentLink(order.paymentLinkId, creds);
        let update: Record<string, any> | null = null;
        if (link.status === "paid") {
          update = { paymentStatus: "paid", paymentProvider: "razorpay", ...(link.paymentId ? { transactionId: link.paymentId } : {}) };
        } else if (link.status === "expired" || link.status === "cancelled") {
          update = { paymentStatus: "failed" };
        }
        if (update) {
          await this.orderModel.updateOne({ _id: order._id, paymentStatus: "pending" }, { $set: update });
          Object.assign(order, update);
        }
      } catch (e: any) {
        this.logger.warn(`Could not refresh payment link ${order.paymentLinkId}: ${e?.message}`);
      }
    }
  }
}
