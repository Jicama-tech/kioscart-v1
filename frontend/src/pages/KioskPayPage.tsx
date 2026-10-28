import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Clock, Loader2, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KioskPaymentQr } from "@/components/shopkeeper/KioskPaymentQr";
import { t as i18nT } from "@/i18n/t";

const apiURL = __API_URL__;

interface PayView {
  shopName: string;
  country: string;
  status: "pending" | "paid" | "cancelled" | "expired";
  amount: number;
  currency: string | null;
  customerName: string | null;
  lines: { name: string; quantity: number; lineTotal: number; option?: string | null }[];
  orderRef: string;
  qr: { kind: "paynow" | "upi" | null; imageUrl: string | null; upiQrPath: string | null };
  expiresAt: string;
}

/**
 * The payment link a kiosk sends to a customer who is not at the counter (/kiosk-pay/<token>): the amount and the
 * PayNow / UPI QR, and "I have paid", which places the order. No sign-in: the token in the link is the key.
 */
export default function KioskPayPage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<PayView | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [upiAppLink, setUpiAppLink] = useState("");

  useEffect(() => {
    fetch(`${apiURL}/public/kiosk-pay/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error([].concat(data?.message || "This payment link does not exist.").join(" "));
        setView(data);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const money = (v: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: view?.currency || (view?.country === "SG" ? "SGD" : "INR") }).format(v);
    } catch {
      return v.toFixed(2);
    }
  };

  async function confirm() {
    setConfirming(true);
    try {
      const res = await fetch(`${apiURL}/public/kiosk-pay/${encodeURIComponent(token)}/paid`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error([].concat(data?.message || "Please try again.").join(" "));
      setView((v) => (v ? { ...v, status: "paid" } : v));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConfirming(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-muted/40 flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-sm border p-6 space-y-5">{children}</div>
    </div>
  );

  if (!view) {
    return shell(
      error ? (
        <div className="text-center space-y-2 py-6">
          <XCircle className="h-10 w-10 mx-auto text-red-500" />
          <p className="font-semibold">{error}</p>
        </div>
      ) : (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ),
    );
  }

  const header = (
    <div className="text-center space-y-1">
      <p className="text-sm text-muted-foreground">{view.shopName}</p>
      <p className="text-3xl font-bold">{money(view.amount)}</p>
      <p className="text-xs text-muted-foreground">{i18nT("Order")} {view.orderRef}</p>
    </div>
  );

  if (view.status === "paid") {
    return shell(
      <>
        {header}
        <div className="text-center space-y-2 py-4">
          <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
          <p className="font-semibold">{i18nT("Thank you! Your order has been placed.")}</p>
          <p className="text-sm text-muted-foreground">{i18nT("The shop will check the payment and get your order ready.")}</p>
        </div>
      </>,
    );
  }

  if (view.status !== "pending") {
    return shell(
      <>
        {header}
        <div className="text-center space-y-2 py-4">
          <Clock className="h-10 w-10 mx-auto text-amber-500" />
          <p className="font-semibold">
            {view.status === "cancelled" ? i18nT("This payment was cancelled by the shop.") : i18nT("This payment link has expired.")}
          </p>
          <p className="text-sm text-muted-foreground">{i18nT("Please contact the shop for a new link.")}</p>
        </div>
      </>,
    );
  }

  return shell(
    <>
      {header}

      {view.lines.length > 0 && (
        <ul className="text-sm divide-y border rounded-lg">
          {view.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{l.name}</span>
                <span className="text-xs text-muted-foreground">x{l.quantity}{l.option ? ` · ${l.option}` : ""}</span>
              </span>
              <span className="whitespace-nowrap">{money(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col items-center gap-2">
        <div className="bg-white p-3 rounded-lg border">
          <KioskPaymentQr qr={view.qr} amount={view.amount} payee={view.shopName} reference={view.orderRef} size={232} onUpiLink={setUpiAppLink} />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          {view.qr.kind === "paynow" ? i18nT("Scan with your banking app (PayNow)") : i18nT("Scan with any UPI app")}
        </p>
        {view.qr.kind === "upi" && upiAppLink && (
          <a href={upiAppLink} className="w-full">
            <Button variant="outline" className="w-full h-11"><Smartphone className="h-4 w-4 mr-2" />{i18nT("Pay in a UPI app on this phone")}</Button>
          </a>
        )}
        {view.qr.kind === "paynow" && (
          <p className="text-xs text-muted-foreground text-center">
            {i18nT("On this phone? Take a screenshot of the QR, then choose it from your gallery in your banking app's scanner.")}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 text-center">{error}</p>}

      <Button className="w-full h-12 text-base" disabled={confirming} onClick={confirm}>
        {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
        {i18nT("I have paid")}
      </Button>
      <p className="text-xs text-muted-foreground text-center">{i18nT("Press this after paying, and your order is placed.")}</p>
    </>,
  );
}
