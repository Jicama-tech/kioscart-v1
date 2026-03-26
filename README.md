<p align="center">
  <img src="frontend/KiosCartLogo.png" alt="KiosCart Logo" width="200" />
</p>

<h1 align="center">KiosCart</h1>

<p align="center">
  <strong>All-in-one e-commerce platform for kiosks and cart-based businesses</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#tech-stack">Tech Stack</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#project-structure">Project Structure</a> &bull;
  <a href="#environment-variables">Environment Variables</a> &bull;
  <a href="#custom-domain-setup">Custom Domain</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="#license">License</a>
</p>

---

## Overview

KiosCart is a full-stack e-commerce platform that bridges physical kiosks with digital storefronts. Shopkeepers can create, customize, and manage their online stores while serving customers through both in-person kiosk mode and online ordering.

---

## Features

### Shopkeeper Dashboard
- **Product Management** -- Add, edit, bulk import/export products with variants, subcategories, and inventory tracking
- **Order Management** -- Real-time order tracking, status updates, receipt generation (A4 & 58mm thermal)
- **CRM** -- Customer database, order history, WhatsApp messaging, marketing tools
- **Storefront Customizer** -- Drag-and-drop theme builder with multiple layout options
- **Analytics** -- Revenue trends, top products, category performance, customer insights
- **Settings** -- Payment QR codes, business hours, GST/UEN verification, operator management, coupons

### Customer Storefront
- **Custom Domain Support** -- White-label storefronts on your own domain
- **Responsive Design** -- Optimized for mobile, tablet, and desktop
- **Product Catalog** -- Search, filter, category browsing, product details with variants
- **Shopping Cart** -- Multi-store support, coupon codes, delivery/pickup options
- **Payment** -- QR-based payments (UPI, PayNow), payment confirmation flow
- **WhatsApp Integration** -- Order notifications, OTP verification

### Kiosk Mode
- **Self-Order** -- Shopkeepers can place orders on behalf of walk-in customers
- **Auto Pickup** -- Automatically sets pickup date/time to now (no manual selection)
- **Customer Lookup** -- Validate WhatsApp number to auto-fill returning customer details

### Admin Panel
- **User Management** -- View and manage all shopkeepers and users
- **Pricing Plans** -- Configure subscription tiers
- **Platform Analytics** -- System-wide metrics and reporting

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool & dev server |
| Tailwind CSS | Styling |
| shadcn/ui | Component library (Radix UI) |
| React Router v6 | Client-side routing |
| Recharts | Analytics charts |
| React Helmet | SEO & meta tags |
| Capacitor | Mobile app (iOS/Android) |

### Backend
| Technology | Purpose |
|-----------|---------|
| NestJS | API framework |
| MongoDB + Mongoose | Database & ODM |
| JWT | Authentication |
| Passport.js | Google OAuth |
| Baileys | WhatsApp integration |
| PDFKit | Receipt generation |
| Sharp | WebP image optimization |
| Multer | File uploads |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **MongoDB** running locally or a MongoDB Atlas URI
- **npm** or **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/Jicama-tech/kioscart-v1.git
cd kioscart-v1

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Running Locally

**Backend** (runs on port 3000):
```bash
cd backend
cp .env.example .env   # Configure your environment variables
npm run start:dev       # Development mode with hot reload
```

**Frontend** (runs on port 8080):
```bash
cd frontend
cp .env.example .env   # Set VITE_API_URL=http://localhost:3000
npm run dev
```

Open **http://localhost:8080** in your browser.

---

## Project Structure

