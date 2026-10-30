/**
 * Checks for the integration order endpoints. Run with:
 *   npx ts-node --transpile-only src/modules/integration/integration-orders.check.ts
 * Uses in-memory stand-ins for the database, OrdersService and Razorpay (the project has no test runner or test DB).
 */
import "reflect-metadata";
import * as assert from "node:assert/strict";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { IntegrationOrdersService } from "./integration-orders.service";
import { IntegrationCreateOrderDto, IntegrationQuoteDto } from "./dto/integration-order.dto";

process.env.SECRETS_ENCRYPTION_KEY = "test-key-for-checks";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encryptSecret } = require("../../common/secrets.util");

const SHOP_ID = "64b000000000000000000001";
const P1 = "64b0000000000000000000a1";
const P2 = "64b0000000000000000000a2";

let passed = 0;
const check = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    passed++;
  } catch (e: any) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

// ---- stand-ins -----------------------------------------------------------------------------------------------------
const chain = (value: any) => {
  const c: any = { select: () => c, lean: async () => value, then: undefined };
  return c;
};

function build(opts: { shop?: any; products?: any[]; razorpayFails?: boolean; linkStatus?: string } = {}) {
  const orders: any[] = [];
  const calls: string[] = [];
  const shop = opts.shop ?? {
    shopName: "Kios Shop", country: "IN", taxPercentage: 0, discountPercentage: 0,
    deliveryEnabled: true, deliveryRules: [{ minSubtotal: 0, fee: 40 }],
    razorpay: { directKeyId: "rzp_test_1", directKeySecretEncrypted: encryptSecret("secret"), directEnabled: true },
  };
  const products = opts.products ?? [
    { _id: P1, name: "Tee", price: 500, status: "active", shopkeeperId: SHOP_ID, images: ["/u/a.jpg"], trackQuantity: true, inventory: 5 },
    { _id: P2, name: "Cap", price: 150, status: "active", shopkeeperId: SHOP_ID },
  ];

  const orderModel: any = {
    findOne: (q: any) => chain(orders.find((o) => String(o.shopkeeperId) === String(q.shopkeeperId) && (q.integrationRef ? o.integrationRef === q.integrationRef : String(o._id) === String(q._id))) ?? null),
    findById: (id: any) => chain(orders.find((o) => String(o._id) === String(id)) ?? null),
    updateOne: async (q: any, u: any) => {
      const o = orders.find((x) => String(x._id) === String(q._id) && (!q.paymentStatus || x.paymentStatus === q.paymentStatus));
      if (o) Object.assign(o, u.$set);
      return {};
    },
  };
  const productModel: any = {
    find: (q: any) => chain(products.filter((p) => q._id.$in.includes(String(p._id)) && String(p.shopkeeperId) === String(q.shopkeeperId))),
  };
  const shopModel: any = { findById: () => chain(shop) };
  const ordersService: any = {
    createOrder: async (dto: any) => {
      calls.push("createOrder");
      const o = { _id: `o${orders.length + 1}`, status: "pending", createdAt: new Date(), ...dto };
      orders.push(o);
      return o;
    },
  };
  const razorpay: any = {
    createPaymentLink: async (input: any, creds: any) => {
      calls.push("createPaymentLink");
      razorpay.lastLink = { input, creds };
      if (opts.razorpayFails) throw new Error("razorpay down");
      return { id: "plink_1", shortUrl: "https://rzp.io/i/abc" };
    },
    getPaymentLink: async () => ({ status: opts.linkStatus ?? "created", paymentId: "pay_1", amountPaid: 0 }),
  };
  const svc = new IntegrationOrdersService(orderModel, productModel, shopModel, ordersService, razorpay);
  return { svc, orders, calls, razorpay, shop };
}

const base = () => ({
  items: [{ productId: P1, quantity: 2 }, { productId: P2, quantity: 1 }],
  customer: { name: "Asha", whatsAppNumber: "+91 98765-43210" },
  deliveryAddress: { street: "1 MG Road", city: "Pune", state: "MH" },
  orderType: "delivery" as const,
  paymentMethod: "cod" as const,
});

const validate = (type: any, body: any) =>
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }).transform(body, { type: "body", metatype: type });

