/**
 * Server-side pricing for orders placed through the integration API (ComBox, on behalf of a customer chatting on
 * WhatsApp). The customer never sends a price: every price, the delivery fee, discount and tax come from the shop's
 * own data using exactly the rules the storefront applies when it builds a cart
 * (frontend/src/components/shopkeeper/productDetailDialog.tsx and cartPage.tsx), so a WhatsApp order totals the same
 * as the same basket bought on the storefront.
 *
 * Plain functions, no framework imports, so they can be tested on their own.
 */

export class OrderPricingError extends Error {}

export interface LineSelection {
  productId: string;
  quantity: number;
  optionTitle?: string;
  subcategoryName?: string;
  variantTitle?: string;
}

/** An item in the shape OrdersService.createOrder() stores, plus the line total. */
export interface PricedLine {
  productId: string;
  productName: string;
  price: number; // unit price
  quantity: number;
  lineTotal: number;
  trackQuantity: boolean;
  image?: string;
  optionTitle?: string;
  optionPrice?: number;
  subcategoryName?: string;
  variantTitle?: string;
  /** units in stock for this exact choice when stock is tracked, else null */
  available: number | null;
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  total: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** A price that may be on offer: the discounted price when flagged and set, else the normal one. */
const effective = (price: unknown, isDiscounted: unknown, discounted: unknown): number =>
  num(isDiscounted && discounted ? discounted : price);

const names = (list: any[], key: string): string => list.map((x) => x?.[key]).filter(Boolean).join(", ");

export function priceLine(product: any, sel: LineSelection): PricedLine {
  const productName = String(product?.name || "this product");
  const quantity = Math.floor(num(sel.quantity));
  if (!(quantity >= 1) || quantity > 999) {
    throw new OrderPricingError(`Choose a quantity between 1 and 999 for ${productName}.`);
  }
  if (!product || product.isSoftDeleted || product.status !== "active") {
    throw new OrderPricingError(`${productName} is not available right now.`);
  }

  // ---- option (e.g. size/pack): its price is the base the rest is added to
  const options: any[] = Array.isArray(product.productOptions) ? product.productOptions : [];
  const hasOptions = Boolean(product.hasOptions) && options.length > 0;
  let option: any = null;
  if (hasOptions) {
    option = sel.optionTitle ? options.find((o) => o.title === sel.optionTitle) : options.length === 1 ? options[0] : null;
    if (!option) {
      throw new OrderPricingError(`Choose an option for ${productName}: ${names(options, "title")}.`);
    }
  }
  const optionBase = option ? effective(option.price, option.isDiscounted, option.discountedPrice) : 0;

  const base = {
    productId: String(product._id),
    productName,
    quantity,
    image: Array.isArray(product.images) ? product.images[0] : undefined,
    ...(option ? { optionTitle: option.title, optionPrice: num(option.price) } : {}),
  };
  const finish = (unit: number, extra: Partial<PricedLine>): PricedLine => {
    const track = Boolean(extra.trackQuantity);
    const available = track && extra.available != null ? extra.available : null;
    if (available != null && available < quantity) {
      const where = [extra.subcategoryName, extra.variantTitle, option?.title].filter(Boolean).join(" / ");
      throw new OrderPricingError(
        available <= 0
          ? `${productName}${where ? ` (${where})` : ""} is out of stock.`
          : `Only ${available} of ${productName}${where ? ` (${where})` : ""} left.`,
      );
    }
    const price = round2(unit);
    if (!(price > 0)) {
      throw new OrderPricingError(`${productName} has no price set, so it cannot be ordered here.`);
    }
    return { ...base, price, lineTotal: round2(price * quantity), trackQuantity: track, available, ...extra } as PricedLine;
  };

  // ---- subcategories (optionally with variants)
  const subcategories: any[] = Array.isArray(product.subcategories) ? product.subcategories : [];
  if (subcategories.length > 0) {
    const sub = sel.subcategoryName
      ? subcategories.find((s) => s.name === sel.subcategoryName)
      : subcategories.length === 1
        ? subcategories[0]
        : null;
    if (!sub) {
      throw new OrderPricingError(`Choose a type of ${productName}: ${names(subcategories, "name")}.`);
    }

    const variants: any[] = Array.isArray(sub.variants) ? sub.variants : [];
    if (variants.length > 0) {
      const variant = sel.variantTitle
        ? variants.find((v) => v.title === sel.variantTitle)
        : variants.length === 1
          ? variants[0]
          : null;
      if (!variant) {
        throw new OrderPricingError(`Choose a variant of ${productName} (${sub.name}): ${names(variants, "title")}.`);
      }
      return finish(optionBase + effective(variant.price, variant.isDiscounted, variant.discountedPrice), {
        subcategoryName: sub.name,
        variantTitle: variant.title,
        trackQuantity: Boolean(variant.trackQuantity),
        available: variant.trackQuantity ? num(variant.inventory) : null,
      });
    }

    // a subcategory with no variants adds its own price on top of the product (or option) price
    const addOn = sub.isDiscounted && sub.discountedAdditionalPrice != null ? num(sub.discountedAdditionalPrice) : num(sub.additionalPrice);
    const baseUnit = hasOptions ? optionBase : effective(product.price, product.isDiscounted, product.discountedPrice);
    return finish(baseUnit + addOn, {
      subcategoryName: sub.name,
      trackQuantity: Boolean(sub.trackQuantity),
      available: sub.trackQuantity ? num(sub.inventory) : null,
    });
  }

  // ---- product-level variants
  const variants: any[] = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length > 0) {
    const variant = sel.variantTitle
      ? variants.find((v) => v.title === sel.variantTitle)
      : variants.length === 1
        ? variants[0]
        : null;
    if (!variant) {
      throw new OrderPricingError(`Choose a variant of ${productName}: ${names(variants, "title")}.`);
    }
    return finish(optionBase + effective(variant.price, variant.isDiscounted, variant.discountedPrice), {
      variantTitle: variant.title,
      trackQuantity: Boolean(variant.trackQuantity),
      available: variant.trackQuantity ? num(variant.inventory) : null,
    });
  }

