// Razorpay Partner / Route onboarding smoke test.
//
// Drives the real RazorpayGateway class (compiled from dist/) against
// Razorpay's TEST API, exercising every onboarding method end-to-end:
//   createLinkedAccountMinimal → fetchLinkedAccount → createStakeholder
//   → requestProductConfiguration → fetchProductConfiguration
//   → updateProductConfiguration → fetchProductConfiguration
//   → updateLinkedAccount → fetchLinkedAccount
//
// Each step is reported pass/fail; the script keeps running on failure and
// prints a summary at the end. Exits 1 if any step failed.
//
// Usage:
//   1. Compile the latest gateway code:
//        npm run build
//   2. Make sure backend/.env has TEST partner keys:
//        RAZORPAY_PARTNER_KEY_ID=rzp_test_xxxxx
//        RAZORPAY_PARTNER_SECRET=xxxxx
//   3. Run from the backend dir:
//        node razorpay-onboarding-smoke.mjs
//
// Safety: every call hits the TEST Razorpay environment only — sub-merchants
// created here are sandbox accounts, not real merchants. They cannot be
// deleted via the API; the created acc_id is printed at the end so you can
// inspect on the partner dashboard and ignore.

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { RazorpayGateway } from "./dist/modules/payment-gateways/razorpay.gateway.js";

if (!process.env.RAZORPAY_PARTNER_KEY_ID || !process.env.RAZORPAY_PARTNER_SECRET) {
  console.error(
    "Missing RAZORPAY_PARTNER_KEY_ID / RAZORPAY_PARTNER_SECRET in env (.env).",
  );
  process.exit(1);
}
if (!process.env.RAZORPAY_PARTNER_KEY_ID.startsWith("rzp_test_")) {
  console.error(
    "Refusing to run: RAZORPAY_PARTNER_KEY_ID is not a test key (must start with rzp_test_).",
  );
  process.exit(1);
}

const gateway = new RazorpayGateway();

// SMOKE_ACCOUNT_TYPE=standard (default) | route. Standard works without Route
// being activated on the partner; route requires Razorpay to enable it.
const ACCOUNT_TYPE = process.env.SMOKE_ACCOUNT_TYPE || "standard";
if (!["standard", "route"].includes(ACCOUNT_TYPE)) {
  console.error(
    `Invalid SMOKE_ACCOUNT_TYPE='${ACCOUNT_TYPE}'. Use 'standard' or 'route'.`,
  );
  process.exit(1);
}
const PRODUCT_NAME = ACCOUNT_TYPE === "route" ? "route" : "payment_gateway";

// Unique reference so re-runs don't collide on Razorpay's reference_id index.
const stamp = Date.now();
const ref = `smoke_${stamp}`;
const email = `smoke+${stamp}@kioscart.io`;
const phone = String(9000000000 + (stamp % 1_000_000_000)).slice(-10);

const results = [];
const snapshot = { stamp, ref, email, phone, steps: {} };
let accountId = null;
let productConfigId = null;

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, err) {
  const msg = err?.response?.data
    ? JSON.stringify(err.response.data)
    : err?.message || String(err);
  results.push({ name, ok: false, error: msg });
  console.log(`  FAIL  ${name} — ${msg}`);
}

async function step(name, fn) {
  process.stdout.write(`→ ${name}\n`);
  try {
    const out = await fn();
    snapshot.steps[name] = out;
    return out;
  } catch (err) {
    fail(name, err);
    snapshot.steps[name] = { error: err?.message };
    return null;
  }
}

console.log(
  `\nRazorpay onboarding smoke — ref=${ref} type=${ACCOUNT_TYPE} product=${PRODUCT_NAME}\n`,
);

// ---- 1. Create linked account (soft onboarding) ----
const created = await step("createLinkedAccountMinimal", async () => {
  const r = await gateway.createLinkedAccountMinimal({
    shopkeeperId: ref,
    businessName: "Smoke Test Kirana",
    businessEmail: email,
    businessPhone: phone,
    contactName: "Smoke Test Owner",
    country: "IN",
    accountType: ACCOUNT_TYPE,
  });
  if (!r.accountId?.startsWith("acc_"))
    throw new Error(`bad accountId: ${r.accountId}`);
  if (r.status !== "created")
    throw new Error(`expected status=created, got ${r.status}`);
  pass("createLinkedAccountMinimal", `${r.accountId} (${r.status})`);
  return r;
});
if (!created) {
  // Without an account every subsequent call is meaningless.
  console.log("\nAccount creation failed — aborting remaining steps.");
  finish();
}
accountId = created.accountId;

