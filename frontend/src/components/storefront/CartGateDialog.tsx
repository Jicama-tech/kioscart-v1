import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { COUNTRY_CODES } from "@/data/countryCodes";
import { isValidWhatsApp } from "@/lib/cartRecovery";
import { t as i18nT } from "@/i18n/t";

/**
 * Shown the first time a shopper adds to cart: continue with Google, or leave a WhatsApp number. Either way the shop
 * can save their cart, send order updates and remind them if they leave it.
 *
 * Built on the same Radix dialog as the product window it opens over: a plain overlay would be blocked by that modal
 * (it turns off clicks and keeps keyboard focus outside itself), while a second Radix dialog stacks on top of it.
 */
export function CartGateDialog({ productName, onWhatsApp, onGoogle, onClose }: {
  productName?: string;
  onWhatsApp: (whatsapp: string, name: string) => void;
  onGoogle: () => void;
  onClose: () => void;
}) {
  const [dialCode, setDialCode] = useState("+65");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const whatsapp = dialCode + number.replace(/\D/g, "");
    if (!isValidWhatsApp(whatsapp)) {
      setError(i18nT("Please enter a valid WhatsApp number"));
      return;
    }
    onWhatsApp(whatsapp, name);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6">
        <div className="pr-6 space-y-1">
          <DialogTitle className="text-base font-semibold text-gray-900">{i18nT("Continue to add to cart")}</DialogTitle>
          <DialogDescription className="text-sm text-gray-500 leading-relaxed">
            {productName
              ? `${i18nT("So we can save")} ${productName} ${i18nT("in your cart and send you order updates.")}`
              : i18nT("So we can save your cart and send you order updates.")}
          </DialogDescription>
        </div>

        <button
          type="button"
          onClick={onGoogle}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {i18nT("Continue with Google")}
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-gray-400">
          <span className="h-px flex-1 bg-gray-200" />
          {i18nT("or")}
          <span className="h-px flex-1 bg-gray-200" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            <select
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              className="h-11 w-[96px] shrink-0 rounded-lg border border-gray-300 bg-white px-2 text-sm"
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
              onChange={(e) => {
                setNumber(e.target.value.replace(/\D/g, "").slice(0, 15));
                setError("");
              }}
              placeholder={i18nT("WhatsApp number")}
              className="h-11 min-w-0 flex-1 rounded-lg border border-gray-300 px-3 text-sm"
              autoFocus
            />
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={i18nT("Your name (optional)")}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" className="h-11 w-full rounded-lg bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800">
            {i18nT("Continue")}
          </button>
          <p className="text-center text-[11px] text-gray-400 leading-relaxed">
            {i18nT("We'll only message you about your cart and orders.")}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
