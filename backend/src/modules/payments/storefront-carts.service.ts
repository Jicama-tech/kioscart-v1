import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import {
  AbandonedCart,
  AbandonedCartDocument,
  whatsAppDigits,
} from "./schemas/abandoned-cart.schema";

export const CART_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_ITEMS = 100;

// Only what a cart line needs; anything else the browser sends is dropped
const ITEM_FIELDS = [
  "productId", "productName", "price", "discountedPrice", "isDiscounted", "quantity",
  "subcategoryIndex", "subcategoryName", "variantTitle", "variantIndex", "image", "sku",
  "category", "optionTitle", "optionPrice", "measurement", "inventory", "trackQuantity",
] as const;

export interface SaveCartInput {
  cartKey: string;
  shopkeeperId: string;
  customerWhatsApp: string;
  customerName?: string;
  customerEmail?: string;
  items: any[];
}

/** Carts saved from the storefront before checkout, so a customer who leaves can be reminded and sent back to them. */
@Injectable()
export class StorefrontCartsService {
  constructor(
    @InjectModel(AbandonedCart.name)
    private readonly cartModel: Model<AbandonedCartDocument>,
    @InjectModel(Shopkeeper.name)
    private readonly shopModel: Model<Shopkeeper>,
  ) {}

  private cleanItems(items: any[]): any[] {
    return (Array.isArray(items) ? items : [])
      .slice(0, MAX_ITEMS)
      .filter((i) => i && typeof i === "object" && i.productId && Number(i.quantity) > 0)
      .map((i) => {
        const out: any = {};
        for (const f of ITEM_FIELDS) if (i[f] !== undefined) out[f] = i[f];
        out.quantity = Math.min(Math.max(Math.floor(Number(i.quantity)), 1), 9999);
        return out;
      });
  }

  /** The cart's subtotal (before delivery, tax and coupons), worked out the way the storefront cart does. */
  private total(items: any[]): number {
    return items.reduce((sum, i) => {
      const unit = Number(i.isDiscounted && i.discountedPrice ? i.discountedPrice : i.price) || 0;
      return sum + unit * i.quantity;
    }, 0);
  }

  /**
   * Saves (or updates) the customer's cart. An empty cart removes one that was never checked out. A cart already
   * recovered is left alone: the browser starts a new cart key after an order.
   */
  async save(input: SaveCartInput) {
    if (!CART_KEY_PATTERN.test(input.cartKey || "")) throw new BadRequestException("Invalid cart key");
    if (!Types.ObjectId.isValid(input.shopkeeperId)) throw new BadRequestException("Invalid shop");
    const digits = whatsAppDigits(input.customerWhatsApp);
    if (!digits) throw new BadRequestException("A valid WhatsApp number is needed to save the cart");

    const items = this.cleanItems(input.items);
    if (!items.length) {
      await this.cartModel.deleteOne({ cartKey: input.cartKey, status: "open", stage: "cart" });
      return { saved: false, removed: true };
    }

    const existing: any = await this.cartModel.findOne({ cartKey: input.cartKey }).select("status shopkeeperId").lean();
    if (existing && (existing.status === "recovered" || String(existing.shopkeeperId) !== input.shopkeeperId)) {
      return { saved: false };
    }
    if (!existing && !(await this.shopModel.exists({ _id: input.shopkeeperId }))) {
      throw new NotFoundException("Shop not found");
    }

    await this.cartModel.updateOne(
      { cartKey: input.cartKey },
      {
        $set: {
          items,
          totalAmount: this.total(items),
          customerWhatsApp: input.customerWhatsApp.trim(),
          whatsAppDigits: digits,
          ...(input.customerName?.trim() ? { customerName: input.customerName.trim().slice(0, 120) } : {}),
          ...(input.customerEmail?.trim() ? { customerEmail: input.customerEmail.trim().slice(0, 160) } : {}),
          lastActivityAt: new Date(),
        },
        $setOnInsert: {
          gatewayOrderId: `cart:${input.cartKey}`,
          shopkeeperId: new Types.ObjectId(input.shopkeeperId),
          stage: "cart",
          status: "open",
        },
      },
      { upsert: true },
    );
    return { saved: true };
  }

  /** The cart behind a "restore my cart" link: its shop, lines and the customer's details to fill the cart page. */
  async restore(cartKey: string) {
    if (!CART_KEY_PATTERN.test(cartKey || "")) throw new NotFoundException("Cart not found");
    const cart: any = await this.cartModel.findOne({ cartKey }).lean();
    if (!cart) throw new NotFoundException("Cart not found");
    return {
      shopkeeperId: String(cart.shopkeeperId),
      status: cart.status,
      items: cart.items || [],
      customerWhatsApp: cart.customerWhatsApp || null,
      customerName: cart.customerName || null,
      customerEmail: cart.customerEmail || null,
    };
  }
}
