/**
 * Checks for integration-pricing.ts. Run with:  npx ts-node src/modules/integration/integration-pricing.check.ts
 * (the project has no test runner configured, so this is a plain script that exits non-zero on a failure).
 */
import * as assert from "node:assert/strict";
import { OrderPricingError, deliveryFeeFor, priceCustomLine, priceLine, totalsFor } from "./integration-pricing";

let passed = 0;
const check = (name: string, fn: () => void) => {
  try {
    fn();
    passed++;
  } catch (e: any) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};
const throwsPricing = (fn: () => unknown, match: RegExp) =>
  assert.throws(fn, (e: any) => e instanceof OrderPricingError && match.test(e.message));

const simple = (over: any = {}) => ({ _id: "p1", name: "Tee", price: 500, status: "active", images: ["/u/a.jpg"], ...over });

check("a simple product is priced from the shop's own price", () => {
  const l = priceLine(simple(), { productId: "p1", quantity: 3 });
  assert.equal(l.price, 500);
  assert.equal(l.lineTotal, 1500);
  assert.equal(l.trackQuantity, false);
  assert.equal(l.image, "/u/a.jpg");
});

check("an offer price is used when the product is on offer", () => {
  assert.equal(priceLine(simple({ isDiscounted: true, discountedPrice: 400 }), { productId: "p1", quantity: 1 }).price, 400);
  assert.equal(priceLine(simple({ isDiscounted: false, discountedPrice: 400 }), { productId: "p1", quantity: 1 }).price, 500);
});

check("a customer cannot choose the price: there is no price input at all", () => {
  const l = priceLine(simple(), { productId: "p1", quantity: 1, price: 1 } as any);
  assert.equal(l.price, 500);
});

check("quantity must be a sensible whole number", () => {
  throwsPricing(() => priceLine(simple(), { productId: "p1", quantity: 0 }), /quantity/i);
  throwsPricing(() => priceLine(simple(), { productId: "p1", quantity: -2 }), /quantity/i);
  throwsPricing(() => priceLine(simple(), { productId: "p1", quantity: 1000 }), /quantity/i);
  assert.equal(priceLine(simple(), { productId: "p1", quantity: 2.9 }).quantity, 2);
});

check("hidden, archived and deleted products cannot be ordered", () => {
  throwsPricing(() => priceLine(simple({ status: "draft" }), { productId: "p1", quantity: 1 }), /not available/);
  throwsPricing(() => priceLine(simple({ status: "archived" }), { productId: "p1", quantity: 1 }), /not available/);
  throwsPricing(() => priceLine(simple({ isSoftDeleted: true }), { productId: "p1", quantity: 1 }), /not available/);
});

check("a product with no price cannot be ordered", () => {
  throwsPricing(() => priceLine(simple({ price: 0 }), { productId: "p1", quantity: 1 }), /no price/);
});

check("tracked stock: enough, not enough, none", () => {
  const p = simple({ trackQuantity: true, inventory: 4 });
  assert.equal(priceLine(p, { productId: "p1", quantity: 4 }).available, 4);
  throwsPricing(() => priceLine(p, { productId: "p1", quantity: 5 }), /Only 4 of Tee/);
  throwsPricing(() => priceLine(simple({ trackQuantity: true, inventory: 0 }), { productId: "p1", quantity: 1 }), /out of stock/);
  assert.equal(priceLine(simple({ trackQuantity: false, inventory: 0 }), { productId: "p1", quantity: 9 }).available, null);
});

const withVariants = () =>
  simple({
    variants: [
      { title: "M", price: 500, trackQuantity: true, inventory: 5 },
      { title: "L", price: 600, isDiscounted: true, discountedPrice: 550, trackQuantity: false },
    ],
  });

check("product-level variants: priced by the chosen variant", () => {
  assert.equal(priceLine(withVariants(), { productId: "p1", quantity: 1, variantTitle: "M" }).price, 500);
  const l = priceLine(withVariants(), { productId: "p1", quantity: 2, variantTitle: "L" });
  assert.equal(l.price, 550);
  assert.equal(l.variantTitle, "L");
});

