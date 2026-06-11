import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Loader2,
  Mic,
  MicOff,
  Store,
  Monitor,
  ShoppingCart,
  Users,
  Package,
  Globe,
  Settings,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Download,
  BarChart3,
  HelpCircle,
  BookOpen,
  RotateCcw,
} from "lucide-react";
import { useSubscription } from "@/context/SubscriptionContext";
import QRCode from "react-qr-code";
import jsQR from "jsqr";
import { jwtDecode } from "jwt-decode";

const apiURL = __API_URL__;

interface QuickAction {
  label: string;
  action: string;
}
interface QRPayload {
  orderId: string;
  // Mongo _id, needed to hit /orders/:id/receipt for download.
  orderMongoId?: string;
  amount: number;
  country: string;
  shopName?: string;
  qrValue: string;
}
interface ProductTreeItem {
  name: string;
  price: number;
  status?: string;
  inventory?: number;
  category?: string;
  variants?: { title: string; price: number; inventory?: number }[];
  subcategories?: {
    name: string;
    basePrice?: number;
    variants?: { title: string; price: number; inventory?: number }[];
  }[];
  options?: { title: string; price: number; inventory?: number }[];
}
interface AnalyticsSummary {
  revenue: number;
  orders: number;
  avgOrder: number;
  customers: number;
  currency: string;
  period?: string;
  topProducts?: { name: string; sold?: number; revenue?: number }[];
  // What these numbers describe — drives card label switching.
  subject?: "shop" | "product" | "customer";
  subjectName?: string;
}
interface CustomerFormPayload {
  firstName?: string;
  lastName?: string;
  whatsapp?: string;
  email?: string;
}
interface OrderFormCatalogItem {
  name: string;
  price: number;
  category?: string;
  productOptions?: { title: string; price: number }[];
  variants?: { title: string; price: number }[];
  subcategories?: {
    name: string;
    basePrice?: number;
    variants?: { title: string; price: number }[];
  }[];
}
interface OrderFormPayload {
  country: "IN" | "SG";
  catalog: OrderFormCatalogItem[];
  qrReady: boolean;
  qrSetupHint?: string;
}
interface ReceiptPayload {
  orderId: string;
  orderMongoId: string;
  amount?: number;
  country?: "IN" | "SG";
}
interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  quickActions?: QuickAction[];
  qr?: QRPayload;
  // Cash-order receipt download pill (mirrors the picker inside the QR card).
  receipt?: ReceiptPayload;
  productTree?: ProductTreeItem[];
  analytics?: AnalyticsSummary;
  customerForm?: CustomerFormPayload;
  // Per-message form state: the create call status, so the form renders
  // disabled / a confirmation once the shopkeeper has clicked Create.
  customerFormStatus?: "idle" | "submitting" | "done";
  orderForm?: OrderFormPayload;
  // Per-message order-form lifecycle state. "submitted" hides the form so
  // the bot's reply (with QR / confirmation) takes over visually.
  orderFormStatus?: "idle" | "submitting" | "submitted";
  timestamp: Date;
}

async function extractUpiFromImage(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve("");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, canvas.width, canvas.height);
      if (code?.data?.includes("upi://pay")) {
        const m = code.data.match(/pa=([^&]+)/);
        resolve(m?.[1] || "");
      } else resolve("");
    };
    img.onerror = () => resolve("");
    img.src = imageUrl;
  });
}

async function buildQrValue(action: {
  country: string;
  amount: number;
  orderId: string;
  shopName?: string;
  shopkeeperPhone?: string;
  paymentURL?: string;
}): Promise<string> {
  if (action.country === "SG") {
    const clean = (action.shopkeeperPhone || "").startsWith("+65")
      ? action.shopkeeperPhone!.substring(3)
      : action.shopkeeperPhone || "";
    const now = new Date();
    const expiry = new Date(now.getTime() + 90 * 60 * 60 * 1000);
    const formatted = `${expiry.getFullYear()}/${String(expiry.getMonth() + 1).padStart(2, "0")}/${String(expiry.getDate()).padStart(2, "0")} ${String(expiry.getHours()).padStart(2, "0")}:${String(expiry.getMinutes()).padStart(2, "0")}`;
    return `https://www.sgqrcode.com/paynow?mobile=${clean}&uen=&editable=0&amount=${(Number(action.amount) || 0).toFixed(2)}&expiry=${encodeURIComponent(formatted)}&ref_id=${encodeURIComponent(action.orderId)}&company=`;
  }
  // India — extract UPI from the shopkeeper's payment image
  const upi = action.paymentURL
    ? await extractUpiFromImage(apiURL + action.paymentURL)
    : "";
  if (!upi) return "";
  return `upi://pay?pa=${upi}&pn=${encodeURIComponent(action.shopName || "Payment")}&am=${(Number(action.amount) || 0).toFixed(2)}&cu=INR&tn=${encodeURIComponent("KiosAI Order - " + action.orderId)}`;
}

interface ChatbotWidgetProps {
  /**
   * Switch dashboard tab. Optional `extras` let the bot request a sub-UI
   * inside the target tab — e.g. open the Add Product form on arrival, or
   * open the Edit form for a specific product.
   */
  onNavigate?: (
    tab: string,
    extras?: {
      action?: "add" | "edit";
      productName?: string;
      subTab?: string;
      customerPrefill?: {
        firstName?: string;
        lastName?: string;
        whatsapp?: string;
        email?: string;
      };
    },
  ) => void;
  /** "floating" = bottom-right bubble dialog (default). "page" = fills its parent container. */
  mode?: "floating" | "page";
}

