# Payment Gateway Integration

KiosCart uses **Razorpay Route** as its partner-account marketplace gateway. Customers pay through KiosCart's master account, funds sit on hold against each shopkeeper's linked sub-account, and a KiosCart admin releases payments after review.

> **Country support today:** India only. Singapore and other countries fall back to the existing manual PayNow / UPI QR flow. The architecture is gateway-agnostic: adding Stripe Connect for SG (or any other provider) is a new adapter implementing `PaymentGateway`.

---

## 1. Configuration

`backend/.env` keys:

| Key                          | What it is                                                              |
| ---------------------------- | ----------------------------------------------------------------------- |
| `RAZORPAY_PARTNER_KEY_ID`    | Your KiosCart Razorpay partner key (test or live)                       |
| `RAZORPAY_PARTNER_SECRET`    | Partner secret — never check into version control                        |
| `RAZORPAY_WEBHOOK_SECRET`    | Webhook secret you set in Razorpay Dashboard → Webhooks                 |
| `RAZORPAY_PARTNER_ACCOUNT_ID`| Optional: KiosCart's master MID, only used for UI display               |

`frontend/.env` keys:

| Key             | What it is                                                  |
| --------------- | ----------------------------------------------------------- |
| `VITE_API_URL`  | Already required by the rest of the app                     |

The Razorpay Checkout SDK (`checkout.razorpay.com/v1/checkout.js`) is loaded at runtime by `useRazorpayCheckout`; nothing to install.

### Webhook URL to register

In Razorpay Dashboard → Webhooks, add:

```
https://<your-host>/webhooks/razorpay
```

Subscribe to events: `payment.captured`, `payment.failed`, `transfer.processed`, `transfer.failed`, `refund.processed`, `account.under_review`, `account.activated`, `account.rejected`, `account.suspended`.

> **Why a special raw-body parser?** Razorpay signs the raw bytes of the request, not the parsed JSON. `backend/src/main.ts` has a scoped `express.json({ verify })` for `/webhooks/*` that stashes `req.rawBody` for signature verification. Don't move webhook routes to a different prefix without updating that.

---

## 2. Architecture

```
modules/
├── payment-gateways/             # provider-agnostic
│   ├── payment-gateway.interface.ts   # contract every adapter implements
│   ├── razorpay.gateway.ts            # Razorpay Route adapter
│   ├── gateway.factory.ts             # forCountry("IN") / forProvider("razorpay")
│   └── payment-gateways.module.ts     # @Global() — usable anywhere
│
├── payments/
│   ├── checkout.service.ts            # /payments/order, /verify, on-hold transfer
│   ├── webhooks/
│   │   ├── razorpay-webhook.service.ts
│   │   └── razorpay-webhook.controller.ts   # POST /webhooks/razorpay
│   └── schemas/payment.schema.ts      # Payment lifecycle: created -> captured -> on_hold -> released | reversed | failed
│
├── shopkeepers/                       # KYC onboarding endpoints
│   └── shopkeepers.service.ts         # createRazorpayLinkedAccount, createStakeholder, uploadKycDocument, submitForReview
│
└── admin/
    ├── admin-payments.service.ts      # release / bulk-release / refund
    └── admin-payments.controller.ts   # /admin/payments/*
```

### Gateway abstraction

Anything country-aware goes through `PaymentGatewayFactory.forCountry(country)`. SG/others throw `NotImplementedException("Auto-settlement coming soon for {country}")` — UI components catch this and gracefully fall back. **Don't import `RazorpayGateway` directly outside of the `payment-gateways` module.**

---

## 3. Shopkeeper onboarding flow

| Step | Endpoint                                              | What it does                                                                                                                                       |
| ---- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `POST /shopkeepers/razorpay/setup`                    | Creates a Razorpay Route linked account (`POST /v2/accounts`). Stores `accountId`, sets `status=pending_kyc`.                                       |
| 2    | `POST /shopkeepers/razorpay/stakeholder`              | Adds a stakeholder (`POST /v2/accounts/:id/stakeholders`). Required before doc upload.                                                              |
| 3    | `POST /shopkeepers/razorpay/documents/:slot` (multipart, `file`) | Uploads to `POST /v2/accounts/:id/documents`. Slots: `panFront`, `addressProof`, `cancelledCheque`, `gstCert`. Persists Razorpay's returned doc ID. |
| 4    | `POST /shopkeepers/razorpay/submit-for-review`        | Calls `POST /v2/accounts/:id/products` with `route` product. Flips `status=under_review`.                                                           |
| 5    | (webhook) `account.activated`                         | Backend flips `status=active`. Shopkeeper can now accept payments.                                                                                  |

UI: `frontend/src/components/shopkeeper/RazorpayOnboarding.tsx` renders the right step based on backend state. It polls account status every 30s while `under_review`. Mounted in `ShopkeeperSettings.tsx` under the "Razorpay Payment Setup" card.

