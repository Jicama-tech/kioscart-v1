import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useCart } from "@/hooks/cartContext";
import { useToast } from "@/components/ui/use-toast";
import { COUNTRY_CODES } from "@/data/countryCodes";
import { CONTACT_EVENT, getCartContact, isValidWhatsApp, setCartContact } from "@/lib/cartRecovery";
import { t as i18nT } from "@/i18n/t";

const SHOW_AFTER_MS = 25_000;
const dismissedKey = (shopId: string) => `kc_save_cart_dismissed_${shopId}`;

const wasDismissed = (shopId: string) => {
  try {
    return sessionStorage.getItem(dismissedKey(shopId)) === "1";
  } catch {
    return false;
  }
};

/**
 * Asks a guest with items in their cart for their WhatsApp number, so the cart is saved and we can remind them if
 * they leave. Shown once per visit: when they are about to leave the page (desktop) or after a short while; never
 * once the number is known (typed on the cart page, given here, or a logged-in customer).
 */
export function SaveCartPrompt({ shopkeeperId, country, accentColor }: {
  shopkeeperId: string;
  country?: string;
  accentColor?: string;
}) {
  const { cartCount } = useCart();
  const { toast } = useToast();
  const [hasContact, setHasContact] = useState(() => !!getCartContact());
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => wasDismissed(shopkeeperId));
  const [dialCode, setDialCode] = useState(
    () => COUNTRY_CODES.find((c) => c.code === (country || "").toUpperCase())?.dial_code || "+65",
  );
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");

  const hasItems = cartCount(shopkeeperId) > 0;
  const eligible = hasItems && !hasContact && !dismissed;

  useEffect(() => {
    const refresh = () => setHasContact(!!getCartContact());
    window.addEventListener(CONTACT_EVENT, refresh);
    return () => window.removeEventListener(CONTACT_EVENT, refresh);
  }, []);

  useEffect(() => {
    if (!eligible || open) return;
    const timer = setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    // pointer leaving through the top of the window = about to close the tab or go back
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) setOpen(true);
    };
    document.addEventListener("mouseout", onLeave);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [eligible, open]);

  if (!eligible || !open) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(dismissedKey(shopkeeperId), "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const whatsapp = dialCode + number.replace(/\D/g, "");
    if (!isValidWhatsApp(whatsapp)) {
      toast({ duration: 4000, title: i18nT("Please enter a valid WhatsApp number") });
      return;
    }
    setCartContact({ whatsapp, name });
    toast({ duration: 4000, title: i18nT("Cart saved"), description: i18nT("Your items will be here when you come back.") });
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-[360px] z-50 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 text-gray-400 hover:text-gray-700"
        aria-label={i18nT("Close")}
      >
        <X className="h-4 w-4" />
      </button>
      <form onSubmit={save} className="space-y-3">
        <div className="pr-6">
          <p className="text-sm font-semibold text-gray-900">{i18nT("Save your cart?")}</p>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            {i18nT("Leave your WhatsApp number and we'll keep your cart for you. We may send you a reminder about it.")}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={dialCode}
            onChange={(e) => setDialCode(e.target.value)}
            className="h-10 w-[92px] shrink-0 rounded-md border border-gray-200 bg-white px-2 text-sm"
            aria-label={i18nT("Country code")}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.dial_code}>
                {c.code} {c.dial_code}
              </option>
            ))}
          </select>
          <input
            type="tel"
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 15))}
            placeholder={i18nT("WhatsApp number")}
            className="h-10 min-w-0 flex-1 rounded-md border border-gray-200 px-3 text-sm"
            autoFocus
          />
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={i18nT("Your name (optional)")}
          className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={dismiss} className="h-9 px-3 text-sm text-gray-500 hover:text-gray-800">
            {i18nT("No thanks")}
          </button>
          <button
            type="submit"
            className="h-9 rounded-md px-4 text-sm font-semibold text-white"
            style={{ backgroundColor: accentColor || "#111827" }}
          >
            {i18nT("Save my cart")}
          </button>
        </div>
      </form>
    </div>
  );
}