```
kioscart-v1/
├── backend/
│   ├── src/
│   │   ├── main.ts                    # App entry point, CORS, compression, middleware
│   │   ├── app.module.ts              # Root module
│   │   ├── middleware/
│   │   │   └── webp-image.middleware.ts  # Auto WebP conversion
│   │   └── modules/
│   │       ├── auth/                  # JWT + Google OAuth authentication
│   │       ├── users/                 # User management
│   │       ├── shopkeepers/           # Shopkeeper profiles & analytics
│   │       ├── shopkeeper-stores/     # Storefront settings & bundle API
│   │       ├── products/              # Product CRUD, bulk import/export
│   │       ├── orders/                # Order management, receipts, inventory
│   │       ├── payments/              # Payment QR generation
│   │       ├── coupon/                # Coupon management
│   │       ├── otp/                   # WhatsApp OTP via Baileys
│   │       ├── operators/             # Store operator management
│   │       ├── admin/                 # Admin panel APIs
│   │       ├── plans/                 # Subscription plans
│   │       └── ...
│   ├── uploads/                       # Uploaded images (gitignored)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Root component, routing, custom domain config
│   │   ├── main.tsx                   # Entry point
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx        # Public landing page
│   │   │   ├── shopkeeper/
│   │   │   │   └── ShopkeeperDashboard.tsx  # Main dashboard
│   │   │   └── admin/                 # Admin pages
│   │   ├── components/
│   │   │   ├── shopkeeper/            # Dashboard components
│   │   │   │   ├── ProductManagement.tsx
│   │   │   │   ├── CartManagement.tsx
│   │   │   │   ├── CRMManagement.tsx
│   │   │   │   ├── ShopkeeperSettings.tsx
│   │   │   │   ├── StorefrontCustomizer.tsx
│   │   │   │   ├── cartPage.tsx
│   │   │   │   └── paymentPage.tsx
│   │   │   ├── user/
│   │   │   │   └── shopkeeperStoreFront.tsx  # Public storefront
│   │   │   ├── auth/                  # Login/register components
│   │   │   └── ui/                    # shadcn/ui components
│   │   ├── hooks/
│   │   │   ├── useAuth.tsx            # Auth context & token management
│   │   │   ├── cartContext.tsx         # Shopping cart state
│   │   │   └── useCurrencyhook.tsx    # Multi-currency formatting
│   │   └── index.css                  # Tailwind + custom styles
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Database
MONGO_URI=mongodb://127.0.0.1:27017/kioscart

# Server
PORT=3000
FRONTEND_URL=http://localhost:8080
BACKEND_URL=http://localhost:3000

# Authentication
JWT_ACCESS_SECRET=your_jwt_secret_here
JWT_ACCESS_EXPIRY=900s
JWT_REFRESH_EXPIRY=7d

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/redirect
GOOGLE_SHOPKEEPER_REDIRECT_URI=http://localhost:3000/auth/google-shopkeeper/redirect
GOOGLE_BUYER_REDIRECT_URI=http://localhost:3000/auth/google-buyer/redirect
GOOGLE_ORGANIZER_REDIRECT_URI=http://localhost:3000/auth/google-organizer/redirect

# Email (Nodemailer)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000
```

---

## Custom Domain Setup

KiosCart supports white-label storefronts on custom domains. To add a new custom domain:

### 1. Frontend Config

Edit `CUSTOM_DOMAIN_CONFIG` in `frontend/src/App.tsx`:

```typescript
const CUSTOM_DOMAIN_CONFIG = {
  "yourdomain.com": {
    slug: "your-store-slug",
    title: "Your Store Name",
    description: "Your store description",
  },
  "www.yourdomain.com": {
    slug: "your-store-slug",
    title: "Your Store Name",
    description: "Your store description",
  },
};
```

### 2. Backend CORS

Add the domain to `ALLOWED_DOMAINS` in `backend/src/main.ts`:

```typescript
const ALLOWED_DOMAINS = new Set([
  "https://yourdomain.com",
  "https://www.yourdomain.com",
  // ... existing domains
]);
```

### 3. DNS

Point your domain's DNS A record to your server's IP address.

---

## Performance Optimizations

KiosCart includes several built-in performance optimizations:

- **Code Splitting** -- Lazy-loaded routes and tab components reduce initial bundle by ~70%
- **Parallel API Calls** -- Dashboard loads 5 APIs simultaneously via `Promise.allSettled()`
- **WebP Auto-Conversion** -- Images served as WebP (60-80% smaller) with disk caching
- **Storefront Bundle API** -- Single endpoint returns store + shopkeeper + products in one call
- **Response Caching** -- Storefront bundle cached for 60s with stale-while-revalidate
- **Database Indexes** -- Compound indexes on orders, products, and stores for fast queries
- **Bulk Operations** -- Inventory updates use MongoDB `bulkWrite` instead of N+1 queries
- **Memoization** -- `useMemo`/`useCallback` on expensive computations and context values
- **Font Preloading** -- Google Fonts loaded non-blocking via preload hints
- **Gzip Compression** -- All responses compressed via middleware
- **Static Asset Caching** -- Uploaded files served with 7-day cache headers

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Email/password login |
| GET | `/auth/google-shopkeeper` | Google OAuth for shopkeepers |
| GET | `/auth/google-buyer` | Google OAuth for buyers |
| POST | `/auth/check-role` | Verify user role |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/products/create-product` | Create product (with images) |
| PATCH | `/products/update-product/:id` | Update product |
| DELETE | `/products/delete-product/:id` | Delete product |
| GET | `/products/shopkeeper-products` | Get shopkeeper's products |
| POST | `/products/import-from-excel` | Bulk import from Excel |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/orders/create-order` | Create new order |
| GET | `/orders/get-orders/shopkeeper/:id` | Get shopkeeper's orders |
| PATCH | `/orders/update-order/:id` | Update order status |
| GET | `/orders/receipt/:id` | Generate receipt PDF |

### Storefront
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shopkeeper-stores/storefront-bundle/:slug` | Bundled storefront data |
| PATCH | `/shopkeeper-stores/update-store-settings` | Update store settings |

---

## Scripts

### Backend
```bash
npm run start        # Production
npm run start:dev    # Development (watch mode)
npm run build        # Build for production
npm run lint         # Lint code
```

### Frontend
```bash
npm run dev          # Development server
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Lint code
```

---

## License

This project is licensed under the **MIT License**.

---

<p align="center">
  Built with care by <a href="https://jicama.tech">Jicama.Tech</a>
</p>