check("product-level variants: the choice is required when there are several, and listed", () => {
  throwsPricing(() => priceLine(withVariants(), { productId: "p1", quantity: 1 }), /Choose a variant of Tee: M, L/);
  throwsPricing(() => priceLine(withVariants(), { productId: "p1", quantity: 1, variantTitle: "XXL" }), /Choose a variant/);
});

check("a single variant is chosen automatically", () => {
  const p = simple({ variants: [{ title: "One", price: 300 }] });
  assert.equal(priceLine(p, { productId: "p1", quantity: 1 }).price, 300);
});

check("variant stock is enforced per variant", () => {
  throwsPricing(() => priceLine(withVariants(), { productId: "p1", quantity: 6, variantTitle: "M" }), /Only 5 of Tee \(M\)/);
});

const withSubcategories = () =>
  simple({
    subcategories: [
      { name: "Men", variants: [{ title: "S", price: 700, trackQuantity: true, inventory: 2 }, { title: "M", price: 750 }] },
      { name: "Gift wrap", additionalPrice: 50, isDiscounted: true, discountedAdditionalPrice: 30, trackQuantity: true, inventory: 3, variants: [] },
    ],
  });

check("subcategory with variants: variant price, names recorded", () => {
  const l = priceLine(withSubcategories(), { productId: "p1", quantity: 1, subcategoryName: "Men", variantTitle: "S" });
  assert.equal(l.price, 700);
  assert.equal(l.subcategoryName, "Men");
  assert.equal(l.variantTitle, "S");
});

check("subcategory without variants adds its price (offer price when on offer) to the product price", () => {
  const l = priceLine(withSubcategories(), { productId: "p1", quantity: 1, subcategoryName: "Gift wrap" });
  assert.equal(l.price, 530);
  assert.equal(l.variantTitle, undefined);
  assert.equal(l.available, 3);
});

check("subcategory choice is required when there are several", () => {
  throwsPricing(() => priceLine(withSubcategories(), { productId: "p1", quantity: 1 }), /Choose a type of Tee: Men, Gift wrap/);
});

const withOptions = (over: any = {}) =>
  simple({
    hasOptions: true,
    productOptions: [
      { title: "250g", price: 200, trackQuantity: true, inventory: 10 },
      { title: "500g", price: 380, isDiscounted: true, discountedPrice: 350 },
    ],
    ...over,
  });

check("options only: the option's price replaces the product price", () => {
  assert.equal(priceLine(withOptions(), { productId: "p1", quantity: 1, optionTitle: "250g" }).price, 200);
  const l = priceLine(withOptions(), { productId: "p1", quantity: 2, optionTitle: "500g" });
  assert.equal(l.price, 350);
  assert.equal(l.optionTitle, "500g");
  assert.equal(l.optionPrice, 380); // the list price is kept, like the storefront does
});

check("options only: the option is required and listed; stock is per option", () => {
  throwsPricing(() => priceLine(withOptions(), { productId: "p1", quantity: 1 }), /Choose an option for Tee: 250g, 500g/);
  throwsPricing(() => priceLine(withOptions(), { productId: "p1", quantity: 11, optionTitle: "250g" }), /Only 10 of Tee/);
});

check("option base plus variant price add up", () => {
  const p = withOptions({ variants: [{ title: "Red", price: 40 }] });
  assert.equal(priceLine(p, { productId: "p1", quantity: 1, optionTitle: "250g", variantTitle: "Red" }).price, 240);
});

check("option base plus a subcategory add-on", () => {
  const p = withOptions({ subcategories: [{ name: "Wrap", additionalPrice: 25, variants: [] }] });
  assert.equal(priceLine(p, { productId: "p1", quantity: 1, optionTitle: "250g", subcategoryName: "Wrap" }).price, 225);
});

check("delivery fee: highest reached bracket, none when switched off or no rules", () => {
  const shop = { deliveryEnabled: true, deliveryRules: [{ minSubtotal: 0, fee: 60 }, { minSubtotal: 500, fee: 30 }, { minSubtotal: 1000, fee: 0 }] };
  assert.equal(deliveryFeeFor(shop, 100), 60);
  assert.equal(deliveryFeeFor(shop, 500), 30);
  assert.equal(deliveryFeeFor(shop, 999.99), 30);
  assert.equal(deliveryFeeFor(shop, 1000), 0);
  assert.equal(deliveryFeeFor({ ...shop, deliveryEnabled: false }, 100), 0);
  assert.equal(deliveryFeeFor({ deliveryRules: [] }, 100), 0);
  assert.equal(deliveryFeeFor({}, 100), 0);
});

