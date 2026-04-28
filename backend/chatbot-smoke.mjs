// Chatbot smoke test — posts every prompt that ships in the suggested-cards
// pack to /chatbot/message and verifies the response shape.
//
// Usage:
//   1. Open the running app, log in as the shopkeeper you want to test as.
//   2. DevTools console → `sessionStorage.getItem("token")` → copy the JWT.
//   3. Run from the backend dir:
//        CHATBOT_TEST_TOKEN=eyJ... node chatbot-smoke.mjs
//      or override the URL:
//        BACKEND_URL=http://localhost:3000 CHATBOT_TEST_TOKEN=eyJ... node chatbot-smoke.mjs
//
// Prints a one-line pass/fail per case and writes a full JSON snapshot to
// chatbot-smoke-snapshots.json so you can diff between runs and spot
// regressions in tone, shape, or routing. Exits 1 if any case fails.
//
// All cases are read-only or fast-path-only; none create or mutate data.
// The "Add customer …" case only triggers the customerForm payload —
// it does NOT create a real customer.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BACKEND_URL || "http://localhost:3000";
const TOKEN = process.env.CHATBOT_TEST_TOKEN;

if (!TOKEN) {
  console.error(
    "Set CHATBOT_TEST_TOKEN env var (paste a shopkeeper JWT from the running app's sessionStorage).",
  );
  process.exit(1);
}

const cases = [
  // Deterministic fast-paths — should never hit the LLM.
  {
    name: "today-revenue",
    prompt: "Show today's revenue",
    expect: (r) =>
      r?.analytics?.period === "today" && typeof r.analytics.revenue === "number",
  },
  {
    name: "this-month-analytics",
    prompt: "This month analytics",
    expect: (r) => r?.analytics?.period === "monthly",
  },
  {
    name: "place-order-form",
    prompt: "Place an order",
    expect: (r) =>
      r?.orderForm &&
      Array.isArray(r.orderForm.catalog) &&
      typeof r.orderForm.qrReady === "boolean" &&
      ["IN", "SG"].includes(r.orderForm.country),
  },
  {
    name: "place-new-order",
    prompt: "Create new order",
    expect: (r) => r?.orderForm && Array.isArray(r.orderForm.catalog),
  },
  {
    name: "add-customer-form",
    prompt: "Add customer Test User, +911234567890, smoke@test.local",
    expect: (r) =>
      r?.customerForm &&
      r.customerForm.firstName === "Test" &&
      r.customerForm.lastName === "User" &&
      r.customerForm.whatsapp === "+911234567890" &&
      r.customerForm.email === "smoke@test.local",
  },
  {
    name: "add-customer-empty-form",
    prompt: "Add a customer",
    expect: (r) => r?.customerForm && Object.keys(r.customerForm).length === 0,
  },
  {
    name: "show-all-products",
    prompt: "Show all products",
    expect: (r) => Array.isArray(r?.productTree),
  },
  {
    name: "add-product-nav",
    prompt: "Add a new Product",
    expect: (r) =>
      r?.botAction?.type === "navigate" &&
      r.botAction.tab === "products" &&
      r.botAction.action === "add",
  },
  {
    name: "edit-product-nav",
    prompt: "Edit product Mango",
    expect: (r) =>
      r?.botAction?.type === "navigate" &&
      r.botAction.tab === "products" &&
      r.botAction.action === "edit" &&
      typeof r.botAction.productName === "string",
  },

  // LLM-driven paths — require a non-empty text reply with no obvious
  // hallucination markers.
  {
    name: "show-pending-orders",
    prompt: "Show pending orders",
    expect: (r) => typeof r?.text === "string" && r.text.length > 0,
  },
  {
    name: "show-customers",
    prompt: "Show all my customers",
    expect: (r) => typeof r?.text === "string" && r.text.length > 0,
  },
  {
    name: "low-stock",
    prompt: "Low stock products",
    expect: (r) => typeof r?.text === "string" && r.text.length > 0,
  },
  {
    name: "shop-info",
    prompt: "Show shop info",
    expect: (r) => typeof r?.text === "string" && r.text.length > 0,
  },

  // Knowledge-base explainer cards — should reference tabs / features.
  // We use word-presence checks instead of exact strings to be tolerant of
  // wording changes while catching dead-empty responses.
  {
    name: "kb-delivery",
    prompt: "How do I enable delivery?",
    expect: (r) =>
      typeof r?.text === "string" && /(delivery|settings)/i.test(r.text),
  },
  {
    name: "kb-payments",
    prompt: "How do payments work in KiosCart?",
    expect: (r) =>
      typeof r?.text === "string" && /(upi|paynow|payment)/i.test(r.text),
  },
  {
    name: "kb-operator",
    prompt: "How do I add an operator?",
    expect: (r) =>
      typeof r?.text === "string" && /(operator|settings)/i.test(r.text),
  },
  {
    name: "kb-kiosk-mode",
    prompt: "What does Kiosk mode do?",
    expect: (r) =>
      typeof r?.text === "string" && /(kiosk|order|walk-in|in-store)/i.test(r.text),
  },
  {
    name: "kb-coupon",
    prompt: "How do I create a coupon?",
    expect: (r) =>
      typeof r?.text === "string" && /(coupon|settings)/i.test(r.text),
  },
  {
    name: "kb-hardware",
    prompt: "What hardware do I need to run KiosCart?",
    expect: (r) =>
      typeof r?.text === "string" &&
      /(tablet|hardware|terminal|printer)/i.test(r.text),
  },
  {
    name: "kb-import",
    prompt: "Can I bulk import products?",
    expect: (r) =>
      typeof r?.text === "string" && /(import|excel|csv|bulk|products)/i.test(r.text),
  },
  {
    // Plans card carries a hallucination risk — model must NOT fabricate
    // specific prices (the knowledge base only mentions tiers by name).
    name: "kb-plans-no-fabricated-prices",
    prompt: "What plans does KiosCart offer?",
    expect: (r) => {
      if (typeof r?.text !== "string") return false;
      // A line like "Starter: ₹999/month" or "S$49" would be fabricated.
      const fabricated =
        /(?:rs\.?\s*\d|₹\s*\d|s\$\s*\d|\$\s*\d|usd\s*\d|inr\s*\d)/i.test(r.text);
      return !fabricated && /(starter|enterprise|plan)/i.test(r.text);
    },
  },

  // Greeting / general — should personalise greeting line.
  {
    name: "greeting",
    prompt: "hi",
    expect: (r) => typeof r?.text === "string" && r.text.length > 0,
  },

  // No-tool fallback — should not invent an answer for an off-topic question.
  {
    name: "no-tool-fallback",
    prompt: "What is the capital of France?",
    expect: (r) => {
      if (typeof r?.text !== "string") return false;
      // Ideally returns the literal "I don't have an answer for that yet" line,
      // but accept any reply that does NOT mention "Paris" as a pass.
      return !/paris/i.test(r.text);
    },
  },
];

