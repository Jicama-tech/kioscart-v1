import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Bot, User, Loader2, Mic, MicOff } from "lucide-react";
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
}

export function ChatbotWidget({ onNavigate }: ChatbotWidgetProps) {
  const { isModuleEnabled } = useSubscription();
  const [open, setOpen] = useState(false);
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
        sendMessage(text);
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
    setIsListening(true);
  };

  const hasVoice = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const formatText = (text: string) =>
    text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');

  if (!isModuleEnabled("chatbot")) return null;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105">
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
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

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <div className={`flex items-end gap-1.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === "user" ? "bg-indigo-100" : "bg-gray-100"
                    }`}>
                      {msg.role === "user" ? <User className="h-3 w-3 text-indigo-600" /> : <Bot className="h-3 w-3 text-gray-600" />}
                    </div>
                    <div className={`rounded-2xl px-3 py-2 text-sm ${
                      msg.role === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}>
                      <div dangerouslySetInnerHTML={{ __html: formatText(msg.text) }} />
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
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="p-3 border-t flex gap-2 flex-shrink-0">
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
          </form>
        </div>
      )}
    </>
  );
}