check("totals follow the storefront arithmetic: discount, then tax, plus delivery", () => {
  const lines = [priceLine(simple(), { productId: "p1", quantity: 2 })]; // 1000
  const shop = { discountPercentage: 10, taxPercentage: 5, deliveryEnabled: true, deliveryRules: [{ minSubtotal: 0, fee: 40 }] };
  const t = totalsFor(shop, lines, "delivery");
  assert.deepEqual(t, { subtotal: 1000, discount: 100, tax: 45, deliveryFee: 40, total: 985 });
  // pickup has no delivery fee
  assert.equal(totalsFor(shop, lines, "pickup").total, 945);
});

check("totals with nothing configured are just the subtotal", () => {
  const lines = [priceLine(simple(), { productId: "p1", quantity: 1 }), priceLine(simple({ _id: "p2", price: 99.5 }), { productId: "p2", quantity: 2 })];
  assert.equal(totalsFor({}, lines, "delivery").total, 699);
});

check("amounts are rounded to 2 decimals", () => {
  const lines = [priceLine(simple({ price: 33.333 }), { productId: "p1", quantity: 3 })];
  const t = totalsFor({ taxPercentage: 18 }, lines, "pickup");
  assert.equal(lines[0].price, 33.33); // the unit price is rounded to cents first
  assert.equal(t.subtotal, 99.99);
  assert.equal(t.tax, 18);
  assert.equal(t.total, 117.99);
});

check("a custom line is priced from the caller's unit price, with no product, stock or option", () => {
  const l = priceCustomLine({ name: "Gift hamper", subcategoryName: "Large", variantTitle: "Red", unitPrice: 450.5 }, 2);
  assert.equal(l.productId, "custom");
  assert.equal(l.custom, true);
  assert.equal(l.productName, "Gift hamper");
  assert.equal(l.price, 450.5);
  assert.equal(l.lineTotal, 901);
  assert.equal(l.subcategoryName, "Large");
  assert.equal(l.variantTitle, "Red");
  assert.equal(l.trackQuantity, false);
  assert.equal(l.available, null);
  assert.equal(l.optionTitle, undefined);
  const bare = priceCustomLine({ name: "Repair", unitPrice: 10 }, 1);
  assert.equal(bare.subcategoryName, undefined);
  assert.equal(bare.variantTitle, undefined);
  // a variant without a subcategory is fine
  const v = priceCustomLine({ name: "Cake", variantTitle: "1kg", unitPrice: 10 }, 1);
  assert.equal(v.variantTitle, "1kg");
  assert.equal(v.subcategoryName, undefined);
});

check("a custom line: shop discount and tax apply like any other line", () => {
  const lines = [priceCustomLine({ name: "Hamper", unitPrice: 500 }, 2), priceLine(simple(), { productId: "p1", quantity: 1 })]; // 1000 + 500
  const t = totalsFor({ discountPercentage: 10, taxPercentage: 5 }, lines, "pickup");
  assert.deepEqual(t, { subtotal: 1500, discount: 150, tax: 67.5, deliveryFee: 0, total: 1417.5 });
});

check("a custom line: name, price and quantity are validated", () => {
  throwsPricing(() => priceCustomLine({ name: "  ", unitPrice: 5 }, 1), /name/i);
  throwsPricing(() => priceCustomLine({ name: "x".repeat(121), unitPrice: 5 }, 1), /name/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: 0 }, 1), /price/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: -3 }, 1), /price/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: NaN }, 1), /price/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: 0.001 }, 1), /price/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: 10000000 }, 1), /price/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: 5 }, 0), /quantity/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: 5 }, 1000), /quantity/i);
  throwsPricing(() => priceCustomLine({ name: "A", unitPrice: 5 }, 1.5), /quantity/i);
  assert.equal(priceCustomLine({ name: "A", unitPrice: 5 }, 999).lineTotal, 4995);
});

if (process.exitCode) {
  console.error("\nSome checks failed.");
} else {
  console.log(`all ${passed} pricing checks passed`);
}