The legacy razorpay block in `ShopkeeperSettings.tsx` is kept under a `{false && ...}` guard for visual reference. Delete it once the new flow is verified end-to-end.

---

## 4. Customer payment flow

```
Customer                Frontend                Backend                  Razorpay
   │                       │                       │                       │
   │  click Pay            │                       │                       │
   │──────────────────────▶│  POST /payments/order │                       │
   │                       │──────────────────────▶│  POST /v1/orders      │
   │                       │                       │──────────────────────▶│
   │                       │   { gatewayOrderId }  │                       │
   │                       │◀──────────────────────│◀──────────────────────│
   │  Razorpay modal opens │                       │                       │
   │  with our keyId+order │                       │                       │
   │                       │                       │                       │
   │  enters card/UPI      │                       │  (SDK posts directly  │
   │       ──────────────────────────────────────▶  to Razorpay; card data │
   │                       │                       │   never touches us)   │
   │                       │                       │                       │
   │  on success: handler  │  POST /payments/verify│                       │
   │                       │──────────────────────▶│  HMAC verify          │
   │                       │                       │  → mark Payment       │
   │                       │                       │    captured           │
   │                       │                       │  → POST /payments/:id │
   │                       │                       │    /transfers (on_hold│
   │                       │                       │     = 1, amount = net)│
   │                       │                       │──────────────────────▶│
   │                       │                       │   { transferId }      │
   │                       │                       │◀──────────────────────│
   │                       │  { paymentId, ok }    │                       │
   │                       │◀──────────────────────│                       │
```

**Idempotency:** if the customer closes the page before `/payments/verify` fires, the `payment.captured` webhook does the same work via `CheckoutService.createOnHoldTransferForPayment`. Both paths guard on `payment.transferId` already being set.

**Commission:** at `/payments/order` time we compute `commissionAmount = amount * (shopkeeper.commissionPercentage / 100)` and `netAmount = amount - commissionAmount`. The on-hold transfer is created for `netAmount`, so commission stays on KiosCart's balance.

---

## 5. Admin release flow

| Endpoint                                  | What it does                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /admin/payments/pending-releases`    | List + per-currency totals. Filters: `shopkeeperId`, `country`, `minAgeDays`, `page`.     |
| `GET /admin/payments/released`            | History.                                                                                 |
| `GET /admin/payments/refunded`            | History.                                                                                 |
| `PATCH /admin/payments/:id/release`       | `PATCH /v1/transfers/:transferId { on_hold: 0 }` — money flows to shopkeeper bank in T+2. |
| `POST /admin/payments/bulk-release`       | Body: `{ paymentIds: [], note? }`. Per-row results so partial failures don't tank batch.  |
| `PATCH /admin/payments/:id/refund`        | Reverses on-hold transfer first, then refunds the gateway payment.                        |

UI: `frontend/src/pages/admin/PaymentsPage.tsx`, mounted at `/admin-dashboard/payments` (sidebar entry "Payments").

> **Refund + already-released:** if you refund after release, the reversal step is skipped (transfer was already disbursed). The refund pulls from KiosCart's master balance and the system logs a warning. Recovering from the shopkeeper is a manual business process.

---

## 6. Adding a new country / gateway

1. Implement `PaymentGateway` in a new file under `backend/src/modules/payment-gateways/` (e.g., `stripe.gateway.ts`).
2. Register it in `payment-gateways.module.ts` providers/exports.
3. Add the country branch in `gateway.factory.ts`'s `forCountry()`.
4. Map the new provider name in `forProvider()` so webhooks route correctly.
5. Add a `webhooks/<provider>-webhook.controller.ts` if the provider's signature scheme differs from Razorpay's.
6. The frontend's `useRazorpayCheckout` is Razorpay-specific. Add a sibling hook (e.g., `useStripeCheckout`) and pick at runtime based on the shopkeeper's country.

---

## 7. PCI scope note

We use **Razorpay Custom Checkout** — the SDK collects card/UPI details and tokenizes them in the browser. Card numbers never reach our backend. This keeps us out of PCI-DSS Level 1 scope; only SAQ-A applies. **Do not add server-side card collection** without a compliance program in place.

---

## 8. Testing locally

1. Set `RAZORPAY_PARTNER_KEY_ID`, `RAZORPAY_PARTNER_SECRET` (test mode) in `backend/.env`.
2. For webhook testing, expose your local backend (e.g., `ngrok http 3000`) and register the public URL in Razorpay Dashboard → Webhooks. Set `RAZORPAY_WEBHOOK_SECRET` to whatever you typed there.
3. Use Razorpay's [test cards](https://razorpay.com/docs/payments/payments/test-card-details/) and test UPI handle (`success@razorpay`) in checkout.
4. `account.activated` is sent automatically in test mode after KYC submission — a real KYC review happens in live mode only.