  // ---- simple product, or a product with options only
  if (option) {
    return finish(optionBase, {
      trackQuantity: Boolean(option.trackQuantity),
      available: option.trackQuantity ? num(option.inventory) : null,
    });
  }
  return finish(effective(product.price, product.isDiscounted, product.discountedPrice), {
    trackQuantity: Boolean(product.trackQuantity),
    available: product.trackQuantity ? num(product.inventory) : null,
  });
}

/** Delivery charge for a basket: the rule with the highest minimum the subtotal reaches; none when delivery is off. */
export function deliveryFeeFor(shop: any, subtotal: number): number {
  if (shop?.deliveryEnabled === false) return 0;
  const rules: any[] = Array.isArray(shop?.deliveryRules) ? shop.deliveryRules : [];
  const applicable = rules
    .map((r) => ({ min: num(r.minSubtotal), fee: num(r.fee) }))
    .filter((r) => subtotal >= r.min)
    .sort((a, b) => b.min - a.min);
  return applicable[0] ? applicable[0].fee : 0;
}

/** Same arithmetic as the storefront cart: shop-wide discount, then tax on what is left, plus delivery. */
export function totalsFor(shop: any, lines: PricedLine[], orderType: "delivery" | "pickup"): Totals {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const discount = (subtotal * num(shop?.discountPercentage)) / 100;
  const afterDiscount = subtotal - discount;
  const tax = (afterDiscount * num(shop?.taxPercentage)) / 100;
  const delivery = orderType === "delivery" ? deliveryFeeFor(shop, subtotal) : 0;

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    tax: round2(tax),
    deliveryFee: round2(delivery),
    total: round2(afterDiscount + delivery + tax),
  };
}
