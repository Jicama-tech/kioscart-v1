import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Bot, User, Loader2, Mic, MicOff, Store, Monitor, ShoppingCart, Users, Package, Globe, Settings, ChevronRight, ChevronDown, Sparkles } from "lucide-react";
import { useSubscription } from "@/context/SubscriptionContext";
import QRCode from "react-qr-code";
import jsQR from "jsqr";

const apiURL = __API_URL__;

interface QuickAction { label: string; action: string; }
interface QRPayload {
  orderId: string;
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
  subcategories?: { name: string; basePrice?: number; variants?: { title: string; price: number; inventory?: number }[] }[];
  options?: { title: string; price: number; inventory?: number }[];
}
interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  quickActions?: QuickAction[];
  qr?: QRPayload;
  productTree?: ProductTreeItem[];
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
    return `https://www.sgqrcode.com/paynow?mobile=${clean}&uen=&editable=0&amount=${action.amount.toFixed(2)}&expiry=${encodeURIComponent(formatted)}&ref_id=${encodeURIComponent(action.orderId)}&company=`;
  }
  // India — extract UPI from the shopkeeper's payment image
  const upi = action.paymentURL ? await extractUpiFromImage(apiURL + action.paymentURL) : "";
  if (!upi) return "";
  return `upi://pay?pa=${upi}&pn=${encodeURIComponent(action.shopName || "Payment")}&am=${action.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent("KiosAI Order - " + action.orderId)}`;
}