// Collapsible tree view of products, matching the Products tab layout.
function ProductTree({ products }: { products: ProductTreeItem[] }) {
  const [openP, setOpenP] = useState<Set<number>>(new Set());
  const [openSC, setOpenSC] = useState<Set<string>>(new Set()); // key = `${pi}:${si}`
  const fmt = (n: number) => (Number(n) || 0).toFixed(2);
  const toggleP = (i: number) => {
    const s = new Set(openP);
    s.has(i) ? s.delete(i) : s.add(i);
    setOpenP(s);
  };
  const toggleSC = (k: string) => {
    const s = new Set(openSC);
    s.has(k) ? s.delete(k) : s.add(k);
    setOpenSC(s);
  };
  return (
    <div className="mt-2 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <div className="grid grid-cols-[1fr_70px_60px_70px] sm:grid-cols-[1fr_120px_100px_100px] bg-slate-50 border-b border-slate-200 text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
        <div className="px-4 py-2.5">Product</div>
        <div className="px-3 py-2.5">Price</div>
        <div className="px-3 py-2.5">Stock</div>
        <div className="px-3 py-2.5">Status</div>
      </div>
      {products.map((p, i) => {
        const hasChildren =
          (p.variants?.length || 0) +
            (p.subcategories?.length || 0) +
            (p.options?.length || 0) >
          0;
        const isOpen = openP.has(i);
        return (
          <div key={i}>
            <div
              onClick={() => hasChildren && toggleP(i)}
              className={`grid grid-cols-[1fr_70px_60px_70px] sm:grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[14px] ${hasChildren ? "cursor-pointer hover:bg-blue-50" : ""}`}
            >
              <div className="px-4 py-3 flex items-center gap-2 min-w-0">
                {hasChildren ? (
                  isOpen ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
                  )
                ) : (
                  <span className="w-4 flex-shrink-0" />
                )}
                <span className="font-medium text-slate-900 truncate">
                  {p.name}
                </span>
                {p.category && (
                  <span className="text-[11px] text-slate-400 flex-shrink-0">
                    · {p.category}
                  </span>
                )}
              </div>
              <div className="px-3 py-3 text-slate-700">{fmt(p.price)}</div>
              <div className="px-3 py-3 text-slate-700">
                {p.inventory ?? "—"}
              </div>
              <div className="px-3 py-3">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    p.status === "active"
                      ? "bg-emerald-100 text-emerald-700"
                      : p.status === "archived"
                        ? "bg-slate-100 text-slate-600"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {p.status || "—"}
                </span>
              </div>
            </div>

            {isOpen && (
              <div className="bg-slate-50/60">
                {/* Top-level variants */}
                {(p.variants || []).map((v, vi) => (
                  <div
                    key={`v-${vi}`}
                    className="grid grid-cols-[1fr_70px_60px_70px] sm:grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px]"
                  >
                    <div className="px-4 py-2 pl-10 flex items-center gap-2 text-slate-700">
                      <span className="text-slate-400">·</span>
                      <span className="font-medium">{v.title}</span>
                      <span className="text-[11px] text-slate-400">
                        variant
                      </span>
                    </div>
                    <div className="px-3 py-2 text-slate-700">
                      {fmt(v.price)}
                    </div>
                    <div className="px-3 py-2 text-slate-700">
                      {v.inventory ?? "—"}
                    </div>
                    <div className="px-3 py-2" />
                  </div>
                ))}
                {/* Subcategories + their nested variants */}
                {(p.subcategories || []).map((sc, si) => {
                  const k = `${i}:${si}`;
                  const scOpen = openSC.has(k);
                  const hasScVariants = (sc.variants?.length || 0) > 0;
                  return (
                    <div key={`sc-${si}`}>
                      <div
                        onClick={() => hasScVariants && toggleSC(k)}
                        className={`grid grid-cols-[1fr_70px_60px_70px] sm:grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px] ${hasScVariants ? "cursor-pointer hover:bg-blue-50" : ""}`}
                      >
                        <div className="px-4 py-2 pl-8 flex items-center gap-2 text-slate-800">
                          {hasScVariants ? (
                            scOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                            )
                          ) : (
                            <span className="w-3.5 flex-shrink-0" />
                          )}
                          <span className="font-medium">{sc.name}</span>
                          <span className="text-[11px] text-slate-400">
                            subcategory
                          </span>
                        </div>
                        <div className="px-3 py-2 text-slate-700">
                          {sc.basePrice !== undefined ? fmt(sc.basePrice) : "—"}
                        </div>
                        <div className="px-3 py-2" />
                        <div className="px-3 py-2" />
                      </div>
                      {scOpen &&
                        (sc.variants || []).map((v, vi) => (
                          <div
                            key={`scv-${si}-${vi}`}
                            className="grid grid-cols-[1fr_70px_60px_70px] sm:grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px] bg-white"
                          >
                            <div className="px-4 py-2 pl-14 flex items-center gap-2 text-slate-700">
                              <span className="text-slate-400">·</span>
                              <span>{v.title}</span>
                            </div>
                            <div className="px-3 py-2 text-slate-700">
                              {fmt(v.price)}
                            </div>
                            <div className="px-3 py-2 text-slate-700">
                              {v.inventory ?? "—"}
                            </div>
                            <div className="px-3 py-2" />
                          </div>
                        ))}
                    </div>
                  );
                })}
                {/* Product options */}
                {(p.options || []).map((o, oi) => (
                  <div
                    key={`o-${oi}`}
                    className="grid grid-cols-[1fr_70px_60px_70px] sm:grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px]"
                  >
                    <div className="px-4 py-2 pl-10 flex items-center gap-2 text-slate-700">
                      <span className="text-slate-400">·</span>
                      <span className="font-medium">{o.title}</span>
                      <span className="text-[11px] text-slate-400">option</span>
                    </div>
                    <div className="px-3 py-2 text-slate-700">
                      {fmt(o.price)}
                    </div>
                    <div className="px-3 py-2 text-slate-700">
                      {o.inventory ?? "—"}
                    </div>
                    <div className="px-3 py-2" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// KPI cards mirroring the Analytics page (Total Revenue / Orders / Avg / Customers).
// 2 cols on mobile, 4 cols ≥sm so it works inside narrow chat bubbles too.
// `compact` skips topProducts + the period label — used by the always-on header strip.
function AnalyticsCards({
  data,
  compact = false,
}: {
  data: AnalyticsSummary;
  compact?: boolean;
}) {
  const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString() : "0");
  const periodLabel = (p?: string) => {
    if (!p) return "";
    const map: Record<string, string> = {
      monthly: "this month",
      lastmonth: "last month",
      quarterly: "this quarter",
      lastquarter: "last quarter",
      yearly: "this year",
      lastyear: "last year",
      today: "today",
      all: "all time",
    };
    if (map[p]) return map[p];
    // Custom range: backend stamps "<startISO>..<endISO>" — humanise it.
    const m = p.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
    if (m) {
      const fmtD = (s: string) => {
        const d = new Date(s);
        return isNaN(+d)
          ? s
          : d.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
      };
      return `${fmtD(m[1])} → ${fmtD(m[2])}`;
    }
    return p;
  };
  // Subject-aware labels — the same four cards mean different things for shop /
  // product / customer / order. The backend stamps `subject` so the widget can
  // re-purpose the card layout without inventing new components.
  const subject = data.subject || "shop";
  const cards =
    subject === "product"
      ? [
          {
            label: "Product Revenue",
            value: `${data.currency || ""}${fmt(data.revenue)}`,
            tint: "from-blue-50 to-blue-100/60 text-blue-700",
          },
          {
            label: "Orders",
            value: fmt(data.orders),
            tint: "from-emerald-50 to-emerald-100/60 text-emerald-700",
          },
          {
            label: "Units Sold",
            value: fmt(data.avgOrder),
            tint: "from-amber-50 to-amber-100/60 text-amber-700",
          },
          {
            label: "Unique Buyers",
            value: fmt(data.customers),
            tint: "from-rose-50 to-rose-100/60 text-rose-700",
          },
        ]
      : subject === "customer"
        ? [
            {
              label: "Total Spent",
              value: `${data.currency || ""}${fmt(data.revenue)}`,
              tint: "from-blue-50 to-blue-100/60 text-blue-700",
            },
            {
              label: "Orders",
              value: fmt(data.orders),
              tint: "from-emerald-50 to-emerald-100/60 text-emerald-700",
            },
            {
              label: "Avg Order",
              value: `${data.currency || ""}${fmt(data.avgOrder)}`,
              tint: "from-amber-50 to-amber-100/60 text-amber-700",
            },
            {
              label: "Products Bought",
              value: fmt(data.customers),
              tint: "from-rose-50 to-rose-100/60 text-rose-700",
            },
          ]
        : [
            {
              label: "Total Revenue",
              value: `${data.currency || ""}${fmt(data.revenue)}`,
              tint: "from-blue-50 to-blue-100/60 text-blue-700",
            },
            {
              label: "Total Orders",
              value: fmt(data.orders),
              tint: "from-emerald-50 to-emerald-100/60 text-emerald-700",
            },
            {
              label: "Avg Order Value",
              value: `${data.currency || ""}${fmt(data.avgOrder)}`,
              tint: "from-amber-50 to-amber-100/60 text-amber-700",
            },
            {
              label: "Total Customers",
              value: fmt(data.customers),
              tint: "from-rose-50 to-rose-100/60 text-rose-700",
            },
          ];
  const subjectHeader =
    subject === "product"
      ? `Product analytics${data.subjectName ? ` — ${data.subjectName}` : ""}${data.period && data.period !== "all" ? ` · ${periodLabel(data.period)}` : ""}`
      : subject === "customer"
        ? `Customer analytics${data.subjectName ? ` — ${data.subjectName}` : ""}${data.period && data.period !== "all" ? ` · ${periodLabel(data.period)}` : ""}`
        : data.period
          ? `Analytics — ${periodLabel(data.period)}`
          : "";
  const topProductsTitle =
    subject === "customer"
      ? "Favorite products"
      : subject === "product"
        ? "Variant breakdown"
        : "Top products";
  return (
    <div className={compact ? "" : "mt-2"}>
      {!compact && subjectHeader && (
        <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
          {subjectHeader}
        </p>
      )}
      <div
        className={`grid grid-cols-2 ${compact ? "gap-1.5 sm:gap-2" : "gap-2 sm:gap-3"} sm:grid-cols-4`}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border border-slate-200 bg-gradient-to-br ${c.tint} ${compact ? "px-2.5 py-1.5" : "px-3 py-2.5"} shadow-sm`}
          >
            <div
              className={
                compact
                  ? "text-[10px] font-medium text-slate-600 truncate"
                  : "text-[11px] font-medium text-slate-600"
              }
            >
              {c.label}
            </div>
            <div
              className={`mt-0.5 ${compact ? "text-sm sm:text-base" : "text-base sm:text-lg"} font-bold text-slate-900 break-all`}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
      {!compact &&
        Array.isArray(data.topProducts) &&
        data.topProducts.length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1.5">
              {topProductsTitle}
            </p>
            <ul className="space-y-1">
              {data.topProducts.slice(0, 5).map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span className="text-slate-700 truncate mr-2">
                    {i + 1}. {p.name}
                  </span>
                  <span className="text-slate-500 flex-shrink-0">
                    {p.revenue !== undefined
                      ? `${data.currency || ""}${fmt(p.revenue)}`
                      : ""}
                    {p.sold !== undefined ? ` · ${p.sold} sold` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}

// Inline Add Customer form rendered inside a chat bubble. Uses the existing
// `users/create-user-by-shopkeeper/:sid` endpoint that the CRM tab uses, so
// customers created here show up in the CRM list without any extra wiring.
function InlineCustomerForm({
  initial,
  status,
  onSubmit,
}: {
  initial: CustomerFormPayload;
  status: "idle" | "submitting" | "done";
  onSubmit: (form: {
    firstName: string;
    lastName: string;
    whatsAppNumber: string;
    email?: string;
  }) => Promise<void>;
}) {
  // Split a "+9198…" number into a dial code (best effort) and local digits
  // so the shopkeeper sees the same shape they typed.
  const parsed = (() => {
    const raw = (initial.whatsapp || "").trim();
    const m = raw.match(/^(\+\d{1,3})(.*)$/);
    return m
      ? { code: m[1], local: m[2].replace(/\s/g, "") }
      : { code: "+91", local: raw.replace(/^\+/, "") };
  })();

  const [firstName, setFirstName] = useState(initial.firstName || "");
  const [lastName, setLastName] = useState(initial.lastName || "");
  const [code, setCode] = useState(parsed.code);
  const [local, setLocal] = useState(parsed.local);
  const [email, setEmail] = useState(initial.email || "");
  const [error, setError] = useState<string | null>(null);

  const disabled = status !== "idle";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim()) return setError("First name is required.");
    if (!lastName.trim()) return setError("Last name is required.");
    const digits = local.replace(/\D/g, "");
    if (!/^\d{6,15}$/.test(digits))
      return setError("WhatsApp number must be 6–15 digits.");
    if (!/^\+\d{1,3}$/.test(code))
      return setError("Country code must look like +91 or +65.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setError("Email is not valid.");
    }
    await onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      whatsAppNumber: `${code}${digits}`,
      email: email.trim() || undefined,
    });
  };

  if (status === "done") {
    return (
      <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
        Customer created. They will appear in your CRM list.
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2"
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] font-medium text-slate-600">
            First name
          </label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={disabled}
            placeholder="Vansh"
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-slate-600">
            Last name
          </label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={disabled}
            placeholder="Sharma"
            className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-600">
          WhatsApp number
        </label>
        <div className="mt-0.5 flex gap-1.5">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={disabled}
            placeholder="+91"
            className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <input
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            disabled={disabled}
            placeholder="9876543210"
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-600">
          Email (optional)
        </label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled}
          placeholder="vansh@example.com"
          className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
      <div className="flex justify-end pt-1">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 transition disabled:opacity-60"
        >
          {status === "submitting" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : null}
          {status === "submitting" ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}

// Inline kiosk-order form rendered inside a chat bubble. Multi-step state
// machine — customer search → contact (if new) → items (cascading) → payment
// → submit. On submit the form synthesises a natural-language "Place order
// for …" message and sends it through the regular chat pipeline so the LLM
// + place_order tool execute the order (fuzzy product matching, multi-layer
// resolution, inventory decrement, QR generation are all owned by the AI
// path; the UI only collects clean inputs to feed it).
function InlineOrderForm({
  payload,
  status,
  onSubmit,
}: {
  payload: OrderFormPayload;
  status: "idle" | "submitting" | "submitted";
  onSubmit: (synthMessage: string) => void;
}) {
  type CartItem = {
    productName: string;
    optionTitle?: string;
    subcategoryName?: string;
    variantTitle?: string;
    quantity: number;
    unitPrice: number;
  };
  type Step = "customer" | "items" | "payment";

  const { country, catalog, qrReady, qrSetupHint } = payload;
  const defaultDial = country === "SG" ? "+65" : "+91";

  const [step, setStep] = useState<Step>("customer");

  // Customer state
  const [name, setName] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchTried, setSearchTried] = useState(false);
  const [matches, setMatches] = useState<
    { id: string; name: string; whatsapp: string; email: string }[]
  >([]);
  const [chosen, setChosen] = useState<{
    name: string;
    whatsapp: string;
    email: string;
  } | null>(null);
  // Manual contact for new customers
  const [dial, setDial] = useState(defaultDial);
  const [local, setLocal] = useState("");
  const [email, setEmail] = useState("");

  // Items state
  const [productName, setProductName] = useState("");
  const [optionTitle, setOptionTitle] = useState("");
  const [subcategoryName, setSubcategoryName] = useState("");
  const [variantTitle, setVariantTitle] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Payment state — defaults to QR only when the shopkeeper has the QR
  // setup completed; otherwise falls back to Cash so the form can't submit
  // a QR order that the QR pipeline can't render.
  const [payment, setPayment] = useState<"qr" | "cash">(
    qrReady ? "qr" : "cash",
  );
  const [error, setError] = useState<string | null>(null);

  const product = useMemo(
    () => catalog.find((p) => p.name === productName),
    [catalog, productName],
  );
  const hasOptions = (product?.productOptions?.length ?? 0) > 0;
  const hasTopVariants = (product?.variants?.length ?? 0) > 0;
  const hasSubcategories = (product?.subcategories?.length ?? 0) > 0;
  const selectedSub = useMemo(
    () => product?.subcategories?.find((s) => s.name === subcategoryName),
    [product, subcategoryName],
  );
  const subVariants = selectedSub?.variants ?? [];

  const computeUnitPrice = (): number => {
    if (!product) return 0;
    let base = product.price;
    let opt = 0;
    if (subcategoryName && selectedSub) {
      if (variantTitle) {
        const v = selectedSub.variants?.find((x) => x.title === variantTitle);
        if (v) base = v.price;
      } else {
        base = selectedSub.basePrice ?? product.price;
      }
    } else if (variantTitle) {
      const top = product.variants?.find((v) => v.title === variantTitle);
      if (top) base = top.price;
    }
    if (optionTitle) {
      const o = product.productOptions?.find((x) => x.title === optionTitle);
      if (o) {
        // If option is the only leaf, it replaces the base; otherwise adds on top
        // (mirrors backend place_order resolution).
        if (!variantTitle && !subcategoryName) base = o.price;
        else opt = o.price;
      }
    }
    return base + opt;
  };

  const subtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const fmtMoney = (n: number) =>
    `${country === "SG" ? "S$" : "₹"}${(Number(n) || 0).toFixed(2)}`;

  const searchCustomer = async () => {
    if (!name.trim()) {
      setError("Please enter the customer's name.");
      return;
    }
    setError(null);
    setSearching(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(
        `${apiURL}/chatbot/customer-search?q=${encodeURIComponent(name.trim())}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data?.customers) ? data.customers : [];
      setMatches(list);
      setSearchTried(true);
      if (list.length === 1) {
        const c = list[0];
        setChosen({
          name: c.name || name.trim(),
          whatsapp: c.whatsapp,
          email: c.email,
        });
      } else if (list.length === 0) {
        setChosen(null);
      }
    } catch (e: any) {
      setError(`Couldn't search customers: ${e?.message || "unknown error"}`);
    } finally {
      setSearching(false);
    }
  };

  const continueFromCustomer = () => {
    setError(null);
    if (!chosen) {
      // New customer — require WhatsApp
      if (!name.trim()) return setError("Customer name is required.");
      const digits = local.replace(/\D/g, "");
      if (!/^\d{6,15}$/.test(digits))
        return setError("WhatsApp must be 6–15 digits.");
      if (!/^\+\d{1,3}$/.test(dial))
        return setError("Country code must look like +91 or +65.");
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return setError("Email is not valid.");
      }
      setChosen({
        name: name.trim(),
        whatsapp: `${dial}${digits}`,
        email: email.trim(),
      });
    }
    setStep("items");
  };

  const resetItemSelection = () => {
    setOptionTitle("");
    setSubcategoryName("");
    setVariantTitle("");
    setQuantity(1);
  };

  const addItem = () => {
    setError(null);
    if (!product) return setError("Select a product.");
    if (hasOptions && !optionTitle)
      return setError(`Select an option for ${product.name}.`);
    if (hasSubcategories && !subcategoryName)
      return setError(`Select a subcategory for ${product.name}.`);
    if (
      subcategoryName &&
      (selectedSub?.variants?.length ?? 0) > 0 &&
      !variantTitle
    ) {
      return setError(`Select a variant for ${subcategoryName}.`);
    }
    if (hasTopVariants && !subcategoryName && !variantTitle && !optionTitle) {
      return setError(`Select a variant for ${product.name}.`);
    }
    if (quantity < 1) return setError("Quantity must be at least 1.");
    const unitPrice = computeUnitPrice();
    setCart((prev) => [
      ...prev,
      {
        productName: product.name,
        optionTitle: optionTitle || undefined,
        subcategoryName: subcategoryName || undefined,
        variantTitle: variantTitle || undefined,
        quantity,
        unitPrice,
      },
    ]);
    setProductName("");
    resetItemSelection();
  };

  const removeItem = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = () => {
    setError(null);
    if (!chosen) return setError("Customer details are missing.");
    if (cart.length === 0) return setError("Add at least one item.");
    // Synthesise the natural-language message the existing chat pipeline already
    // handles. Comma-separates header (name, phone, email) and items.
    const header = [chosen.name, chosen.whatsapp, chosen.email]
      .filter(Boolean)
      .join(", ");
    const itemPhrases = cart.map((c) => {
      const parts = [c.productName];
      if (c.subcategoryName) parts.push(c.subcategoryName);
      if (c.variantTitle) parts.push(c.variantTitle);
      if (c.optionTitle) parts.push(c.optionTitle);
      const phrase = parts.join(" ");
      return c.quantity > 1 ? `${c.quantity} ${phrase}` : phrase;
    });
    const body = itemPhrases.join(", ");
    const message = `Place order for ${header}: ${body}, ${payment}`;
    onSubmit(message);
  };

  if (status === "submitted") {
    return (
      <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
        Order submitted. See the next message for the QR / confirmation.
      </div>
    );
  }

  const stepBadge = (s: Step, label: string, n: number) => (
    <div
      className={`flex items-center gap-1.5 text-[11px] font-medium ${
        step === s
          ? "text-blue-700"
          : cart.length || chosen
            ? "text-slate-500"
            : "text-slate-400"
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] ${
          step === s ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
        }`}
      >
        {n}
      </span>
      {label}
    </div>
  );

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-3 max-w-md">
      <div className="flex items-center gap-3">
        {stepBadge("customer", "Customer", 1)}
        <span className="flex-1 h-px bg-slate-200" />
        {stepBadge("items", "Items", 2)}
        <span className="flex-1 h-px bg-slate-200" />
        {stepBadge("payment", "Payment", 3)}
      </div>

      {/* STEP 1 — Customer */}
      {step === "customer" && (
        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-medium text-slate-600">
              Customer name
            </label>
            <div className="mt-0.5 flex gap-1.5">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSearchTried(false);
                  setMatches([]);
                  setChosen(null);
                }}
                placeholder="e.g. Vansh Sharma"
                className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={searchCustomer}
                disabled={searching || !name.trim()}
                className="px-3 py-1.5 rounded-md bg-slate-100 text-[13px] hover:bg-slate-200 disabled:opacity-50"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </div>
          </div>

          {chosen && matches.length === 1 && (
            <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-2 text-[12px]">
              <div className="font-semibold text-emerald-900">
                Matched in CRM
              </div>
              <div className="mt-0.5 text-emerald-800">
                <div>
                  <span className="font-medium">Name:</span> {chosen.name}
                </div>
                {chosen.whatsapp && (
                  <div>
                    <span className="font-medium">WhatsApp:</span>{" "}
                    {chosen.whatsapp}
                  </div>
                )}
                {chosen.email && (
                  <div>
                    <span className="font-medium">Email:</span> {chosen.email}
                  </div>
                )}
              </div>
            </div>
          )}

          {matches.length > 1 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 space-y-1">
              <div className="text-[12px] font-medium text-amber-900">
                Multiple matches — pick one:
              </div>
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    setChosen({
                      name: m.name,
                      whatsapp: m.whatsapp,
                      email: m.email,
                    })
                  }
                  className={`block w-full text-left text-[12px] px-2 py-1 rounded ${
                    chosen?.whatsapp === m.whatsapp
                      ? "bg-amber-200"
                      : "bg-white hover:bg-amber-100"
                  }`}
                >
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-slate-600">
                    — {m.whatsapp || "no phone"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {searchTried && matches.length === 0 && (
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="text-[12px] text-slate-600">
                Not in CRM yet — enter contact details for a new customer.
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600">
                  WhatsApp number
                </label>
                <div className="mt-0.5 flex gap-1.5">
                  <input
                    value={dial}
                    onChange={(e) => setDial(e.target.value)}
                    placeholder="+91"
                    className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-[13px]"
                  />
                  <input
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    placeholder="9876543210"
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-[13px]"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600">
                  Email (optional)
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px]"
                />
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={continueFromCustomer}
              disabled={!searchTried && !chosen}
              className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 2 — Items */}
      {step === "items" && (
        <div className="space-y-2">
          {chosen && (
            <div className="text-[11px] text-slate-500">
              Customer:{" "}
              <span className="font-medium text-slate-700">{chosen.name}</span>
              {chosen.whatsapp ? ` · ${chosen.whatsapp}` : ""}
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-600">
              Product
            </label>
            <select
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                resetItemSelection();
              }}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] bg-white"
            >
              <option value="">Select a product…</option>
              {catalog.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} — {fmtMoney(p.price)}
                </option>
              ))}
            </select>
          </div>

          {hasSubcategories && (
            <div>
              <label className="text-[11px] font-medium text-slate-600">
                Subcategory
              </label>
              <select
                value={subcategoryName}
                onChange={(e) => {
                  setSubcategoryName(e.target.value);
                  setVariantTitle("");
                }}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] bg-white"
              >
                <option value="">Select…</option>
                {product!.subcategories!.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                    {s.basePrice ? ` — base ${fmtMoney(s.basePrice)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(subcategoryName ? subVariants.length > 0 : hasTopVariants) && (
            <div>
              <label className="text-[11px] font-medium text-slate-600">
                Variant
              </label>
              <select
                value={variantTitle}
                onChange={(e) => setVariantTitle(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] bg-white"
              >
                <option value="">Select…</option>
                {(subcategoryName ? subVariants : product!.variants!).map(
                  (v) => (
                    <option key={v.title} value={v.title}>
                      {v.title} — {fmtMoney(v.price)}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}

          {hasOptions && (
            <div>
              <label className="text-[11px] font-medium text-slate-600">
                Option
              </label>
              <select
                value={optionTitle}
                onChange={(e) => setOptionTitle(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-[13px] bg-white"
              >
                <option value="">Select…</option>
                {product!.productOptions!.map((o) => (
                  <option key={o.title} value={o.title}>
                    {o.title} — {fmtMoney(o.price)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {product && (
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium text-slate-600">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Number(e.target.value) || 1))
                }
                className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-[13px]"
              />
              <button
                type="button"
                onClick={addItem}
                className="ml-auto px-3 py-1.5 rounded-full bg-slate-100 text-[13px] hover:bg-slate-200"
              >
                Add to order
              </button>
            </div>
          )}

          {cart.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1">
              <div className="text-[11px] font-semibold text-slate-600 uppercase">
                Cart
              </div>
              {cart.map((c, i) => {
                const detail = [c.subcategoryName, c.variantTitle]
                  .filter(Boolean)
                  .join(" > ");
                const opt = c.optionTitle ? ` [opt ${c.optionTitle}]` : "";
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="truncate mr-2">
                      {c.quantity}×{" "}
                      <span className="font-medium">{c.productName}</span>
                      {detail ? ` (${detail})` : ""}
                      {opt}
                    </span>
                    <span className="text-slate-600 mr-2">
                      {fmtMoney(c.unitPrice * c.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="text-[11px] text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
              <div className="flex justify-between pt-1 border-t border-slate-200 text-[12px] font-medium">
                <span>Subtotal</span>
                <span>{fmtMoney(subtotal)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex justify-between pt-1">
            <button
              type="button"
              onClick={() => setStep("customer")}
              className="px-3 py-1.5 rounded-full text-[13px] text-slate-600 hover:text-slate-900"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0)
                  return setError("Add at least one item.");
                setError(null);
                setStep("payment");
              }}
              className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Payment */}
      {step === "payment" && (
        <div className="space-y-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[12px] space-y-0.5">
            <div className="font-semibold text-slate-600 uppercase text-[11px]">
              Summary
            </div>
            <div>
              Customer: <span className="font-medium">{chosen?.name}</span>
            </div>
            <div>Items: {cart.length}</div>
            <div>
              Subtotal:{" "}
              <span className="font-medium">{fmtMoney(subtotal)}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Discount/tax (if any) applied by the system on submit.
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-slate-600">
              Payment method
            </label>
            <div className="mt-0.5 flex gap-2">
              <label
                className={`flex-1 rounded-md border px-3 py-2 text-[13px] ${
                  !qrReady
                    ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                    : payment === "qr"
                      ? "border-blue-500 bg-blue-50 text-blue-700 cursor-pointer"
                      : "border-slate-300 bg-white cursor-pointer"
                }`}
                title={!qrReady ? qrSetupHint : undefined}
              >
                <input
                  type="radio"
                  name="payment"
                  value="qr"
                  checked={payment === "qr"}
                  onChange={() => setPayment("qr")}
                  disabled={!qrReady}
                  className="mr-1.5"
                />
                {country === "SG" ? "PayNow QR" : "UPI QR"}
              </label>
              <label
                className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-[13px] ${
                  payment === "cash"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  value="cash"
                  checked={payment === "cash"}
                  onChange={() => setPayment("cash")}
                  className="mr-1.5"
                />
                Cash
              </label>
            </div>
            {!qrReady && qrSetupHint && (
              <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                {qrSetupHint}
              </p>
            )}
          </div>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
          <div className="flex justify-between pt-1">
            <button
              type="button"
              onClick={() => setStep("items")}
              className="px-3 py-1.5 rounded-full text-[13px] text-slate-600 hover:text-slate-900"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={status === "submitting"}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {status === "submitting" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {status === "submitting"
                ? "Placing…"
                : payment === "qr"
                  ? "Place order & show QR"
                  : "Place order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Tabs the chat can jump to (matches the sidebar order, minus the chat tab itself).
const NAV_TABS: { id: string; label: string; Icon: any }[] = [
  { id: "dashboard", label: "Analytics", Icon: Store },
  { id: "kiosk", label: "Kiosk", Icon: Monitor },
  { id: "orders", label: "Orders", Icon: ShoppingCart },
  { id: "crm", label: "CRM", Icon: Users },
  { id: "products", label: "Products", Icon: Package },
  { id: "storefront", label: "Storefront", Icon: Globe },
  { id: "settings", label: "Settings", Icon: Settings },
];

// Quick-start cards shown in page mode. Designed like ChatGPT / Claude / Gemini
// suggestion cards: icon badge, short title, example phrasing underneath.
const SUGGESTED_CARDS: {
  Icon: any;
  tint: string;
  title: string;
  sub: string;
  prompt: string;
}[] = [
  // Dashboard
  {
    Icon: Store,
    tint: "text-blue-600 bg-blue-50",
    title: "Today's revenue",
    sub: "Quick snapshot of today's sales",
    prompt: "Show today's revenue",
  },
  {
    Icon: Store,
    tint: "text-blue-600 bg-blue-50",
    title: "This month analytics",
    sub: "Revenue, orders & top products",
    prompt: "This month analytics",
  },
  {
    Icon: BarChart3,
    tint: "text-blue-600 bg-blue-50",
    title: "Product analytics",
    sub: "Sales of any product over time",
    prompt: "Show analytics for <product>",
  },
  {
    Icon: BarChart3,
    tint: "text-blue-600 bg-blue-50",
    title: "Customer analytics",
    sub: "Spend & favorites of any customer",
    prompt: "Show analytics for customer <name>",
  },
  {
    Icon: BarChart3,
    tint: "text-blue-600 bg-blue-50",
    title: "Order breakdown",
    sub: "Line-item analytics for an order",
    prompt: "Breakdown of order <orderId>",
  },
  // Kiosk
  {
    Icon: Monitor,
    tint: "text-emerald-600 bg-emerald-50",
    title: "Place a kiosk order",
    sub: "Opens the inline order form",
    prompt: "Place an order",
  },
  {
    Icon: Monitor,
    tint: "text-emerald-600 bg-emerald-50",
    title: "Get a receipt",
    sub: "Generate the PDF for any order",
    prompt: "Receipt for order <orderId>",
  },
  // Orders
  {
    Icon: ShoppingCart,
    tint: "text-amber-600 bg-amber-50",
    title: "Pending orders",
    sub: "See what still needs your action",
    prompt: "Show pending orders",
  },
  {
    Icon: ShoppingCart,
    tint: "text-amber-600 bg-amber-50",
    title: "Confirm all payments",
    sub: "Mark every matched payment as paid",
    prompt: "Confirm all matched payments",
  },
  {
    Icon: ShoppingCart,
    tint: "text-amber-600 bg-amber-50",
    title: "Confirm today's orders",
    sub: "Move today's pending → processing",
    prompt: "Confirm all today's orders",
  },
  // CRM
  {
    Icon: Users,
    tint: "text-rose-600 bg-rose-50",
    title: "All customers",
    sub: "Full customer list with stats",
    prompt: "Show all my customers",
  },
  {
    Icon: Users,
    tint: "text-rose-600 bg-rose-50",
    title: "Add a customer",
    sub: "Opens the Add Customer form pre-filled",
    prompt: "Add customer <name>, <phone>, <email>",
  },
  // Products
  {
    Icon: Package,
    tint: "text-cyan-600 bg-cyan-50",
    title: "All products",
    sub: "Browse your catalog",
    prompt: "Show all products",
  },
  {
    Icon: Package,
    tint: "text-cyan-600 bg-cyan-50",
    title: "Low stock alerts",
    sub: "Items below threshold",
    prompt: "Low stock products",
  },
  {
    Icon: Package,
    tint: "text-cyan-600 bg-cyan-50",
    title: "Add a new product",
    sub: "Opens the Add Product form",
    prompt: "Add a new Product",
  },
  // Settings
  {
    Icon: Settings,
    tint: "text-slate-600 bg-slate-100",
    title: "Shop info",
    sub: "Your store profile",
    prompt: "Show shop info",
  },
  // Learn KiosCart — explainer questions answered from the platform knowledge base.
  {
    Icon: BookOpen,
    tint: "text-violet-600 bg-violet-50",
    title: "How do I enable delivery?",
    sub: "Set up the delivery toggle and fees",
    prompt: "How do I enable delivery?",
  },
  {
    Icon: BookOpen,
    tint: "text-violet-600 bg-violet-50",
    title: "How do payments work?",
    sub: "UPI, PayNow, Gmail matching",
    prompt: "How do payments work in KiosCart?",
  },
  {
    Icon: BookOpen,
    tint: "text-violet-600 bg-violet-50",
    title: "How do I add an operator?",
    sub: "Team members with role-based access",
    prompt: "How do I add an operator?",
  },
  {
    Icon: BookOpen,
    tint: "text-violet-600 bg-violet-50",
    title: "What does Kiosk mode do?",
    sub: "Walk-in / in-store ordering",
    prompt: "What does Kiosk mode do?",
  },
  {
    Icon: BookOpen,
    tint: "text-violet-600 bg-violet-50",
    title: "How do I create a coupon?",
    sub: "Percentage or flat discounts",
    prompt: "How do I create a coupon?",
  },
  {
    Icon: HelpCircle,
    tint: "text-violet-600 bg-violet-50",
    title: "What hardware do I need?",
    sub: "Tablets, terminals, printers",
    prompt: "What hardware do I need to run KiosCart?",
  },
  // {
  //   Icon: HelpCircle,
  //   tint: "text-violet-600 bg-violet-50",
  //   title: "Can I bulk import products?",
  //   sub: "Excel / CSV upload",
  //   prompt: "Can I bulk import products?",
  // },
  {
    Icon: HelpCircle,
    tint: "text-violet-600 bg-violet-50",
    title: "What plans are available?",
    sub: "Starter vs Enterprise",
    prompt: "What plans does KiosCart offer?",
  },
];

// Lightweight markdown-to-HTML for chat replies. Supports:
// - **bold** -> <strong>
// - GFM-style tables (lines of `| col | col |`) -> styled <table>
// - bullet items starting with `- ` or `* ` -> <ul>/<li>
// - numbered items `1. ` -> <ol>/<li>
// - blank lines and \n preserved as paragraph / line breaks
function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  );
}
function inlineMd(s: string) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function renderTable(rows: string[]): string {
  // Drop the markdown separator row (---|---|...)
  const cells = rows
    .map((r) =>
      r
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim()),
    )
    .filter((cols, i) => !(i === 1 && cols.every((c) => /^:?-+:?$/.test(c))));
  if (cells.length === 0) return "";
  const [header, ...body] = cells;
  const th = header
    .map(
      (c) =>
        `<th class="px-3 py-2.5 text-left text-[13px] font-semibold text-gray-700 border-b border-gray-200 bg-gray-50">${inlineMd(c)}</th>`,
    )
    .join("");
  const tr = body
    .map(
      (row) =>
        `<tr class="hover:bg-gray-50">${row.map((c) => `<td class="px-3 py-2.5 text-[14px] text-gray-800 border-b border-gray-100">${inlineMd(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<div class="my-2 overflow-x-auto rounded-lg border border-gray-200"><table class="w-full border-collapse"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}
function formatMessage(text: string): string {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Table block
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        block.push(lines[i].trim());
        i++;
      }
      out.push(renderTable(block));
      continue;
    }
    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(
          `<li class="ml-4">${inlineMd(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`,
        );
        i++;
      }
      out.push(`<ul class="list-disc my-1">${items.join("")}</ul>`);
      continue;
    }
    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(
          `<li class="ml-4">${inlineMd(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`,
        );
        i++;
      }
      out.push(`<ol class="list-decimal my-1">${items.join("")}</ol>`);
      continue;
    }
    // Regular line
    out.push(line.length ? inlineMd(line) : "<br/>");
    i++;
  }
  return out.join("<br/>");
}

export function ChatbotWidget({
  onNavigate,
  mode = "floating",
}: ChatbotWidgetProps) {
  const { isModuleEnabled } = useSubscription();
  // In page mode the chat is always "open".
  const [open, setOpen] = useState(mode === "page");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Per-message QR receipt state: messageId → "idle" | "choosing" | "downloading"
  const [receiptUI, setReceiptUI] = useState<
    Record<string, "idle" | "choosing" | "downloading">
  >({});
  // Always-on analytics strip in the header. Mirrors the Analytics page's KPI cards
  // so the shopkeeper sees their snapshot the moment the chatbot opens.
  const [headerAnalytics, setHeaderAnalytics] =
    useState<AnalyticsSummary | null>(null);
  const [analyticsCollapsed, setAnalyticsCollapsed] = useState(false);
  const [headerPeriod, setHeaderPeriod] = useState<string>("monthly");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // Today's actionable counts shown as flashing pills under the greeting.
  const [todayOrdersCount, setTodayOrdersCount] = useState(0);
  const [todayPaymentsCount, setTodayPaymentsCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Forward-declare a ref for sendMessage so InlineOrderForm's onSubmit can
  // call it before its definition. Filled in below once sendMessage exists.
  const sendMessageRef = useRef<(text: string, isGreeting?: boolean) => void>(
    () => {},
  );

  const submitOrderForm = useCallback((msgId: string, synth: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, orderFormStatus: "submitted" as const } : m,
      ),
    );
    sendMessageRef.current(synth);
  }, []);

  const submitCustomerForm = useCallback(
    async (
      msgId: string,
      form: {
        firstName: string;
        lastName: string;
        whatsAppNumber: string;
        email?: string;
      },
    ) => {
      const token = sessionStorage.getItem("token");
      if (!token) return;
      let shopkeeperId: string;
      try {
        const decoded: any = jwtDecode(token);
        shopkeeperId = decoded?.sub;
      } catch {
        return;
      }
      if (!shopkeeperId) return;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, customerFormStatus: "submitting" } : m,
        ),
      );

      try {
        const payload = {
          name: `${form.firstName} ${form.lastName}`.trim(),
          firstName: form.firstName,
          lastName: form.lastName,
          whatsAppNumber: form.whatsAppNumber,
          ...(form.email ? { email: form.email } : {}),
        };
        const res = await fetch(
          `${apiURL}/users/create-user-by-shopkeeper/${shopkeeperId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || `HTTP ${res.status}`);
        }
        setMessages((prev) => [
          ...prev.map((m) =>
            m.id === msgId ? { ...m, customerFormStatus: "done" as const } : m,
          ),
          {
            id: (Date.now() + 1).toString(),
            role: "bot",
            text: `Customer **${form.firstName} ${form.lastName}** created with WhatsApp **${form.whatsAppNumber}**.`,
            timestamp: new Date(),
          },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev.map((m) =>
            m.id === msgId ? { ...m, customerFormStatus: "idle" as const } : m,
          ),
          {
            id: (Date.now() + 1).toString(),
            role: "bot",
            text: `Could not create customer: ${err?.message || "unknown error"}.`,
            timestamp: new Date(),
          },
        ]);
      }
    },
    [],
  );

  const downloadReceipt = useCallback(
    async (msgId: string, mongoId: string, type: "A4" | "58MM") => {
      setReceiptUI((p) => ({ ...p, [msgId]: "downloading" }));
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch(
          `${apiURL}/orders/${mongoId}/receipt?type=${type}&disposition=attachment`,
          {
            method: "GET",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        if (!res.ok) throw new Error("Receipt fetch failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `receipt-${mongoId.slice(-8)}-${type}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        // Surface as a chat bubble so it doesn't fail silently.
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "bot",
            text: "Couldn't download the receipt. Please try again.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setReceiptUI((p) => ({ ...p, [msgId]: "idle" }));
      }
    },
    [],
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-collapse the analytics strip once the shopkeeper starts chatting,
  // so the conversation has full focus. They can still re-open it via "Show".
  useEffect(() => {
    if (messages.some((m) => m.role === "user")) setAnalyticsCollapsed(true);
  }, [messages]);

  // Fetch the analytics snapshot for the header strip — same endpoint the
  // Dashboard page hits, so the shopkeeper sees identical numbers in both places.
  // Re-fires whenever the chat opens or the chosen period changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const token = sessionStorage.getItem("token");
      if (!token) return;
      try {
        const decoded: any = jwtDecode(token);
        const shopkeeperId = decoded?.sub;
        if (!shopkeeperId) return;
        setAnalyticsLoading(true);
        const res = await fetch(
          `${apiURL}/shopkeeper/analytics/${shopkeeperId}/report/${headerPeriod}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return;
        const json = await res.json();
        const d = json?.data;
        if (!d || cancelled) return;
        setHeaderAnalytics({
          revenue: Number(d.totalRevenue) || 0,
          orders: Number(d.totalOrders) || 0,
          avgOrder: Number(d.avgOrderValue) || 0,
          customers: Number(d.totalCustomers) || 0,
          currency: d.currencySymbol || "Rs.",
          period: headerPeriod,
          // Report endpoint uses { productName, totalQuantity, totalRevenue };
          // map to the { name, sold, revenue } shape the cards render.
          topProducts: Array.isArray(d.topProducts)
            ? d.topProducts.slice(0, 5).map((p: any) => ({
                name: p.productName ?? p.name,
                sold: p.totalQuantity ?? p.sold,
                revenue: p.totalRevenue ?? p.revenue,
              }))
            : undefined,
        });
      } catch {
        // Silent — the chat still works without the strip.
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, headerPeriod]);

  // Today's order + payment counts for the welcome-state pills.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const token = sessionStorage.getItem("token");
      if (!token) return;
      let shopkeeperId: string | undefined;
      try {
        shopkeeperId = (jwtDecode(token) as any)?.sub;
      } catch {
        return;
      }
      if (!shopkeeperId) return;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startMs = startOfDay.getTime();

      const ordersReq = fetch(
        `${apiURL}/orders/get-orders/shopkeeper/${shopkeeperId}?page=1&limit=200`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const list = Array.isArray(j) ? j : j?.orders || [];
          return list.filter(
            (o: any) =>
              o?.createdAt && new Date(o.createdAt).getTime() >= startMs,
          ).length;
        })
        .catch(() => 0);

      const paymentsReq = fetch(`${apiURL}/payment-emails/emails`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const list = j?.emails || [];
          return list.filter((e: any) => {
            const ts = e?.receivedAt || e?.createdAt;
            return ts && new Date(ts).getTime() >= startMs;
          }).length;
        })
        .catch(() => 0);

      const [ordersCount, paymentsCount] = await Promise.all([
        ordersReq,
        paymentsReq,
      ]);
      if (cancelled) return;
      setTodayOrdersCount(ordersCount || 0);
      setTodayPaymentsCount(paymentsCount || 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const sendMessage = useCallback(async (text: string, isGreeting = false) => {
    if (!isGreeting) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "user",
          text,
          timestamp: new Date(),
        },
      ]);
    }
    setInput("");
    setLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(`${apiURL}/chatbot/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        let qr: QRPayload | undefined;
        let receipt: ReceiptPayload | undefined;
        let qrSetupError: string | null = null;
        if (
          data.botAction?.type === "showReceipt" &&
          data.botAction.orderMongoId
        ) {
          receipt = {
            orderId: data.botAction.orderId,
            orderMongoId: data.botAction.orderMongoId,
            amount: data.botAction.amount,
            country: data.botAction.country,
          };
        }
        if (data.botAction?.type === "showQR") {
          const qrValue = await buildQrValue(data.botAction);
          if (qrValue) {
            qr = {
              orderId: data.botAction.orderId,
              orderMongoId: data.botAction.orderMongoId,
              amount: data.botAction.amount,
              country: data.botAction.country,
              shopName: data.botAction.shopName,
              qrValue,
            };
          } else {
            // Order placed but QR can't be rendered — likely missing UPI image
            // (India) or PayNow phone (Singapore). Surface a clear hint instead
            // of silently dropping the QR card.
            qrSetupError =
              data.botAction.country === "SG"
                ? "Order placed, but no PayNow QR could be generated. Save your PayNow WhatsApp number in Settings → Profile, then try again."
                : "Order placed, but no UPI QR could be generated. Upload your UPI QR image in Settings → Payment Tracking, then try again.";
          }
        }
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "bot",
            text: data.text,
            quickActions: data.quickActions,
            qr,
            receipt,
            productTree: Array.isArray(data.productTree)
              ? data.productTree
              : undefined,
            analytics:
              data.analytics && typeof data.analytics === "object"
                ? data.analytics
                : undefined,
            customerForm:
              data.customerForm && typeof data.customerForm === "object"
                ? data.customerForm
                : undefined,
            customerFormStatus: data.customerForm ? "idle" : undefined,
            orderForm:
              data.orderForm && typeof data.orderForm === "object"
                ? data.orderForm
                : undefined,
            orderFormStatus: data.orderForm ? "idle" : undefined,
            timestamp: new Date(),
          },
          ...(qrSetupError
            ? [
                {
                  id: (Date.now() + 2).toString(),
                  role: "bot" as const,
                  text: qrSetupError,
                  timestamp: new Date(),
                },
              ]
            : []),
        ]);
        if (
          data.botAction?.type === "navigate" &&
          data.botAction.tab &&
          onNavigate
        ) {
          const extras: {
            action?: "add" | "edit";
            productName?: string;
            customerPrefill?: {
              firstName?: string;
              lastName?: string;
              whatsapp?: string;
              email?: string;
            };
          } = {};
          if (data.botAction.action) extras.action = data.botAction.action;
          if (data.botAction.productName)
            extras.productName = data.botAction.productName;
          if (data.botAction.customerPrefill)
            extras.customerPrefill = data.botAction.customerPrefill;
          setTimeout(() => {
            onNavigate(data.botAction.tab, extras);
            setOpen(false);
          }, 1500);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "bot",
            text: "Something went wrong. Please try again.",
            timestamp: new Date(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "bot",
          text: "Connection error.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep the order-form's send-back ref pointed at the latest sendMessage.
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true);
      sendMessage("hi", true);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, initialized, sendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  };

  const handleQuickAction = (action: string) => {
    if (loading) return;
    sendMessage(action);
  };

  const handleReset = () => {
    if (loading) return;
    setMessages([]);
    setInput("");
    setReceiptUI({});
    setShowSuggestions(false);
    setAnalyticsCollapsed(false);
    setInitialized(false);
  };

  const toggleVoice = () => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (isListening) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      setIsListening(false);
      if (text) {
        setInput(text);
        // Don't auto-send — let the shopkeeper review/edit first, then click Send.
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
    setIsListening(true);
  };

  const hasVoice =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );

  if (!isModuleEnabled("chatbot")) return null;

  // Page-mode: fill the parent fully (no card chrome). Floating-mode: original bubble.
  // On phones the floating bubble fills the viewport (with margins) instead of clipping.
  const isPage = mode === "page";
  const containerClass = isPage
    ? "w-full h-[calc(100vh-6rem)] bg-gradient-to-b from-slate-50 to-white flex flex-col overflow-hidden"
    : "fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-1.5rem)] h-[calc(100vh-6rem)] sm:w-[380px] sm:h-[520px] max-w-[400px] max-h-[640px] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden";
  const messageMaxWidth = isPage ? "max-w-[88%] sm:max-w-[78%]" : "max-w-[88%]";

  return (
    <>
      {!isPage && !open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105"
        >
          <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {(isPage || open) && (
        <div className={containerClass}>
          {isPage ? (
            <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur">
              <div className="flex items-center gap-3 px-3 sm:pl-6 sm:pr-8 py-3 sm:py-4">
                <div className="relative w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-md">
                  <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm sm:text-base tracking-tight">
                    KiosAI
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                    Your smart store assistant · Online
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">KiosAI</p>
                  <p className="text-[10px] opacity-80">
                    Your smart store assistant
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Always-on analytics strip — same KPIs as the Analytics page.
              Auto-collapses once the shopkeeper sends their first message;
              the strip itself stays visible so they can re-open it. */}
          {(headerAnalytics || analyticsLoading) && (
            <div
              className={`flex-shrink-0 border-b border-slate-200 bg-slate-50/60 ${isPage ? "px-3 sm:pl-6 sm:pr-8" : "px-3"} py-2`}
            >
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                  <select
                    value={headerPeriod}
                    onChange={(e) => setHeaderPeriod(e.target.value)}
                    aria-label="Analytics period"
                    className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer hover:text-blue-700 pr-1"
                  >
                    <option value="today">Today</option>
                    <option value="monthly">This Month</option>
                    <option value="lastmonth">Last Month</option>
                    <option value="quarterly">This Quarter</option>
                    <option value="lastquarter">Last Quarter</option>
                    <option value="yearly">This Year</option>
                    <option value="lastyear">Last Year</option>
                  </select>
                  {analyticsLoading && (
                    <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-shrink-0" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAnalyticsCollapsed((c) => !c)}
                  className="text-[11px] text-slate-500 hover:text-slate-700 flex-shrink-0"
                >
                  {analyticsCollapsed ? "Show" : "Hide"}
                </button>
              </div>
              {!analyticsCollapsed && headerAnalytics && (
                <div className="w-full">
                  <AnalyticsCards data={headerAnalytics} compact />
                </div>
              )}
            </div>
          )}

          <div
            className={`flex-1 overflow-y-auto ${isPage ? "px-3 py-4 sm:pl-6 sm:pr-8 sm:py-6" : "p-3"}`}
          >
            {/* Welcome / empty state — shown only until the shopkeeper sends their first message. */}
            {isPage && !messages.some((m) => m.role === "user") && (
              <div className="max-w-[900px] mx-auto pt-4 sm:pt-6 pb-6 sm:pb-10">
                <div className="flex flex-col items-center text-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                  <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg">
                    <Bot className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">
                      {messages[0]?.role === "bot"
                        ? messages[0].text
                            .split("\n")[0]
                            .replace(/\*\*/g, "")
                            .replace(/[!.].*/, "")
                        : "How can I help?"}
                    </p>
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      Tap a suggestion or type your own message
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate?.("orders", { subTab: "orders" })
                    }
                    className="group inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border border-blue-300 bg-blue-50 text-[13px] font-medium text-blue-700 hover:bg-blue-100 transition shadow-sm animate-pulse"
                    title="View today's orders"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white">
                      <ShoppingCart className="h-3 w-3" strokeWidth={2.25} />
                    </span>
                    {todayOrdersCount} new order
                    {todayOrdersCount === 1 ? "" : "s"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate?.("orders", { subTab: "payments" })
                    }
                    className="group inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-[13px] font-medium text-emerald-700 hover:bg-emerald-100 transition shadow-sm animate-pulse"
                    title="View today's payments"
                  >
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white">
                      <BarChart3 className="h-3 w-3" strokeWidth={2.25} />
                    </span>
                    {todayPaymentsCount} new payment
                    {todayPaymentsCount === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            )}
            <div
              className={`${isPage ? "space-y-5 w-full" : "space-y-3"} ${isPage && !messages.some((m) => m.role === "user") ? "hidden" : ""}`}
            >
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={messageMaxWidth}>
                    <div
                      className={`flex items-end ${isPage ? "gap-2" : "gap-1.5"} ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`${isPage ? "w-8 h-8" : "w-6 h-6"} rounded-full flex items-center justify-center flex-shrink-0 ${
                          msg.role === "user" ? "bg-blue-100" : "bg-gray-100"
                        }`}
                      >
                        {msg.role === "user" ? (
                          <User
                            className={`${isPage ? "h-4 w-4" : "h-3 w-3"} text-blue-600`}
                          />
                        ) : (
                          <Bot
                            className={`${isPage ? "h-4 w-4" : "h-3 w-3"} text-gray-600`}
                          />
                        )}
                      </div>
                      <div
                        className={`rounded-2xl ${isPage ? "px-4 py-3 text-[15px] leading-relaxed" : "px-3 py-2 text-sm"} ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white rounded-br-sm"
                            : "bg-white text-slate-800 border border-slate-200 shadow-sm rounded-bl-sm"
                        }`}
                      >
                        <div
                          dangerouslySetInnerHTML={{
                            __html: formatMessage(msg.text),
                          }}
                        />
                      </div>
                    </div>
                    {msg.productTree && msg.productTree.length > 0 && (
                      <div className="mt-2 ml-10">
                        <ProductTree products={msg.productTree} />
                      </div>
                    )}
                    {msg.analytics && (
                      <div className={isPage ? "mt-2 ml-10" : "mt-2 ml-8"}>
                        <AnalyticsCards data={msg.analytics} />
                      </div>
                    )}
                    {msg.customerForm && (
                      <div
                        className={isPage ? "ml-10 max-w-md" : "ml-8 max-w-sm"}
                      >
                        <InlineCustomerForm
                          initial={msg.customerForm}
                          status={msg.customerFormStatus || "idle"}
                          onSubmit={(form) => submitCustomerForm(msg.id, form)}
                        />
                      </div>
                    )}
                    {msg.orderForm && (
                      <div className={isPage ? "ml-10" : "ml-8"}>
                        <InlineOrderForm
                          payload={msg.orderForm}
                          status={msg.orderFormStatus || "idle"}
                          onSubmit={(synth) => submitOrderForm(msg.id, synth)}
                        />
                      </div>
                    )}
                    {msg.receipt &&
                      (() => {
                        const state = receiptUI[msg.id] || "idle";
                        const mongoId = msg.receipt.orderMongoId;
                        return (
                          <div className="mt-2 ml-8 inline-block bg-white border border-emerald-200 rounded-xl px-3 py-2 shadow-sm">
                            <div className="text-[12px] font-semibold text-emerald-900 mb-0.5">
                              Order #{msg.receipt.orderId} placed
                            </div>
                            <div className="text-[11px] text-slate-500 mb-1.5">
                              Cash received
                              {msg.receipt.amount
                                ? ` · Total ${msg.receipt.country === "SG" ? "S$" : "₹"}${(Number(msg.receipt.amount) || 0).toFixed(2)}`
                                : ""}
                            </div>
                            {state === "downloading" ? (
                              <div className="inline-flex items-center gap-1.5 text-[11px] text-blue-700">
                                <Loader2 className="h-3 w-3 animate-spin" />{" "}
                                Preparing receipt…
                              </div>
                            ) : state === "choosing" ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] text-gray-500">
                                  Format:
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadReceipt(msg.id, mongoId, "A4")
                                  }
                                  className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                                >
                                  A4
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadReceipt(msg.id, mongoId, "58MM")
                                  }
                                  className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                                >
                                  58mm (Thermal)
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReceiptUI((p) => ({
                                      ...p,
                                      [msg.id]: "idle",
                                    }))
                                  }
                                  className="text-[11px] px-2 py-1 rounded-full text-gray-500 hover:text-gray-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setReceiptUI((p) => ({
                                    ...p,
                                    [msg.id]: "choosing",
                                  }))
                                }
                                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                              >
                                <Download className="h-3 w-3" />
                                Download receipt
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    {msg.qr && (
                      <div className="mt-2 ml-8 inline-block bg-white border rounded-xl p-3 shadow-sm">
                        <div className="text-xs font-semibold text-gray-700 mb-1">
                          {msg.qr.country === "SG" ? "PayNow" : "UPI"} — Order #
                          {msg.qr.orderId}
                        </div>
                        <div className="text-xs text-gray-500 mb-2">
                          {msg.qr.shopName || ""} ·{" "}
                          {msg.qr.country === "SG" ? "S$" : "₹"}
                          {(Number(msg.qr.amount) || 0).toFixed(2)}
                        </div>
                        <div className="bg-white p-2 rounded">
                          <QRCode value={msg.qr.qrValue} size={160} />
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1">
                          Customer scans to pay
                        </div>
                        {msg.qr.orderMongoId &&
                          (() => {
                            const state = receiptUI[msg.id] || "idle";
                            const mongoId = msg.qr.orderMongoId;
                            if (state === "downloading") {
                              return (
                                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-blue-700">
                                  <Loader2 className="h-3 w-3 animate-spin" />{" "}
                                  Preparing receipt…
                                </div>
                              );
                            }
                            if (state === "choosing") {
                              return (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] text-gray-500">
                                    Format:
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadReceipt(msg.id, mongoId, "A4")
                                    }
                                    className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                                  >
                                    A4
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      downloadReceipt(msg.id, mongoId, "58MM")
                                    }
                                    className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                                  >
                                    58mm (Thermal)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReceiptUI((p) => ({
                                        ...p,
                                        [msg.id]: "idle",
                                      }))
                                    }
                                    className="text-[11px] px-2 py-1 rounded-full text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                type="button"
                                onClick={() =>
                                  setReceiptUI((p) => ({
                                    ...p,
                                    [msg.id]: "choosing",
                                  }))
                                }
                                className="mt-2 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                              >
                                <Download className="h-3 w-3" />
                                Download receipt
                              </button>
                            );
                          })()}
                      </div>
                    )}
                    {msg.quickActions && msg.quickActions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 ml-8">
                        {msg.quickActions.map((qa, i) => (
                          <button
                            key={i}
                            onClick={() => handleQuickAction(qa.action)}
                            disabled={loading}
                            className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition disabled:opacity-50"
                          >
                            {qa.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-end gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-gray-600" />
                    </div>
                    <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {isPage && onNavigate && (
            <div className="flex-shrink-0 border-t border-slate-200 bg-white/70 backdrop-blur px-3 sm:pl-6 sm:pr-8 py-2 overflow-x-auto">
              <div className="flex sm:flex-wrap items-center gap-1.5 w-full min-w-max sm:min-w-0">
                <span className="text-[11px] font-medium text-slate-500 mr-1 flex-shrink-0">
                  Jump to:
                </span>
                {NAV_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onNavigate(t.id)}
                    className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition flex-shrink-0"
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={
              isPage
                ? "relative flex-shrink-0 border-t border-slate-200 bg-white/90 backdrop-blur px-3 sm:pl-6 sm:pr-8 py-3 sm:py-4"
                : "p-3 border-t flex gap-2 flex-shrink-0"
            }
          >
            {/* Suggestions popover (page mode) — anchored above the composer. */}
            {isPage && showSuggestions && (
              <>
                <button
                  type="button"
                  aria-label="Close suggestions"
                  onClick={() => setShowSuggestions(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute z-50 left-3 right-3 sm:left-6 sm:right-8 bottom-[calc(100%+0.5rem)] bg-white border border-slate-200 rounded-2xl shadow-xl p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">
                      Suggestions
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowSuggestions(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-[280px] overflow-y-auto">
                    {SUGGESTED_CARDS.map((c) => (
                      <button
                        key={c.title}
                        type="button"
                        onClick={() => {
                          setInput(c.prompt);
                          setShowSuggestions(false);
                          inputRef.current?.focus();
                        }}
                        className="group inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-[13px] text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition shadow-sm"
                      >
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${c.tint}`}
                        >
                          <c.Icon className="h-3 w-3" strokeWidth={2.25} />
                        </span>
                        {c.title}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            {isPage ? (
              <div className="flex items-end gap-1.5 sm:gap-2 w-full">
                <Button
                  type="button"
                  size="icon"
                  variant={showSuggestions ? "default" : "outline"}
                  onClick={() => setShowSuggestions((s) => !s)}
                  disabled={loading}
                  title="Suggestions"
                  className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex-shrink-0 ${showSuggestions ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-slate-300"}`}
                >
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                {hasVoice && (
                  <Button
                    type="button"
                    size="icon"
                    variant={isListening ? "destructive" : "outline"}
                    onClick={toggleVoice}
                    disabled={loading}
                    className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex-shrink-0 ${isListening ? "animate-pulse" : "border-slate-300"}`}
                  >
                    {isListening ? (
                      <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />
                    ) : (
                      <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                    )}
                  </Button>
                )}
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? "Listening…" : "Message KiosAI"}
                  className="flex-1 h-10 sm:h-12 text-sm sm:text-base rounded-xl border-slate-300 bg-white focus-visible:ring-blue-500"
                  disabled={loading || isListening}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleReset}
                  disabled={loading}
                  title="Reset chat"
                  className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex-shrink-0 border-slate-300 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50"
                >
                  <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || loading}
                  className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-blue-600 hover:bg-blue-700 flex-shrink-0 shadow-sm"
                >
                  <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
            ) : (
              <>
                {hasVoice && (
                  <Button
                    type="button"
                    size="sm"
                    variant={isListening ? "destructive" : "outline"}
                    onClick={toggleVoice}
                    disabled={loading}
                    className={`rounded-full w-9 h-9 p-0 flex-shrink-0 ${isListening ? "animate-pulse" : ""}`}
                  >
                    {isListening ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </Button>
                )}
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    isListening ? "Listening..." : "Ask KiosAI anything..."
                  }
                  className="flex-1 text-sm rounded-full"
                  disabled={loading || isListening}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleReset}
                  disabled={loading}
                  title="Reset chat"
                  className="rounded-full w-9 h-9 p-0 flex-shrink-0 hover:border-rose-300 hover:text-rose-600 hover:bg-rose-50"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!input.trim() || loading}
                  className="rounded-full w-9 h-9 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}