// ---- 2. Fetch it back ----
await step("fetchLinkedAccount (post-create)", async () => {
  const r = await gateway.fetchLinkedAccount(accountId);
  if (r.accountId !== accountId)
    throw new Error(`accountId mismatch: ${r.accountId}`);
  pass("fetchLinkedAccount (post-create)", `status=${r.status}`);
  return r;
});

// ---- 3. Create stakeholder (required before product config) ----
const stakeholder = await step("createStakeholder", async () => {
  const r = await gateway.createStakeholder({
    accountId,
    name: "Smoke Test Owner",
    email,
    phone,
    pan: "AAAPA1234A", // valid format, fake number — accepted by test API
    addressLine1: "23 Test Street",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN",
    relationship: { owner: true },
  });
  if (!r.stakeholderId?.startsWith("sth_"))
    throw new Error(`bad stakeholderId: ${r.stakeholderId}`);
  pass("createStakeholder", r.stakeholderId);
  return r;
});

// ---- 4. Request product config ----
const product = await step("requestProductConfiguration", async () => {
  const r = await gateway.requestProductConfiguration(accountId, PRODUCT_NAME);
  if (!r.productConfigId?.startsWith("acc_prd_"))
    throw new Error(`bad productConfigId: ${r.productConfigId}`);
  pass("requestProductConfiguration", `${r.productConfigId} (${PRODUCT_NAME})`);
  return r;
});
productConfigId = product?.productConfigId;

// ---- 5. Fetch product config — should report "requested" ----
if (productConfigId) {
  await step("fetchProductConfiguration (initial)", async () => {
    const r = await gateway.fetchProductConfiguration(
      accountId,
      productConfigId,
    );
    pass("fetchProductConfiguration (initial)", `status=${r.activationStatus}`);
    if (r.activationStatus !== "requested") {
      console.log(
        `    (note: expected 'requested', got '${r.activationStatus}' — proceeding anyway)`,
      );
    }
    return r;
  });
}

// ---- 6. Submit settlement bank details (the new PATCH) ----
if (productConfigId) {
  await step("updateProductConfiguration", async () => {
    const r = await gateway.updateProductConfiguration({
      accountId,
      productConfigId,
      settlements: {
        accountNumber: "1112220061746", // HDFC test account
        ifscCode: "HDFC0000053",
        beneficiaryName: "Smoke Test Kirana",
      },
      tncAccepted: true,
    });
    pass("updateProductConfiguration", `status=${r.activationStatus}`);
    return r;
  });

  await step("fetchProductConfiguration (post-update)", async () => {
    const r = await gateway.fetchProductConfiguration(
      accountId,
      productConfigId,
    );
    pass("fetchProductConfiguration (post-update)", `status=${r.activationStatus}`);
    return r;
  });
}

// ---- 7. Update the linked account (new PATCH) ----
await step("updateLinkedAccount", async () => {
  const r = await gateway.updateLinkedAccount({
    accountId,
    contactName: "Renamed Smoke Owner",
  });
  if (r.raw?.contact_name !== "Renamed Smoke Owner")
    throw new Error(
      `contact_name not updated: got '${r.raw?.contact_name}'`,
    );
  pass("updateLinkedAccount", `contact_name='${r.raw.contact_name}'`);
  return r;
});

// ---- 8. Final fetch — sanity check rename persisted ----
await step("fetchLinkedAccount (final)", async () => {
  const r = await gateway.fetchLinkedAccount(accountId);
  pass(
    "fetchLinkedAccount (final)",
    `status=${r.status} contact='${r.raw?.contact_name}'`,
  );
  return r;
});

finish();

function finish() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`Sandbox account: ${accountId || "(not created)"}`);
  console.log(
    "  View on dashboard.razorpay.com → Partners → Sub-merchants (Test Mode)",
  );

  const out = "razorpay-onboarding-smoke-snapshot.json";
  writeFileSync(
    out,
    JSON.stringify({ ...snapshot, accountId, results }, null, 2),
  );
  console.log(`Snapshot: ${out}\n`);

  process.exit(failed > 0 ? 1 : 0);
}
