/**
 * Checks for kiosk QR payments ("Payment pending" until paid). Run with:
 *   npx ts-node --transpile-only src/modules/kiosk-payments/kiosk-payments.check.ts
 * Uses an in-memory stand-in for the database and OrdersService (the project has no test runner or test DB).
 */
import "reflect-metadata";
import * as assert from "node:assert/strict";
import { KioskPaymentsService } from "./kiosk-payments.service";
import { payNowMobile, qrKindFor } from "./kiosk-payment-qr";

const SHOP_ID = "64b000000000000000000001";
const OTHER_SHOP = "64b000000000000000000002";

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
const lean = (value: any) => {
  const c: any = { select: () => c, sort: () => c, limit: () => c, lean: async () => (value ? JSON.parse(JSON.stringify(value)) : value) };
  return c;
};

/** Enough of MongoDB's query matching for this service: equality, $in, $gt, $lt, $gte, $or. */
const matches = (doc: any, q: any): boolean =>
  Object.entries(q).every(([k, cond]: [string, any]) => {
    if (k === "$or") return cond.some((sub: any) => matches(doc, sub));
    const v = doc[k];
    const cmp = (x: any) => (x instanceof Date ? x.getTime() : x);
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, arg]: [string, any]) => {
        if (op === "$in") return arg.map(String).includes(String(v));
        if (op === "$gt") return cmp(v) > cmp(arg);
        if (op === "$gte") return cmp(v) >= cmp(arg);
        if (op === "$lt") return cmp(v) < cmp(arg);
        if (op === "$type") return typeof v === arg;
        throw new Error(`unsupported ${op}`);
      });
    }
    return String(v) === String(cond);
  });

const apply = (doc: any, u: any) => {
  Object.assign(doc, u.$set || {});
  for (const k of Object.keys(u.$unset || {})) delete doc[k];
  doc.updatedAt = new Date();
};

