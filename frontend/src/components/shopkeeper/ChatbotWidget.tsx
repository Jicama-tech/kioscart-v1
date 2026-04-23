import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Bot, User, Loader2, Mic, MicOff, Store, Monitor, ShoppingCart, Users, Package, Globe, Settings } from "lucide-react";
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
interface Message {
  id: string;
  role: "user" | "bot";
  text: string;
  quickActions?: QuickAction[];
  qr?: QRPayload;
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

// Tabs the chat can jump to (matches the sidebar order, minus the chat tab itself).
const NAV_TABS: { id: string; label: string; Icon: any }[] = [
  { id: "dashboard", label: "Dashboard", Icon: Store },
  { id: "kiosk", label: "Kiosk", Icon: Monitor },
  { id: "orders", label: "Orders", Icon: ShoppingCart },
  { id: "crm", label: "CRM", Icon: Users },
  { id: "products", label: "Products", Icon: Package },
  { id: "storefront", label: "Storefront", Icon: Globe },
  { id: "settings", label: "Settings", Icon: Settings },
];

// Quick-start prompt pills shown in page mode. Grouped by capability so the
// shopkeeper can see at a glance what KiosAI can do and pick a starter.
const SUGGESTED_PROMPTS: { group: string; items: string[] }[] = [
  {
    group: "Dashboard",
    items: [
      "Show today's revenue",
      "This month analytics",
      "Top selling products",
      "How many customers",
    ],
  },
  {
    group: "Kiosk / Place order",
    items: [
      "Place order for <name>: <items>",
      "Show menu",
      "Receipt for order <orderId>",
    ],
  },
  {
    group: "Orders & Payments",
    items: [
      "Show pending orders",
      "Show today's orders",
      "Confirm all matched payments",
      "Payment summary",
    ],
  },
  {
    group: "Customers (CRM)",
    items: [
      "Show all my customers",
      "VIP customers",
      "Add customer <name>, <phone>, <email>",
      "Show customer <name>",
    ],
  },
  {
    group: "Products",
    items: [
      "Show all products",
      "Low stock products",
      "Add a new product called <name>, price <price>, category <category>",
      "Show <product name>",
    ],
  },
  {
    group: "Settings",
    items: [
      "Show shop info",
      "Show my plan",
      "List operators",
      "List coupons",
    ],
  },
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
          quickActions: data.quickActions, qr, timestamp: new Date(),
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
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105">
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {(isPage || open) && (
        <div className={containerClass}>
          {isPage ? (
            <div className="flex-shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur">
              <div className="flex items-center gap-3 pl-6 pr-8 py-4">
                <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
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
            <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
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
            <div className={`${isPage ? "space-y-5 max-w-[1100px]" : "space-y-3"}`}>
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={messageMaxWidth}>
                  <div className={`flex items-end ${isPage ? "gap-2" : "gap-1.5"} ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`${isPage ? "w-8 h-8" : "w-6 h-6"} rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === "user" ? "bg-indigo-100" : "bg-gray-100"
                    }`}>
                      {msg.role === "user" ? <User className={`${isPage ? "h-4 w-4" : "h-3 w-3"} text-indigo-600`} /> : <Bot className={`${isPage ? "h-4 w-4" : "h-3 w-3"} text-gray-600`} />}
                    </div>
                    <div className={`rounded-2xl ${isPage ? "px-4 py-3 text-[15px] leading-relaxed" : "px-3 py-2 text-sm"} ${
                      msg.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white text-slate-800 border border-slate-200 shadow-sm rounded-bl-sm"
                    }`}>
                      <div dangerouslySetInnerHTML={{ __html: formatMessage(msg.text) }} />
                    </div>
                  </div>
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
                          className="text-xs px-2.5 py-1 rounded-full border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition disabled:opacity-50">
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
            {isPage && messages.length > 0 && !messages.some((m) => m.role === "user") && (
              <div className="pt-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick start — click a prompt to begin</p>
                <div className="space-y-3">
                  {SUGGESTED_PROMPTS.map((group) => (
                    <div key={group.group}>
                      <p className="text-[11px] font-medium text-slate-500 mb-1.5">{group.group}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.items.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setInput(p);
                              inputRef.current?.focus();
                            }}
                            className="text-[13px] px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition shadow-sm"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
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
                    className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition"
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className={isPage ? "flex-shrink-0 border-t border-slate-200 bg-white/90 backdrop-blur pl-6 pr-8 py-4" : "p-3 border-t flex gap-2 flex-shrink-0"}>
            {isPage ? (
              <div className="flex items-end gap-2 max-w-[1100px]">
                {hasVoice && (
                  <Button type="button" size="icon" variant={isListening ? "destructive" : "outline"}
                    onClick={toggleVoice} disabled={loading}
                    className={`h-12 w-12 rounded-xl flex-shrink-0 ${isListening ? "animate-pulse" : "border-slate-300"}`}>
                    {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                )}
                <Input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? "Listening…" : "Message KiosAI — ask anything about your store"}
                  className="flex-1 h-12 text-base rounded-xl border-slate-300 bg-white focus-visible:ring-indigo-500"
                  disabled={loading || isListening} />
                <Button type="submit" size="icon" disabled={!input.trim() || loading}
                  className="h-12 w-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 flex-shrink-0 shadow-sm">
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
                  className="rounded-full w-9 h-9 p-0 bg-indigo-600 hover:bg-indigo-700 flex-shrink-0">
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
