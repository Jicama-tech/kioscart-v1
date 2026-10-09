import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { createHash, randomBytes } from "crypto";
import { Model, Types } from "mongoose";
import { IntegrationApiKey } from "./entities/integration-api-key.entity";
import { Order, OrderStatus } from "../orders/entities/order.entity";
import { Product } from "../products/entities/product.entity";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { OrdersService } from "../orders/orders.service";

const MAX_PAGE_SIZE = 100;

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
    });
    return { apiKey, prefix: apiKey.slice(0, 8) };
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
    return {
      orders: orders.map((o: any) => ({ ...o, id: String(o._id) })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