interface ChatbotWidgetProps {
  onNavigate?: (tab: string) => void;
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
      <div className="grid grid-cols-[1fr_120px_100px_100px] bg-slate-50 border-b border-slate-200 text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
        <div className="px-4 py-2.5">Product</div>
        <div className="px-3 py-2.5">Price</div>
        <div className="px-3 py-2.5">Stock</div>
        <div className="px-3 py-2.5">Status</div>
      </div>
      {products.map((p, i) => {
        const hasChildren = (p.variants?.length || 0) + (p.subcategories?.length || 0) + (p.options?.length || 0) > 0;
        const isOpen = openP.has(i);
        return (
          <div key={i}>
            <div
              onClick={() => hasChildren && toggleP(i)}
              className={`grid grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[14px] ${hasChildren ? "cursor-pointer hover:bg-blue-50" : ""}`}
            >
              <div className="px-4 py-3 flex items-center gap-2 min-w-0">
                {hasChildren ? (
                  isOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-500" />
                ) : <span className="w-4 flex-shrink-0" />}
                <span className="font-medium text-slate-900 truncate">{p.name}</span>
                {p.category && <span className="text-[11px] text-slate-400 flex-shrink-0">· {p.category}</span>}
              </div>
              <div className="px-3 py-3 text-slate-700">{fmt(p.price)}</div>
              <div className="px-3 py-3 text-slate-700">{p.inventory ?? "—"}</div>
              <div className="px-3 py-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  p.status === "active" ? "bg-emerald-100 text-emerald-700" :
                  p.status === "archived" ? "bg-slate-100 text-slate-600" :
                  "bg-amber-100 text-amber-700"
                }`}>{p.status || "—"}</span>
              </div>
            </div>

            {isOpen && (
              <div className="bg-slate-50/60">
                {/* Top-level variants */}
                {(p.variants || []).map((v, vi) => (
                  <div key={`v-${vi}`} className="grid grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px]">
                    <div className="px-4 py-2 pl-10 flex items-center gap-2 text-slate-700">
                      <span className="text-slate-400">·</span>
                      <span className="font-medium">{v.title}</span>
                      <span className="text-[11px] text-slate-400">variant</span>
                    </div>
                    <div className="px-3 py-2 text-slate-700">{fmt(v.price)}</div>
                    <div className="px-3 py-2 text-slate-700">{v.inventory ?? "—"}</div>
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
                        className={`grid grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px] ${hasScVariants ? "cursor-pointer hover:bg-blue-50" : ""}`}
                      >
                        <div className="px-4 py-2 pl-8 flex items-center gap-2 text-slate-800">
                          {hasScVariants ? (
                            scOpen ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-500" />
                          ) : <span className="w-3.5 flex-shrink-0" />}
                          <span className="font-medium">{sc.name}</span>
                          <span className="text-[11px] text-slate-400">subcategory</span>
                        </div>
                        <div className="px-3 py-2 text-slate-700">{sc.basePrice !== undefined ? fmt(sc.basePrice) : "—"}</div>
                        <div className="px-3 py-2" />
                        <div className="px-3 py-2" />
                      </div>
                      {scOpen && (sc.variants || []).map((v, vi) => (
                        <div key={`scv-${si}-${vi}`} className="grid grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px] bg-white">
                          <div className="px-4 py-2 pl-14 flex items-center gap-2 text-slate-700">
                            <span className="text-slate-400">·</span>
                            <span>{v.title}</span>
                          </div>
                          <div className="px-3 py-2 text-slate-700">{fmt(v.price)}</div>
                          <div className="px-3 py-2 text-slate-700">{v.inventory ?? "—"}</div>
                          <div className="px-3 py-2" />
                        </div>
                      ))}
                    </div>
                  );
                })}
                {/* Product options */}
                {(p.options || []).map((o, oi) => (
                  <div key={`o-${oi}`} className="grid grid-cols-[1fr_120px_100px_100px] border-b border-slate-100 text-[13px]">
                    <div className="px-4 py-2 pl-10 flex items-center gap-2 text-slate-700">
                      <span className="text-slate-400">·</span>
                      <span className="font-medium">{o.title}</span>
                      <span className="text-[11px] text-slate-400">option</span>
                    </div>
                    <div className="px-3 py-2 text-slate-700">{fmt(o.price)}</div>
                    <div className="px-3 py-2 text-slate-700">{o.inventory ?? "—"}</div>
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
const SUGGESTED_CARDS: { Icon: any; tint: string; title: string; sub: string; prompt: string }[] = [
  // Dashboard
  { Icon: Store, tint: "text-blue-600 bg-blue-50", title: "Today's revenue", sub: "Quick snapshot of today's sales", prompt: "Show today's revenue" },
  { Icon: Store, tint: "text-blue-600 bg-blue-50", title: "This month analytics", sub: "Revenue, orders & top products", prompt: "This month analytics" },
  // Kiosk
  { Icon: Monitor, tint: "text-emerald-600 bg-emerald-50", title: "Place a kiosk order", sub: "e.g. \"Place order for Vansh: 2 Mixed Nuts\"", prompt: "Place order for <name>: <items>" },
  { Icon: Monitor, tint: "text-emerald-600 bg-emerald-50", title: "Get a receipt", sub: "Generate the PDF for any order", prompt: "Receipt for order <orderId>" },
  // Orders
  { Icon: ShoppingCart, tint: "text-amber-600 bg-amber-50", title: "Pending orders", sub: "See what still needs your action", prompt: "Show pending orders" },
  { Icon: ShoppingCart, tint: "text-amber-600 bg-amber-50", title: "Confirm all payments", sub: "Mark every matched payment as paid", prompt: "Confirm all matched payments" },
  // CRM
  { Icon: Users, tint: "text-rose-600 bg-rose-50", title: "All customers", sub: "Full customer list with stats", prompt: "Show all my customers" },
  { Icon: Users, tint: "text-rose-600 bg-rose-50", title: "Add a customer", sub: "Voice or text — phone, email", prompt: "Add customer <name>, <phone>, <email>" },
  // Products
  { Icon: Package, tint: "text-cyan-600 bg-cyan-50", title: "All products", sub: "Browse your catalog", prompt: "Show all products" },
  { Icon: Package, tint: "text-cyan-600 bg-cyan-50", title: "Low stock alerts", sub: "Items below threshold", prompt: "Low stock products" },
  { Icon: Package, tint: "text-cyan-600 bg-cyan-50", title: "Add a new product", sub: "Quick catalog entry", prompt: "Add a new product called <name>, price <price>, category <category>" },
  // Settings
  { Icon: Settings, tint: "text-slate-600 bg-slate-100", title: "Shop info", sub: "Your store profile", prompt: "Show shop info" },
];

// Lightweight markdown-to-HTML for chat replies. Supports:
// - **bold** -> <strong>
// - GFM-style tables (lines of `| col | col |`) -> styled <table>
// - bullet items starting with `- ` or `* ` -> <ul>/<li>
// - numbered items `1. ` -> <ol>/<li>
// - blank lines and \n preserved as paragraph / line breaks
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}
function inlineMd(s: string) {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}
function renderTable(rows: string[]): string {
  // Drop the markdown separator row (---|---|...)
  const cells = rows
    .map((r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()))
    .filter((cols, i) => !(i === 1 && cols.every((c) => /^:?-+:?$/.test(c))));
  if (cells.length === 0) return "";
  const [header, ...body] = cells;
  const th = header.map((c) => `<th class="px-3 py-2.5 text-left text-[13px] font-semibold text-gray-700 border-b border-gray-200 bg-gray-50">${inlineMd(c)}</th>`).join("");
  const tr = body.map((row) => `<tr class="hover:bg-gray-50">${row.map((c) => `<td class="px-3 py-2.5 text-[14px] text-gray-800 border-b border-gray-100">${inlineMd(c)}</td>`).join("")}</tr>`).join("");
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
        items.push(`<li class="ml-4">${inlineMd(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul class="list-disc my-1">${items.join("")}</ul>`);
      continue;
    }
    // Numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li class="ml-4">${inlineMd(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
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

export function ChatbotWidget({ onNavigate, mode = "floating" }: ChatbotWidgetProps) {
  const { isModuleEnabled } = useSubscription();
  // In page mode the chat is always "open".
  const [open, setOpen] = useState(mode === "page");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const sendMessage = useCallback(async (text: string, isGreeting = false) => {
    if (!isGreeting) {
      setMessages((prev) => [...prev, {
        id: Date.now().toString(), role: "user", text, timestamp: new Date(),
      }]);
    }
    setInput("");
    setLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const res = await fetch(`${apiURL}/chatbot/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        let qr: QRPayload | undefined;
        if (data.botAction?.type === "showQR") {
          const qrValue = await buildQrValue(data.botAction);
          if (qrValue) {
            qr = {
              orderId: data.botAction.orderId,
              amount: data.botAction.amount,
              country: data.botAction.country,
              shopName: data.botAction.shopName,
              qrValue,
            };
          }
        }
        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(), role: "bot", text: data.text,
          quickActions: data.quickActions, qr,
          productTree: Array.isArray(data.productTree) ? data.productTree : undefined,
          timestamp: new Date(),
        }]);
        if (data.botAction?.type === "navigate" && data.botAction.tab && onNavigate) {
          setTimeout(() => {
            onNavigate(data.botAction.tab);
            setOpen(false);
          }, 1500);
        }
      } else {
        setMessages((prev) => [...prev, {
          id: (Date.now() + 1).toString(), role: "bot",
          text: "Something went wrong. Please try again.", timestamp: new Date(),
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        id: (Date.now() + 1).toString(), role: "bot",
        text: "Connection error.", timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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

  const hasVoice = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  if (!isModuleEnabled("chatbot")) return null;

  // Page-mode: fill the parent fully (no card chrome). Floating-mode: original bubble.
  const isPage = mode === "page";
  const containerClass = isPage
    ? "w-full h-[calc(100vh-6rem)] bg-gradient-to-b from-slate-50 to-white flex flex-col overflow-hidden"
    : "fixed bottom-6 right-6 z-50 w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden";
  const messageMaxWidth = isPage ? "max-w-[78%]" : "max-w-[85%]";

  return (
    <>
      {!isPage && !open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105">
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {(isPage || open) && (
        <div className={containerClass}>
          {isPage ? (
            <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur">
              <div className="flex items-center gap-3 pl-6 pr-8 py-4">
                <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-md">
                  <Bot className="h-6 w-6 text-white" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-base tracking-tight">KiosAI</p>
                  <p className="text-xs text-slate-500">Your smart store assistant · Online</p>
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
                  <p className="text-[10px] opacity-80">Your smart store assistant</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className={`flex-1 overflow-y-auto ${isPage ? "pl-6 pr-8 py-6" : "p-3"}`}>
            {/* Welcome / empty state — shown only until the shopkeeper sends their first message. */}
            {isPage && !messages.some((m) => m.role === "user") && (
              <div className="max-w-[900px] mx-auto pt-6 pb-10">
                <div className="flex flex-col items-center text-center gap-4 mb-8">
                  <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg">
                    <Bot className="h-7 w-7 text-white" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-slate-900 tracking-tight">
                      {messages[0]?.role === "bot" ? (messages[0].text.split("\n")[0].replace(/\*\*/g, "").replace(/[!.].*/, "")) : "How can I help?"}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Click a suggestion below or type your own message</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTED_CARDS.map((c) => (
                    <button
                      key={c.title}
                      type="button"
                      onClick={() => {
                        setInput(c.prompt);
                        inputRef.current?.focus();
                      }}
                      className="group inline-flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-[13px] text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition shadow-sm"
                    >
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${c.tint}`}>
                        <c.Icon className="h-3 w-3" strokeWidth={2.25} />
                      </span>
                      {c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={`${isPage ? "space-y-5 max-w-[1100px]" : "space-y-3"} ${isPage && !messages.some((m) => m.role === "user") ? "hidden" : ""}`}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={messageMaxWidth}>
                  <div className={`flex items-end ${isPage ? "gap-2" : "gap-1.5"} ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`${isPage ? "w-8 h-8" : "w-6 h-6"} rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === "user" ? "bg-blue-100" : "bg-gray-100"
                    }`}>
                      {msg.role === "user" ? <User className={`${isPage ? "h-4 w-4" : "h-3 w-3"} text-blue-600`} /> : <Bot className={`${isPage ? "h-4 w-4" : "h-3 w-3"} text-gray-600`} />}
                    </div>
                    <div className={`rounded-2xl ${isPage ? "px-4 py-3 text-[15px] leading-relaxed" : "px-3 py-2 text-sm"} ${
                      msg.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-white text-slate-800 border border-slate-200 shadow-sm rounded-bl-sm"
                    }`}>
                      <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }} />
                    </div>
                  </div>
                  {msg.productTree && msg.productTree.length > 0 && (
                    <div className="mt-2 ml-10">
                      <ProductTree products={msg.productTree} />
                    </div>
                  )}
                  {msg.qr && (
                    <div className="mt-2 ml-8 inline-block bg-white border rounded-xl p-3 shadow-sm">
                      <div className="text-xs font-semibold text-gray-700 mb-1">
                        {msg.qr.country === "SG" ? "PayNow" : "UPI"} — Order #{msg.qr.orderId}
                      </div>
                      <div className="text-xs text-gray-500 mb-2">
                        {msg.qr.shopName || ""} · {msg.qr.country === "SG" ? "S$" : "₹"}{msg.qr.amount.toFixed(2)}
                      </div>
                      <div className="bg-white p-2 rounded">
                        <QRCode value={msg.qr.qrValue} size={160} />
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1">Customer scans to pay</div>
                    </div>
                  )}
                  {msg.quickActions && msg.quickActions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-8">
                      {msg.quickActions.map((qa, i) => (
                        <button key={i} onClick={() => handleQuickAction(qa.action)} disabled={loading}
                          className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition disabled:opacity-50">
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
            <div className="flex-shrink-0 border-t border-slate-200 bg-white/70 backdrop-blur pl-6 pr-8 py-2">
              <div className="flex flex-wrap items-center gap-1.5 max-w-[1100px]">
                <span className="text-[11px] font-medium text-slate-500 mr-1">Jump to:</span>
                {NAV_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onNavigate(t.id)}
                    className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition"
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className={isPage ? "relative flex-shrink-0 border-t border-slate-200 bg-white/90 backdrop-blur pl-6 pr-8 py-4" : "p-3 border-t flex gap-2 flex-shrink-0"}>
            {/* Suggestions popover (page mode) — anchored above the composer. */}
            {isPage && showSuggestions && (
              <>
                <button
                  type="button"
                  aria-label="Close suggestions"
                  onClick={() => setShowSuggestions(false)}
                  className="fixed inset-0 z-40 cursor-default"
                />
                <div className="absolute z-50 left-6 right-8 bottom-[calc(100%+0.5rem)] bg-white border border-slate-200 rounded-2xl shadow-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[12px] font-semibold text-slate-700 uppercase tracking-wide">Suggestions</p>
                    <button type="button" onClick={() => setShowSuggestions(false)} className="text-slate-400 hover:text-slate-600">
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
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${c.tint}`}>
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
              <div className="flex items-end gap-2 max-w-[1100px]">
                <Button type="button" size="icon" variant={showSuggestions ? "default" : "outline"}
                  onClick={() => setShowSuggestions((s) => !s)} disabled={loading}
                  title="Suggestions"
                  className={`h-12 w-12 rounded-xl flex-shrink-0 ${showSuggestions ? "bg-blue-600 hover:bg-blue-700 text-white" : "border-slate-300"}`}>
                  <Sparkles className="h-5 w-5" />
                </Button>
                {hasVoice && (
                  <Button type="button" size="icon" variant={isListening ? "destructive" : "outline"}
                    onClick={toggleVoice} disabled={loading}
                    className={`h-12 w-12 rounded-xl flex-shrink-0 ${isListening ? "animate-pulse" : "border-slate-300"}`}>
                    {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                )}
                <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? "Listening…" : "Message KiosAI — ask anything about your store"}
                  className="flex-1 h-12 text-base rounded-xl border-slate-300 bg-white focus-visible:ring-blue-500"
                  disabled={loading || isListening} />
                <Button type="submit" size="icon" disabled={!input.trim() || loading}
                  className="h-12 w-12 rounded-xl bg-blue-600 hover:bg-blue-700 flex-shrink-0 shadow-sm">
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            ) : (
              <>
                {hasVoice && (
                  <Button type="button" size="sm" variant={isListening ? "destructive" : "outline"}
                    onClick={toggleVoice} disabled={loading}
                    className={`rounded-full w-9 h-9 p-0 flex-shrink-0 ${isListening ? "animate-pulse" : ""}`}>
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
                <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? "Listening..." : "Ask KiosAI anything..."}
                  className="flex-1 text-sm rounded-full" disabled={loading || isListening} />
                <Button type="submit" size="sm" disabled={!input.trim() || loading}
                  className="rounded-full w-9 h-9 p-0 bg-blue-600 hover:bg-blue-700 flex-shrink-0">
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