function build(opts: { shop?: any; failOrder?: string } = {}) {
  const rows: any[] = [];
  const orders: any[] = [];
  let seq = 0;
  const shop = opts.shop ?? { _id: SHOP_ID, shopName: "Fox Snacks", country: "SG", phone: "+65 9123 4567" };

  const paymentModel: any = {
    findOne: (q: any) => lean(rows.find((r) => matches(r, q)) ?? null),
    findById: (id: any) => lean(rows.find((r) => String(r._id) === String(id)) ?? null),
    find: (q: any) => lean(rows.filter((r) => matches(r, q)).reverse()),
    create: async (doc: any) => {
      if (doc.externalRef && rows.some((r) => String(r.shopkeeperId) === String(doc.shopkeeperId) && r.externalRef === doc.externalRef)) {
        throw new Error("E11000 duplicate key");
      }
      const row = { _id: `64c00000000000000000000${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...doc };
      rows.push(row);
      return { toObject: () => JSON.parse(JSON.stringify(row)) };
    },
    findOneAndUpdate: (q: any, u: any) => {
      const r = rows.find((x) => matches(x, q));
      if (r) apply(r, u);
      return lean(r ?? null);
    },
    findByIdAndUpdate: (id: any, u: any) => {
      const r = rows.find((x) => String(x._id) === String(id));
      if (r) apply(r, u);
      return lean(r ?? null);
    },
    updateOne: async (q: any, u: any) => {
      const r = rows.find((x) => matches(x, q));
      if (r) apply(r, u);
      return {};
    },
    updateMany: async (q: any, u: any) => {
      rows.filter((x) => matches(x, q)).forEach((r) => apply(r, u));
      return {};
    },
  };
  const shopModel: any = { findById: () => lean(shop) };
  const orderModel: any = { findOne: (q: any) => lean(orders.find((o) => o.integrationRef === q.integrationRef) ?? null) };
  const ordersService: any = {
    createOrder: async (dto: any) => {
      if (opts.failOrder) throw new Error(`Failed to create order: ${opts.failOrder}`);
      const o = { _id: `o${orders.length + 1}`, ...dto };
      orders.push(o);
      return o;
    },
  };
  return { svc: new KioskPaymentsService(paymentModel, shopModel, orderModel, ordersService), rows, orders };
}

const sale = (over: any = {}) => ({
  source: "combox-kiosk" as const,
  externalRef: "kiosk-4-sale-abc",
  amount: 24.5,
  customerName: "Asha",
  customerWhatsApp: "+6590037950",
  lines: [{ name: "Masala Chai", quantity: 2, lineTotal: 24.5 }],
  order: { orderId: "foxsnacks-order-x1", items: [{ productId: "p1", quantity: 2 }], totalAmount: 24.5, orderType: "pickup", integrationRef: "kiosk-4-sale-abc" },
  ...over,
});

(async () => {
  await check("PayNow needs a Singapore mobile; UPI needs the uploaded QR", () => {
    assert.equal(payNowMobile("+65 9123 4567"), "91234567");
    assert.equal(payNowMobile("6581234567"), "81234567");
    assert.equal(payNowMobile("12345"), null);
    assert.equal(qrKindFor({ country: "SG", phone: "91234567" }), "paynow");
    assert.equal(qrKindFor({ country: "SG" }), null);
    assert.equal(qrKindFor({ country: "IN", paymentURL: "/uploads/qr.png" }), "upi");
    assert.equal(qrKindFor({ country: "IN" }), null);
  });

  await check("a sale goes on Payment pending with a link and a PayNow QR; no order is placed yet", async () => {
    const { svc, orders } = build();
    const p: any = await svc.create(SHOP_ID, sale());
    assert.equal(p.status, "pending");
    assert.equal(p.amount, 24.5);
    assert.equal(p.currency, "SGD");
    assert.match(p.payUrl, /\/kiosk-pay\/[A-Za-z0-9_-]{24}$/);
    assert.match(p.qr.imageUrl, /sgqrcode\.com\/paynow\?mobile=91234567&.*amount=24\.50/);
    assert.equal(orders.length, 0);
  });

  await check("the same externalRef returns the same payment", async () => {
    const { svc, rows } = build();
    const a: any = await svc.create(SHOP_ID, sale());
    const b: any = await svc.create(SHOP_ID, sale());
    assert.equal(a.id, b.id);
    assert.equal(rows.length, 1);
  });

  await check("a shop without QR set up is told what to add", async () => {
    const { svc } = build({ shop: { _id: SHOP_ID, shopName: "Fox", country: "SG", phone: "" } });
    await assert.rejects(svc.create(SHOP_ID, sale()), /Settings > Profile > Phone/);
  });

  await check("the customer's 'I have paid' places the order once, marked paid by QR", async () => {
    const { svc, orders } = build();
    const p: any = await svc.create(SHOP_ID, sale());
    const token = p.payUrl.split("/").pop();
    const view: any = await svc.publicView(token);
    assert.equal(view.shopName, "Fox Snacks");
    assert.equal(view.status, "pending");

    const r1: any = await svc.markPaidByCustomer(token);
    const r2: any = await svc.markPaidByCustomer(token);
    assert.equal(r1.status, "paid");
    assert.equal(r2.status, "paid");
    assert.equal(orders.length, 1);
    assert.equal(orders[0].orderId, "foxsnacks-order-x1");
    assert.equal(orders[0].paymentStatus, "paid");
    assert.equal(orders[0].paymentMethod, "qr");
    assert.equal(orders[0].shopkeeperId, SHOP_ID);

    // the kiosk confirming as well changes nothing
    const again: any = await svc.markPaidByStaff(SHOP_ID, p.id);
    assert.equal(again.paidBy, "customer");
    assert.equal(orders.length, 1);
  });

  await check("staff can confirm at the kiosk, even once the link has expired; the customer cannot", async () => {
    const { svc, rows, orders } = build();
    const p: any = await svc.create(SHOP_ID, sale());
    rows[0].expiresAt = new Date(Date.now() - 1000);
    const token = p.payUrl.split("/").pop();
    await assert.rejects(svc.markPaidByCustomer(token), /expired/);
    assert.equal(orders.length, 0);

    const staff: any = await svc.markPaidByStaff(SHOP_ID, p.id);
    assert.equal(staff.status, "paid");
    assert.equal(staff.paidBy, "staff");
    assert.equal(orders.length, 1);
  });

  await check("if the order cannot be placed, the payment stays pending and says why", async () => {
    const { svc, rows } = build({ failOrder: "Only 1 left of Masala Chai" });
    const p: any = await svc.create(SHOP_ID, sale());
    await assert.rejects(svc.markPaidByStaff(SHOP_ID, p.id), /Only 1 left of Masala Chai/);
    assert.equal(rows[0].status, "pending");
    assert.equal(rows[0].paidBy, undefined);
  });

  await check("a cancelled payment cannot be paid; another shop cannot see or settle it", async () => {
    const { svc, orders } = build();
    const p: any = await svc.create(SHOP_ID, sale());
    await assert.rejects(svc.markPaidByStaff(OTHER_SHOP, p.id), /not found/);
    await assert.rejects(svc.cancel(OTHER_SHOP, p.id), /not found/);
    const c: any = await svc.cancel(SHOP_ID, p.id);
    assert.equal(c.status, "cancelled");
    await assert.rejects(svc.markPaidByCustomer(p.payUrl.split("/").pop()), /cancelled/);
    assert.equal(orders.length, 0);
  });

  await check("the list shows the shop's waiting payments and marks old links expired", async () => {
    const { svc, rows } = build();
    await svc.create(SHOP_ID, sale({ externalRef: "kiosk-4-a" }));
    await svc.create(SHOP_ID, sale({ externalRef: "kiosk-4-b", order: { ...sale().order, orderId: "foxsnacks-order-x2" } }));
    rows[0].expiresAt = new Date(Date.now() - 1000);
    const { payments } = await svc.list(SHOP_ID, { source: "combox-kiosk" });
    assert.equal(payments.length, 2);
    assert.deepEqual(payments.map((x: any) => x.status).sort(), ["expired", "pending"]);
  });

  console.log(process.exitCode ? "Some checks failed." : `all ${passed} kiosk payment checks passed`);
})();