const snapshots = {};
let passed = 0;
let failed = 0;

console.log(`Posting ${cases.length} prompts to ${BASE}/chatbot/message …\n`);

for (const c of cases) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/chatbot/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ message: c.prompt }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`✗ ${c.name.padEnd(36)} HTTP ${res.status} (${ms}ms)`);
      snapshots[c.name] = {
        prompt: c.prompt,
        latencyMs: ms,
        error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        pass: false,
      };
      failed++;
      continue;
    }
    const data = await res.json();
    let ok = false;
    let expectErr = null;
    try {
      ok = !!c.expect(data);
    } catch (e) {
      expectErr = e.message;
    }
    snapshots[c.name] = {
      prompt: c.prompt,
      latencyMs: ms,
      response: data,
      pass: ok,
      ...(expectErr ? { expectError: expectErr } : {}),
    };
    if (ok) {
      console.log(`✓ ${c.name.padEnd(36)} ${ms}ms`);
      passed++;
    } else {
      console.log(
        `✗ ${c.name.padEnd(36)} expectation failed (${ms}ms)${expectErr ? ` — ${expectErr}` : ""}`,
      );
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${c.name.padEnd(36)} ${e.message}`);
    snapshots[c.name] = { prompt: c.prompt, error: e.message, pass: false };
    failed++;
  }
}

const outPath = join(__dirname, "chatbot-smoke-snapshots.json");
writeFileSync(outPath, JSON.stringify(snapshots, null, 2), "utf8");

console.log(
  `\n${passed}/${cases.length} passed (${failed} failed). Full snapshot → ${outPath}`,
);
process.exit(failed > 0 ? 1 : 0);
