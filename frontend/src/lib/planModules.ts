import {
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  Globe,
  LifeBuoy,
  Monitor,
  MessageCircle,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Smartphone,
  Tag,
  Truck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for what a subscription plan can switch on or off.
 *
 * Both the Super Admin plan editor and the shopkeeper's "my plan" panel read
 * this list, so a key added here shows up in both without anyone remembering
 * to update a second copy — the two used to be hand-maintained arrays and had
 * already drifted apart.
 *
 * Groups mirror the shopkeeper dashboard's nav tabs, and the first item in a
 * group is the tab itself. That gives the two levels the plan needs: turn off
 * `products` and the whole tab goes, or leave it on and turn off `bulkImport`
 * to sell the tab without the import button.
 *
 * A feature gets exactly one key even when it surfaces in two places — the
 * receipt config in Settings is the same product as receipt printing in
 * Orders, so both are gated by `receipts` and it is listed once, under Orders.
 * Two switches writing one value would just read as a bug.
 */
export interface PlanModuleItem {
  key: string;
  label: string;
  /** Renders a numeric cap next to the switch (0 / blank = unlimited). */
  hasLimit?: boolean;
  /** Shown as a hint under the label in the admin editor. */
  note?: string;
  /**
   * A paid add-on: OFF unless a plan explicitly switches it on.
   *
   * Every other key reads "the plan does not mention it" as enabled, so plans
   * written before a key existed do not lose features the day it ships. An
   * add-on sold for extra money needs the opposite reading — a plan that
   * predates it has not paid for it — and so does a shop with no plan at
   * all. SubscriptionContext applies this through OPT_IN_MODULE_KEYS; the API
   * keeps the same list in backend/src/common/subscription/opt-in-features.ts,
   * and the two must be changed together.
   */
  optIn?: boolean;
}

export interface PlanModuleGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Which plan `forModule` this group applies to. */
  scope: "shopkeeper" | "organizer" | "both";
  items: PlanModuleItem[];
}

