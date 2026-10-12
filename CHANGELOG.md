# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Order placement for the ComBox connector** (`POST /integration/v1/orders`, API-key authenticated) so a customer chatting
  on WhatsApp can order without opening the storefront.
  - `POST /integration/v1/orders/quote` prices a basket (items, delivery fee, discount, tax) and reports which payment
    methods the shop accepts. Nothing is created.
  - `POST /integration/v1/orders` places the order. The caller never sends a price or total: everything is priced on the
    server from the shop's own data using the same rules as the storefront cart, stock is checked first, and repeating a
    request with the same `externalRef` returns the same order. Unknown fields are rejected.
  - `paymentMethod: "cod"` creates the order to be paid on delivery or at pickup.
  - `paymentMethod: "online"` (India, shops using their own Razorpay keys) creates a Razorpay payment link first, then the
    order, and returns `paymentUrl` to send to the customer. The order shows `paymentStatus: "paid"` once Razorpay
    reports the link paid (checked whenever the order is read or listed).
  - `GET /integration/v1/orders/:id` returns one order with its current payment status.
- Orders record `paymentMethod`, `paymentLinkId`, `paymentLinkUrl`, `integrationRef` and `source`.

---

## [1.0.0] - 2026-03-26

### Added
- **Shopkeeper Dashboard** with 6 tabs: Dashboard, Products, Orders & Cart, CRM, Storefront, Settings
- **Product Management** with variants, subcategories, bulk import/export via Excel, inventory tracking
- **Order Management** with status workflow, A4 & 58mm thermal receipt generation, WhatsApp notifications
- **CRM System** with customer database, order history, marketing tools
- **Storefront Customizer** with multiple layout themes (modern, minimal, classic), hero banners, color schemes
- **Public Storefront** with product catalog, search, filters, category browsing
- **Shopping Cart** with multi-store support, coupon codes, delivery/pickup options
- **Kiosk Mode** for shopkeeper self-ordering with auto pickup date/time
- **Payment Flow** with QR-based payments (UPI, PayNow), payment confirmation
- **WhatsApp Integration** via Baileys for OTP verification and order notifications
- **Google OAuth** for shopkeepers, buyers, and organizers
- **Admin Panel** with user management, pricing plans, and settings
- **Custom Domain Support** with centralized config in `App.tsx`
- **FAQ Section** in Shopkeeper Dashboard "Need Help?" dialog
- **Error Boundary** wrapping entire app for crash recovery

### Performance
- Lazy-loaded route components and dashboard tab components (~70% smaller initial bundle)
- Parallelized dashboard API calls via `Promise.allSettled()` (~4x faster load)
- WebP auto-conversion middleware with disk caching (60-80% smaller images)
- Storefront bundle API — single endpoint returns store + shopkeeper + products
- `Cache-Control` headers on storefront bundle (60s cache, 5min stale-while-revalidate)
- MongoDB compound indexes on orders, products, and stores
- `bulkWrite` for inventory updates instead of N+1 individual queries
- `useMemo`/`useCallback` on expensive computations and context values
- Google Fonts loaded non-blocking via preload hints
- Gzip compression on all API responses
- Static asset caching with 7-day max-age
- `lucide-react` icons split into separate chunk
- CSS code splitting enabled

### Security
- JWT secret sourced from environment variable (no hardcoded fallback in guards)
- All OAuth redirect URLs driven by `FRONTEND_URL` / `BACKEND_URL` env vars
- `forbidNonWhitelisted: true` on ValidationPipe to reject unexpected fields
- CORS whitelist includes `www.` variants of all domains
- Removed 100+ `console.log` statements from production code

### Fixed
- N+1 query in `generateReceipt()` — eliminated 2 redundant DB calls
- `printDataStore` memory leak — added TTL cleanup and one-time-use retrieval
- `response.json()` not awaited in `paymentPage.tsx` (was returning a Promise, not data)
- `await setState()` anti-pattern in `cartPage.tsx` (5 instances)
- `fs.unlinkSync` blocking event loop — replaced with async `fs.promises.unlink`
- WhatsApp reconnection crash — unhandled promise rejection in `otp.service.ts`
- Missing `.lean()` on 20+ read-only Mongoose queries
- Cart page JSX structure errors in kiosk mode pickup section
- New customer WhatsApp validation returning fetch error instead of "New Customer" message

---

## Version Guide

| Version | Type | When to bump |
|---------|------|--------------|
| `1.0.0` -> `1.0.1` | **Patch** | Bug fixes, typo corrections, dependency updates |
| `1.0.0` -> `1.1.0` | **Minor** | New features, non-breaking API additions |
| `1.0.0` -> `2.0.0` | **Major** | Breaking API changes, database schema changes |

To create a new release:

```bash
# Update version in both package.json files
# Update this CHANGELOG.md
# Commit and tag

git add -A
git commit -m "release: v1.1.0 — description of changes"
git tag -a v1.1.0 -m "v1.1.0 — description of changes"
git push origin main --tags
```
