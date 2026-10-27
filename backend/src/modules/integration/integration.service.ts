import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomBytes } from "crypto";
import { Model, Types } from "mongoose";
import { IntegrationApiKey } from "./entities/integration-api-key.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import { Product } from "../products/entities/product.entity";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { User } from "../users/schemas/user.schema";
import { OrdersService } from "../orders/orders.service";
import { AbandonedCart } from "../payments/schemas/abandoned-cart.schema";

const MAX_PAGE_SIZE = 100;

// An unpaid online checkout counts as abandoned after this long
const ABANDONED_AFTER_MINUTES = 30;

const KEY_LENGTH = "ksk_".length + 48;

/** ksk_ + asterisks + last 2 characters. Keys made before lastChars existed show no tail. */
const maskKey = (lastChars?: string | null) => {
  const tail = lastChars ?? "";
  return `ksk_${"*".repeat(KEY_LENGTH - 4 - tail.length)}${tail}`;
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class IntegrationService {
  constructor(
    @InjectModel(IntegrationApiKey.name)
    private readonly keyModel: Model<IntegrationApiKey>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Shopkeeper.name)
    private readonly shopModel: Model<Shopkeeper>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(AbandonedCart.name)
    private readonly abandonedCartModel: Model<AbandonedCart>,
    private readonly ordersService: OrdersService,
  ) {}

  // ---- key management (shopkeeper dashboard) ----------------------------

  async getKeyInfo(shopkeeperId: string) {
    const key: any = await this.keyModel
      .findOne({ shopkeeperId, revokedAt: null })
      .lean();
    return key
      ? {
          active: true,
          prefix: key.prefix,
          maskedKey: maskKey(key.lastChars),
          createdAt: key.createdAt,
          lastUsedAt: key.lastUsedAt,
        }
      : { active: false };
  }

  /** Creates a key, revoking any previous one. The plaintext is returned once. */
  async rotateKey(shopkeeperId: string) {
    await this.keyModel.updateMany(
      { shopkeeperId, revokedAt: null },
      { revokedAt: new Date() },
    );
    const apiKey = `ksk_${randomBytes(24).toString("hex")}`;
    await this.keyModel.create({
      shopkeeperId: new Types.ObjectId(shopkeeperId),
      keyHash: sha256(apiKey),
      prefix: apiKey.slice(0, 8),
      lastChars: apiKey.slice(-2),
    });
    return {
      apiKey,
      prefix: apiKey.slice(0, 8),
      maskedKey: maskKey(apiKey.slice(-2)),
    };
  }

  async revokeKey(shopkeeperId: string) {
    await this.keyModel.updateMany(
      { shopkeeperId, revokedAt: null },
      { revokedAt: new Date() },
    );
    return { active: false };
  }

  /** Returns the owning shop id for a valid key, else null. */
  async resolveKey(plain: string): Promise<string | null> {
    const key = await this.keyModel.findOneAndUpdate(
      { keyHash: sha256(plain), revokedAt: null },
      { lastUsedAt: new Date() },
    );
    return key ? String(key.shopkeeperId) : null;
  }

  // ---- read API ---------------------------------------------------------

  private absolute(path?: string): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const base = (process.env.BACKEND_URL || "").replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  private pageArgs(page?: string, limit?: string) {
    const p = Math.max(parseInt(page || "1", 10) || 1, 1);
    const l = Math.min(
      Math.max(parseInt(limit || "50", 10) || 50, 1),
      MAX_PAGE_SIZE,
    );
    return { page: p, limit: l, skip: (p - 1) * l };
  }

  async getShop(shopkeeperId: string) {
    const shop: any = await this.shopModel
      .findById(shopkeeperId)
      .select("shopName email businessEmail phone whatsappNumber country")
      .lean();
    if (!shop) throw new NotFoundException("Shop not found");
    return {
      id: String(shop._id),
      name: shop.shopName,
      email: shop.businessEmail || shop.email,
      phone: shop.whatsappNumber || shop.phone || null,
      country: shop.country || null,
    };
  }

  async listProducts(
    shopkeeperId: string,
    q: { page?: string; limit?: string; updatedSince?: string },
  ) {
    const { page, limit, skip } = this.pageArgs(q.page, q.limit);
    const filter: any = { shopkeeperId, isSoftDeleted: { $ne: true } };
    if (q.updatedSince) {
      const since = new Date(q.updatedSince);
      if (!isNaN(since.getTime())) filter.updatedAt = { $gte: since };
    }
    const [rows, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.productModel.countDocuments(filter),
    ]);
    const products = rows.map((p: any) => ({
      ...p,
      id: String(p._id),
      images: (p.images || []).map((i: string) => this.absolute(i)),
    }));
    return { products, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * The people the shop added to its CRM (Customers page -> Add customer). People who only ordered are not
   * listed here: they are already in /orders. Only contact details are returned, never the stored password.
   */
  async listCustomers(
    shopkeeperId: string,
    q: { page?: string; limit?: string; updatedSince?: string },
  ) {
    const { page, limit, skip } = this.pageArgs(q.page, q.limit);
    const filter: any = { provider: "Shopkeeper", providerId: shopkeeperId };
    if (q.updatedSince) {
      const since = new Date(q.updatedSince);
      if (!isNaN(since.getTime())) filter.updatedAt = { $gte: since };
    }
    const [rows, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select("name firstName lastName email whatsAppNumber createdAt updatedAt")
        .sort({ _id: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);
    const customers = rows.map((u: any) => ({
      id: String(u._id),
      name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
      firstName: u.firstName || null,
      lastName: u.lastName || null,
      email: u.email || null,
      whatsAppNumber: u.whatsAppNumber || null,
      createdAt: u.createdAt || null,
    }));
    return { customers, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listOrders(
    shopkeeperId: string,
    q: {
      page?: string;
      limit?: string;
      updatedSince?: string;
      status?: string;
      paymentStatus?: string;
    },
  ) {
    const { page, limit, skip } = this.pageArgs(q.page, q.limit);
    const filter: any = { shopkeeperId, isSoftDeleted: { $ne: true } };
    if (q.status && Object.values(OrderStatus).includes(q.status as any)) {
      filter.status = q.status;
    }
    if (q.paymentStatus) filter.paymentStatus = String(q.paymentStatus);
    if (q.updatedSince) {
      const since = new Date(q.updatedSince);
      if (!isNaN(since.getTime())) filter.updatedAt = { $gte: since };
    }
    const [orders, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(filter),
    ]);
    // Older orders carry no customer details of their own; the customer's account has them
    const missing = [
      ...new Set(
        orders
          .filter((o: any) => !o.customerName || !o.customerEmail || !o.customerWhatsApp)
          .map((o: any) => String(o.userId || ""))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ];
    const users = missing.length
      ? await this.userModel
          .find({ _id: { $in: missing } })
          .select("name firstName lastName email whatsAppNumber")
          .lean()
      : [];
    const byId = new Map(users.map((u: any) => [String(u._id), u]));
    return {
      orders: orders.map((o: any) => {
        const u: any = byId.get(String(o.userId || ""));
        const fullName = u && (u.name || [u.firstName, u.lastName].filter(Boolean).join(" ")).trim();
        return {
          ...o,
          id: String(o._id),
          customerName: o.customerName || fullName || undefined,
          customerEmail: o.customerEmail || u?.email || undefined,
          customerWhatsApp: o.customerWhatsApp || u?.whatsAppNumber || undefined,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Online checkouts the customer did not pay. A checkout counts as abandoned once it has been unpaid for
   * ABANDONED_AFTER_MINUTES (the customer may still be on the payment page before that); one paid later is
   * listed as "recovered" so the caller can stop following up.
   */
  async listAbandonedCarts(
    shopkeeperId: string,
    q: { page?: string; limit?: string; updatedSince?: string },
  ) {
    const { page, limit, skip } = this.pageArgs(q.page, q.limit);
    const cutoff = new Date(Date.now() - ABANDONED_AFTER_MINUTES * 60 * 1000);
    // abandoned = untouched for the cutoff (a customer still adding to the cart is not abandoning it)
    const filter: any = {
      shopkeeperId: new Types.ObjectId(shopkeeperId),
      $or: [
        { status: "recovered" },
        { lastActivityAt: { $lte: cutoff } },
        { lastActivityAt: { $exists: false }, createdAt: { $lte: cutoff } },
      ],
    };
    const storefront = (process.env.FRONTEND_URL || "https://kioscart.com").replace(/\/+$/, "");
    if (q.updatedSince) {
      const since = new Date(q.updatedSince);
      if (!isNaN(since.getTime())) filter.updatedAt = { $gte: since };
    }
    const [rows, total] = await Promise.all([
      this.abandonedCartModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.abandonedCartModel.countDocuments(filter),
    ]);
    const abandonedCarts = rows.map((c: any) => ({
      id: String(c._id),
      orderId: c.orderId,
      status: c.status === "recovered" ? "recovered" : "abandoned",
      // how far the customer got: the cart page or the payment window
      stage: c.stage || "payment",
      // opens the shop's cart with the same items, for the reminder message
      restoreUrl: c.cartKey
        ? `${storefront}/cart/${String(c.shopkeeperId)}?restoreCart=${encodeURIComponent(c.cartKey)}`
        : null,
      customerName: c.customerName || null,
      customerEmail: c.customerEmail || null,
      customerWhatsApp: c.customerWhatsApp || null,
      items: (c.items || []).map((i: any) => ({
        ...i,
        image: this.absolute(i?.image),
      })),
      totalAmount: c.totalAmount,
      currency: c.currency || null,
      orderType: c.orderType || null,
      recoveredAt: c.recoveredAt || null,
      recoveredOrderId: c.recoveredOrderId ? String(c.recoveredOrderId) : null,
      lastActivityAt: c.lastActivityAt || c.createdAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
    return { abandonedCarts, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateOrderStatus(
    shopkeeperId: string,
    orderId: string,
    status: OrderStatus,
    notes?: string,
  ) {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException("Order not found");
    }
    // Ownership is checked here, since the key is the only tenant boundary.
    const owned = await this.orderModel.exists({
      _id: orderId,
      shopkeeperId,
      isSoftDeleted: { $ne: true },
    });
    if (!owned) throw new NotFoundException("Order not found");

    await this.ordersService.updateOrderStatus(orderId, {
      status,
      notes,
      changedBy: "ComBox",
    });
    const fresh: any = await this.orderModel.findById(orderId).lean();
    return { ...fresh, id: String(fresh._id) };
  }
}