export const MODULE_GROUPS: PlanModuleGroup[] = [
  {
    id: "analytics",
    label: "Analytics (Dashboard Tab)",
    icon: BarChart3,
    color: "purple",
    scope: "shopkeeper",
    items: [
      { key: "analytics", label: "Analytics Tab", note: "The tab itself" },
      { key: "analyticsKpiCards", label: "KPI Stat Cards" },
      { key: "analyticsEarnings", label: "Earnings Widget" },
      { key: "analyticsRevenueTrend", label: "Revenue Trend Chart" },
      { key: "analyticsTopProducts", label: "Top Products Chart" },
      { key: "analyticsCategoryPerf", label: "Category Performance Chart" },
      { key: "analyticsPeriodFilter", label: "Period Selector" },
      { key: "analyticsExport", label: "Export Analytics" },
      { key: "pnlReport", label: "Profit & Loss Report" },
    ],
  },
  {
    id: "kiosk",
    label: "Kiosk Mode (Tab)",
    icon: Monitor,
    color: "cyan",
    scope: "shopkeeper",
    items: [
      { key: "kiosk", label: "Kiosk Tab", note: "The tab itself" },
      { key: "kioskProductBrowser", label: "Product Browser & Cart" },
      { key: "kioskParkedCarts", label: "Parked Carts (Hold / Resume)" },
      { key: "kioskCheckout", label: "Checkout Dialog" },
      { key: "kioskCustomerLookup", label: "Customer Lookup by WhatsApp" },
      { key: "kioskAutoPickup", label: "Auto Pickup" },
    ],
  },
  {
    id: "orders",
    label: "Orders & Payments (Tab)",
    icon: ShoppingCart,
    color: "amber",
    scope: "shopkeeper",
    items: [
      { key: "orders", label: "Orders Tab", note: "The tab itself" },
      { key: "ordersStatCards", label: "Summary Stat Cards" },
      { key: "ordersFilters", label: "Filters Panel" },
      { key: "ordersStatusUpdate", label: "Order Status Updates" },
      {
        key: "receipts",
        label: "Receipt Printing (A4 / 58mm)",
        note: "Also gates Settings › Receipts",
      },
      { key: "ordersExport", label: "Export Orders" },
      { key: "paymentTracking", label: "Payments Sub-tab (Gmail Tracking)" },
    ],
  },
  {
    id: "crm",
    label: "CRM / Customers (Tab)",
    icon: Users,
    color: "pink",
    scope: "shopkeeper",
    items: [
      { key: "crm", label: "CRM Tab", note: "The tab itself" },
      { key: "crmCustomerList", label: "Customer List" },
      { key: "crmCustomerDetail", label: "Customer Detail View" },
      { key: "crmOrderHistory", label: "Per-Customer Order History" },
      { key: "crmWhatsappMessage", label: "WhatsApp Direct Message" },
      { key: "crmMarketingCampaign", label: "Marketing Campaign (Bulk WhatsApp)" },
      { key: "crmStallBookings", label: "Stall Bookings / Events Participated" },
      { key: "crmExport", label: "Export Customers" },
    ],
  },
  {
    id: "products",
    label: "Products (Tab)",
    icon: Package,
    color: "blue",
    scope: "shopkeeper",
    items: [
      {
        key: "products",
        label: "Products Tab",
        hasLimit: true,
        note: "The tab itself · limit caps total products",
      },
      { key: "productAddEdit", label: "Add / Edit Product" },
      { key: "productCategories", label: "Categories Manager" },
      { key: "bulkImport", label: "Bulk Import / Export (Excel)" },
      { key: "productExport", label: "Export Products" },
      { key: "productVariants", label: "Variants" },
      { key: "productSubcategories", label: "Subcategories" },
      {
        key: "productOptions",
        label: "Product Options (Size / Quantity / Pack)",
        note: "The per-product options switch on the product form",
      },
      { key: "productInventory", label: "Inventory & Low-Stock Alerts" },
      { key: "productImages", label: "Image Upload", hasLimit: true },
      { key: "productSearchFilters", label: "Search & Filters" },
    ],
  },
  {
    id: "expenses",
    label: "Expenses (Tab)",
    icon: Receipt,
    color: "orange",
    scope: "shopkeeper",
    items: [
      { key: "expenses", label: "Expenses Tab", note: "The tab itself" },
      { key: "expenseAddEdit", label: "Add / Edit Expense" },
      { key: "expenseApprovals", label: "Approval Workflow" },
      { key: "expenseStats", label: "Expense Stat Cards" },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers (Tab)",
    icon: Truck,
    color: "rose",
    scope: "shopkeeper",
    items: [
      { key: "suppliers", label: "Suppliers Tab", note: "The tab itself" },
      { key: "supplierDirectory", label: "Supplier Directory" },
      { key: "supplierRequirements", label: "Business Requirements" },
      { key: "supplierRequests", label: "Supplier Requests / Quotes" },
    ],
  },
  {
    id: "storefront",
    label: "Online Storefront (Tab)",
    icon: Globe,
    color: "emerald",
    scope: "shopkeeper",
    items: [
      { key: "storefront", label: "Storefront Tab", note: "The tab itself" },
      { key: "storefrontGeneral", label: "General (Store Info & Contact)" },
      { key: "storefrontDesign", label: "Design / Theme Builder" },
      { key: "storefrontSeo", label: "SEO Settings" },
      { key: "customDomain", label: "Custom Domain (White-label)" },
      { key: "storefrontSlug", label: "Store Link (Slug)" },
      { key: "instagram", label: "Instagram Integration" },
      { key: "videoSection", label: "Video Section" },
      { key: "ourStory", label: "Our Story Section" },
      { key: "storefrontSocialLinks", label: "Facebook / TikTok / Twitter Links" },
      { key: "storefrontWishlist", label: "Wishlist" },
      { key: "storefrontReviews", label: "Reviews" },
      { key: "storefrontNewsletter", label: "Newsletter Capture" },
      { key: "storefrontQuickView", label: "Quick View" },
      { key: "storefrontSearch", label: "Storefront Search & Filters" },
      { key: "storefrontBanner", label: "Banner" },
      { key: "storefrontFeedbackBar", label: "Feedback Bar" },
      { key: "storefrontHistoryBox", label: "History Box" },
    ],
  },
  {
    id: "settings",
    label: "Settings (Tab)",
    icon: Settings,
    color: "indigo",
    scope: "shopkeeper",
    items: [
      { key: "settingsProfile", label: "Shop Profile" },
      { key: "settingsBusinessInfo", label: "Business Info (GST / UEN)" },
      { key: "settingsAddress", label: "Principal Address" },
      { key: "operators", label: "Multi-User Operators", hasLimit: true },
      { key: "settingsBranding", label: "Store Branding" },
      { key: "settingsProductDefaults", label: "Product Settings" },
      { key: "staticQR", label: "Static QR" },
      { key: "dynamicQR", label: "Dynamic QR" },
      { key: "razorpay", label: "Card Payments (Razorpay)" },
      { key: "settingsShipping", label: "Shipping Settings" },
      { key: "coupons", label: "Coupon Management" },
      // Relabelled from "WhatsApp QR Pairing": this key gates the wa.me contact
      // QR printed on receipts, not linking a phone — that is whatsappConnect
      // below. Labels are not stored in plans, so the rename is display-only.
      { key: "whatsappQR", label: "WhatsApp Contact QR on Receipts" },
      {
        key: "whatsappConnect",
        label: "WhatsApp Connection (shop's own number)",
        note: "Paid add-on — off unless switched on here · Settings › WhatsApp tab",
        optIn: true,
      },
      { key: "settingsNotifications", label: "Notification Settings" },
    ],
  },
  {
    id: "support",
    label: "Support & Assistant (Tab)",
    icon: LifeBuoy,
    color: "green",
    scope: "shopkeeper",
    items: [
      { key: "support", label: "Support Tab", note: "The tab itself" },
      { key: "supportSubmit", label: "Submit Support Request" },
      { key: "supportMyTickets", label: "My Tickets" },
      { key: "chatbot", label: "AI Chatbot (Smart Assistant)" },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    icon: MessageCircle,
    color: "teal",
    scope: "both",
    items: [
      { key: "whatsappOrderNotifications", label: "WhatsApp Order Notifications" },
      // No "WhatsApp OTP" key here on purpose. Every WhatsApp OTP path in the
      // app is login, registration, or verifying your own number — never a
      // customer-facing feature. Selling it would let a plan lock a shopkeeper
      // out of their own account, with no way back in because the Change Plan
      // screen is behind that same login. If customer OTP verification is ever
      // added at checkout, that is the point to reintroduce the key.
      { key: "paymentEmails", label: "Payment Confirmation Emails" },
    ],
  },
  {
    id: "platform",
    label: "Platform & Account",
    icon: Smartphone,
    color: "sky",
    scope: "both",
    items: [
      { key: "multiStore", label: "Multiple Stores", hasLimit: true },
      { key: "languages", label: "Languages (Hindi / Gujarati)" },
      { key: "themes", label: "Light / Dark Theme" },
      { key: "mobileApp", label: "Mobile App Access" },
    ],
  },
  {
    id: "events",
    label: "Events / Organizer",
    icon: CalendarDays,
    color: "violet",
    scope: "organizer",
    items: [
      { key: "events", label: "Event Management", hasLimit: true },
      { key: "eventStalls", label: "Stall Registration & Tables" },
      { key: "eventTickets", label: "Ticketing" },
      { key: "organizerStores", label: "Organizer Stores" },
      { key: "organizerOperators", label: "Organizer Operators", hasLimit: true },
      { key: "organizerCoupons", label: "Organizer Coupons" },
    ],
  },
  {
    id: "organizerAccount",
    label: "Organizer Account",
    icon: Building2,
    color: "slate",
    scope: "organizer",
    items: [
      { key: "organizerProfile", label: "Organizer Profile" },
      { key: "organizerAnalytics", label: "Organizer Analytics" },
    ],
  },
];

export const ALL_MODULE_KEYS = MODULE_GROUPS.flatMap((g) =>
  g.items.map((i) => i.key),
);

/** Keys that stay off unless a plan switches them on — see `optIn`. */
export const OPT_IN_MODULE_KEYS: ReadonlySet<string> = new Set(
  MODULE_GROUPS.flatMap((g) =>
    g.items.filter((i) => i.optIn).map((i) => i.key),
  ),
);

/** Groups relevant to a plan's `forModule`; "both" always applies. */
export function groupsForModule(forModule: string): PlanModuleGroup[] {
  return MODULE_GROUPS.filter(
    (g) => g.scope === "both" || g.scope === forModule,
  );
}