(async () => {
  // ---- request validation -------------------------------------------------------------------------------------------
  await check("a valid order request passes validation", async () => {
    const dto: any = await validate(IntegrationCreateOrderDto, base());
    assert.equal(dto.items.length, 2);
  });

  await check("a price, total or delivery fee sent by the caller is rejected", async () => {
    for (const extra of [{ totalAmount: 1 }, { price: 1 }, { deliveryFee: 0 }, { discount: 99 }]) {
      await assert.rejects(() => validate(IntegrationCreateOrderDto, { ...base(), ...extra }), BadRequestException);
    }
    await assert.rejects(() => validate(IntegrationCreateOrderDto, { ...base(), items: [{ productId: P1, quantity: 1, price: 1 }] }), BadRequestException);
  });

  await check("quantity, ids, payment method, phone and address are validated", async () => {
    const bad = [
      { ...base(), items: [] },
      { ...base(), items: [{ productId: "nope", quantity: 1 }] },
      { ...base(), items: [{ productId: P1, quantity: 0 }] },
      { ...base(), items: [{ productId: P1, quantity: 1000 }] },
      { ...base(), paymentMethod: "bitcoin" },
      { ...base(), customer: { name: "A", whatsAppNumber: "123" } },
      { ...base(), deliveryAddress: undefined },
    ];
    for (const b of bad) await assert.rejects(() => validate(IntegrationCreateOrderDto, b), BadRequestException);
  });

  await check("pickup needs no address", async () => {
    const { deliveryAddress, ...rest } = base();
    await validate(IntegrationCreateOrderDto, { ...rest, orderType: "pickup" });
  });

  // ---- quote --------------------------------------------------------------------------------------------------------
  await check("quote prices the basket and says which payment methods the shop takes", async () => {
    const { svc } = build();
    const q: any = await svc.quote(SHOP_ID, (await validate(IntegrationQuoteDto, { items: base().items })) as any);
    assert.equal(q.currency, "INR");
    assert.equal(q.totals.subtotal, 1150);
    assert.equal(q.totals.deliveryFee, 40);
    assert.equal(q.totals.total, 1190);
    assert.deepEqual(q.paymentMethods, { cod: true, online: true, cash: true, qr: false });
    assert.equal(q.lines[0].unitPrice, 500);
  });

  await check("quote: pickup has no delivery fee; a shop without Razorpay keys offers cod only", async () => {
    const { svc } = build({ shop: { shopName: "S", country: "IN", deliveryEnabled: true, deliveryRules: [{ minSubtotal: 0, fee: 40 }] } });
    const q: any = await svc.quote(SHOP_ID, { items: base().items, orderType: "pickup" } as any);
    assert.equal(q.totals.total, 1150);
    assert.deepEqual(q.paymentMethods, { cod: true, online: false, cash: true, qr: false });
  });

  await check("a shop outside India cannot take online payment", async () => {
    const { svc, shop } = build();
    (shop as any).country = "SG";
    const q: any = await svc.quote(SHOP_ID, { items: base().items } as any);
    assert.equal(q.paymentMethods.online, false);
  });

  await check("a product from another shop is not found", async () => {
    const { svc } = build();
    await assert.rejects(() => svc.quote("64b000000000000000000999", { items: [{ productId: P1, quantity: 1 }] } as any), /not found|Shop not found/i);
    const other = build({ products: [{ _id: P1, name: "Tee", price: 500, status: "active", shopkeeperId: "somebody-else" }] });
    await assert.rejects(() => other.svc.quote(SHOP_ID, { items: [{ productId: P1, quantity: 1 }] } as any), /not found/i);
  });

  await check("stock is checked, including the same product listed twice", async () => {
    const { svc } = build();
    await assert.rejects(() => svc.quote(SHOP_ID, { items: [{ productId: P1, quantity: 3 }, { productId: P1, quantity: 3 }] } as any), /Only 5 of Tee/);
  });

  await check("a closed shop takes no orders", async () => {
    const day = 24 * 60 * 60 * 1000;
    const { svc } = build({ shop: { shopName: "S", country: "IN", shopClosedFromDate: new Date(Date.now() - day), shopClosedToDate: new Date(Date.now() + day) } });
    await assert.rejects(() => svc.quote(SHOP_ID, { items: base().items } as any), /closed until/);
  });

  await check("a shop that does not deliver refuses delivery orders", async () => {
    const { svc } = build({ shop: { shopName: "S", country: "IN", deliveryEnabled: false } });
    await assert.rejects(() => svc.quote(SHOP_ID, { items: base().items, orderType: "delivery" } as any), /does not deliver/);
    await svc.quote(SHOP_ID, { items: base().items, orderType: "pickup" } as any);
  });

  // ---- custom (one-off) lines ---------------------------------------------------------------------------------------
  const CUSTOM = { quantity: 2, custom: { name: "Gift hamper", subcategoryName: "Large", variantTitle: "Red", unitPrice: 450.5 } };

  await check("custom lines: validation accepts the contract shape and rejects bad ones", async () => {
    const ok: any = await validate(IntegrationQuoteDto, { items: [CUSTOM, { productId: P1, quantity: 1 }] });
    assert.equal(ok.items[0].custom.unitPrice, 450.5);
    const c = (custom: any, extra: any = {}) => ({ items: [{ quantity: 1, custom, ...extra }] });
    const bad = [
      { items: [{ quantity: 1 }] }, // neither
      c({ name: "A", unitPrice: 5 }, { productId: P1 }), // both
      c({ name: "", unitPrice: 5 }),
      c({ name: "x".repeat(121), unitPrice: 5 }),
      c({ name: "A", unitPrice: 0 }),
      c({ name: "A", unitPrice: -1 }),
      c({ name: "A", unitPrice: 1.234 }),
      c({ name: "A", unitPrice: 10000000 }),
      c({ name: "A", unitPrice: "5" }),
      c({ name: "A" }),
      c({ name: "A", unitPrice: 5, price: 1 }), // unknown field inside custom
      c({ name: "A", unitPrice: 5, variantTitle: "v".repeat(121) }),
      { items: [{ quantity: 0, custom: { name: "A", unitPrice: 5 } }] },
      { items: [{ quantity: 1000, custom: { name: "A", unitPrice: 5 } }] },
      { items: [{ quantity: 1, price: 5, custom: { name: "A", unitPrice: 5 } }] }, // price outside custom
    ];
    for (const b of bad) await assert.rejects(() => validate(IntegrationQuoteDto, b), BadRequestException);
  });

  await check("custom lines: a catalog product still needs a valid productId and takes no price", async () => {
    await assert.rejects(() => validate(IntegrationQuoteDto, { items: [{ productId: "nope", quantity: 1 }] }), BadRequestException);
    await assert.rejects(() => validate(IntegrationQuoteDto, { items: [{ productId: P1, quantity: 1, unitPrice: 1 }] }), BadRequestException);
  });

  await check("custom lines: quote prices them without any product lookup, with shop discount and tax", async () => {
    const shop = { shopName: "S", country: "IN", discountPercentage: 10, taxPercentage: 5, deliveryEnabled: true, deliveryRules: [] };
    const b = build({ shop });
    let finds = 0;
    const svc: any = b.svc;
    const origFind = svc.productModel.find;
    svc.productModel.find = (q: any) => { finds++; return origFind(q); };
    const q: any = await svc.quote(SHOP_ID, (await validate(IntegrationQuoteDto, { items: [CUSTOM], orderType: "pickup" })) as any);
    assert.equal(finds, 0);
    assert.deepEqual(q.lines, [{
      productId: null, custom: true, name: "Gift hamper", quantity: 2, unitPrice: 450.5, lineTotal: 901,
      option: null, type: "Large", variant: "Red",
    }]);
    assert.equal(q.totals.subtotal, 901);
    assert.equal(q.totals.discount, 90.1);
    assert.equal(q.totals.tax, 40.55);
    // mixed basket: only the catalog product is looked up, "custom" is never sent to the database
    let seen: any = null;
    svc.productModel.find = (q2: any) => { seen = q2; return origFind(q2); };
    const mixed: any = await svc.quote(SHOP_ID, { items: [CUSTOM, { productId: P2, quantity: 1 }], orderType: "pickup" } as any);
    assert.deepEqual(seen._id.$in, [P2]);
    assert.equal(mixed.lines.length, 2);
    assert.equal(mixed.lines[1].productId, P2);
  });

  await check("custom lines: the same custom line twice merges, different ones stay separate", async () => {
    const { svc } = build();
    const other = { quantity: 1, custom: { name: "Gift hamper", subcategoryName: "Large", variantTitle: "Red", unitPrice: 400 } };
    const q: any = await svc.quote(SHOP_ID, { items: [CUSTOM, CUSTOM, other, { quantity: 1, custom: { name: "Gift hamper", unitPrice: 450.5 } }], orderType: "pickup" } as any);
    assert.equal(q.lines.length, 3);
    assert.equal(q.lines[0].quantity, 4);
  });

  await check("custom lines: a product and custom on one line is refused by the service too", async () => {
    const { svc } = build();
    await assert.rejects(() => svc.quote(SHOP_ID, { items: [{ productId: P1, quantity: 1, custom: CUSTOM.custom }] } as any), BadRequestException);
  });

  await check("custom lines: the service refuses a bad custom price or quantity as a 400", async () => {
    const { svc } = build();
    await assert.rejects(() => svc.quote(SHOP_ID, { items: [{ quantity: 1, custom: { name: "A", unitPrice: 0 } }] } as any), BadRequestException);
    await assert.rejects(() => svc.quote(SHOP_ID, { items: [{ quantity: 1000, custom: { name: "A", unitPrice: 5 } }] } as any), BadRequestException);
  });

  await check("custom lines: the placed order stores productId custom, custom:true and no stock tracking", async () => {
    const { svc, orders } = build();
    const { deliveryAddress, ...rest } = base();
    await svc.create(SHOP_ID, { ...rest, orderType: "pickup", items: [CUSTOM, { productId: P2, quantity: 1 }] } as any);
    const item = orders[0].items[0];
    assert.equal(item.productId, "custom");
    assert.equal(item.custom, true);
    assert.equal(item.productName, "Gift hamper");
    assert.equal(item.subcategoryName, "Large");
    assert.equal(item.variantTitle, "Red");
    assert.equal(item.price, 450.5);
    assert.equal(item.quantity, 2);
    assert.equal(item.trackQuantity, false);
    assert.equal(orders[0].items[1].custom, undefined);
    assert.equal(orders[0].totalAmount, 1051);
  });

  await check("custom lines: a QR payment request keeps them on the order to place", async () => {
    const { svc } = build();
    const prep: any = await svc.preparePickupOrder(SHOP_ID, { items: [CUSTOM], customer: { name: "A", whatsAppNumber: "+919876543210" }, externalRef: "kiosk-ref-1" } as any);
    assert.equal(prep.order.items[0].productId, "custom");
    assert.equal(prep.order.items[0].custom, true);
    assert.equal(prep.totals.total, 901);
  });

  // ---- create: pay on delivery ----------------------------------------------------------------------------------------
  await check("cod: the order is created with server prices and no payment link", async () => {
    const { svc, orders, calls } = build();
    const r: any = await svc.create(SHOP_ID, { ...base(), externalRef: "wa-msg-1" } as any);
    assert.equal(r.created, true);
    assert.equal(orders.length, 1);
    assert.deepEqual(calls, ["createOrder"]);
    const o = orders[0];
    assert.equal(o.totalAmount, 1190);
    assert.equal(o.items[0].price, 500);
    assert.equal(o.whatsAppNumber, "+919876543210");
    assert.equal(o.paymentMethod, "cod");
    assert.equal(o.paymentProvider, "manual");
    assert.equal(o.paymentStatus, "pending");
    assert.equal(o.source, "integration");
    assert.match(o.orderId, /^kiosshop-order-[a-z0-9]{12}$/);
    assert.equal(r.order.paymentUrl, null);
  });

  await check("a cash sale at the counter (ComBox kiosk) is paid when it is placed", async () => {
    const { svc, orders } = build();
    const r: any = await svc.create(SHOP_ID, { ...base(), paymentMethod: "cash", externalRef: "kiosk-1" } as any);
    assert.equal(r.created, true);
    assert.equal(orders[0].paymentMethod, "cash");
    assert.equal(orders[0].paymentProvider, "manual");
    assert.equal(orders[0].paymentStatus, "paid");
    assert.equal(r.paymentUrl, null);
  });

  await check("the same externalRef returns the same order and creates nothing new", async () => {
    const { svc, orders } = build();
    const first: any = await svc.create(SHOP_ID, { ...base(), externalRef: "wa-msg-2" } as any);
    const again: any = await svc.create(SHOP_ID, { ...base(), externalRef: "wa-msg-2" } as any);
    assert.equal(again.created, false);
    assert.equal(again.order.id, first.order.id);
    assert.equal(orders.length, 1);
  });

  await check("pickup orders carry no delivery address or fee", async () => {
    const { svc, orders } = build();
    const { deliveryAddress, ...rest } = base();
    await svc.create(SHOP_ID, { ...rest, orderType: "pickup" } as any);
    assert.equal(orders[0].orderType, "pickup");
    assert.equal(orders[0].deliveryAddress, undefined);
    assert.equal(orders[0].totalAmount, 1150);
  });

  await check("an unknown phone format is refused", async () => {
    const { svc, orders } = build();
    await assert.rejects(() => svc.create(SHOP_ID, { ...base(), customer: { name: "A", whatsAppNumber: "+1 23" } } as any), BadRequestException);
    assert.equal(orders.length, 0);
  });

  // ---- create: online payment ------------------------------------------------------------------------------------------
  await check("online: a payment link is created first, for the server total, with the shop's own keys", async () => {
    const { svc, orders, calls, razorpay } = build();
    const r: any = await svc.create(SHOP_ID, { ...base(), paymentMethod: "online", externalRef: "wa-msg-3" } as any);
    assert.deepEqual(calls, ["createPaymentLink", "createOrder"]);
    assert.equal(razorpay.lastLink.input.amount, 1190);
    assert.equal(razorpay.lastLink.input.currency, "INR");
    assert.equal(razorpay.lastLink.creds.keyId, "rzp_test_1");
    assert.equal(razorpay.lastLink.creds.keySecret, "secret"); // decrypted
    assert.equal(razorpay.lastLink.input.customer.contact, "+919876543210");
    assert.equal(orders[0].paymentMethod, "online");
    assert.equal(orders[0].paymentProvider, "razorpay");
    assert.equal(orders[0].paymentLinkId, "plink_1");
    assert.equal(r.paymentUrl, "https://rzp.io/i/abc");
    assert.equal(r.order.paymentUrl, "https://rzp.io/i/abc");
  });

  await check("online: if Razorpay fails, no order is created and nothing is reserved", async () => {
    const { svc, orders, calls } = build({ razorpayFails: true });
    await assert.rejects(() => svc.create(SHOP_ID, { ...base(), paymentMethod: "online" } as any), /payment link could not be created/);
    assert.equal(orders.length, 0);
    assert.deepEqual(calls, ["createPaymentLink"]);
  });

  await check("online is refused (nothing created) when the shop has no Razorpay keys", async () => {
    const { svc, orders, calls } = build({ shop: { shopName: "S", country: "IN" } });
    await assert.rejects(() => svc.create(SHOP_ID, { ...base(), paymentMethod: "online" } as any), /Online payment is not available/);
    assert.equal(orders.length, 0);
    assert.equal(calls.length, 0);
  });

  await check("online is refused when the shop has switched card payments off", async () => {
    const { svc } = build({ shop: { shopName: "S", country: "IN", razorpay: { directKeyId: "k", directKeySecretEncrypted: encryptSecret("s"), directEnabled: false } } });
    await assert.rejects(() => svc.create(SHOP_ID, { ...base(), paymentMethod: "online" } as any), /Online payment is not available/);
  });

  // ---- payment status ----------------------------------------------------------------------------------------------------
  await check("a paid link marks the order paid and records the payment id", async () => {
    const { svc, orders } = build({ linkStatus: "paid" });
    await svc.create(SHOP_ID, { ...base(), paymentMethod: "online" } as any);
    const rows = [orders[0]];
    await svc.refreshPayments(SHOP_ID, rows);
    assert.equal(orders[0].paymentStatus, "paid");
    assert.equal(orders[0].transactionId, "pay_1");
  });

  await check("an unpaid link stays pending; an expired link is marked failed", async () => {
    const pending = build({ linkStatus: "created" });
    await pending.svc.create(SHOP_ID, { ...base(), paymentMethod: "online" } as any);
    await pending.svc.refreshPayments(SHOP_ID, [pending.orders[0]]);
    assert.equal(pending.orders[0].paymentStatus, "pending");

    const expired = build({ linkStatus: "expired" });
    await expired.svc.create(SHOP_ID, { ...base(), paymentMethod: "online" } as any);
    await expired.svc.refreshPayments(SHOP_ID, [expired.orders[0]]);
    assert.equal(expired.orders[0].paymentStatus, "failed");
  });

  await check("cod orders and already-paid orders are not sent to Razorpay", async () => {
    const { svc, orders, razorpay } = build({ linkStatus: "paid" });
    let asked = 0;
    razorpay.getPaymentLink = async () => { asked++; return { status: "paid", amountPaid: 0 }; };
    await svc.create(SHOP_ID, base() as any);
    await svc.refreshPayments(SHOP_ID, [orders[0], { paymentMethod: "online", paymentStatus: "paid", paymentLinkId: "x" }]);
    assert.equal(asked, 0);
  });

  await check("a Razorpay error while refreshing leaves the order pending and does not throw", async () => {
    const { svc, orders, razorpay } = build();
    await svc.create(SHOP_ID, { ...base(), paymentMethod: "online" } as any);
    razorpay.getPaymentLink = async () => { throw new Error("network"); };
    await svc.refreshPayments(SHOP_ID, [orders[0]]);
    assert.equal(orders[0].paymentStatus, "pending");
  });

  if (process.exitCode) console.error("\nSome checks failed.");
  else console.log(`all ${passed} integration order checks passed`);
})();
