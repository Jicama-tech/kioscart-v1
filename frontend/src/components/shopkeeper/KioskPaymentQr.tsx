import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { extractUpiId, upiLink, uploadUrl } from "@/lib/kioskPayments";
import { t as i18nT } from "@/i18n/t";

/**
 * The QR a customer pays a kiosk sale with: PayNow (an image with the amount, from the backend) or UPI (the shop's
 * uploaded QR, re-drawn with the amount). Shown at the kiosk and on the customer's payment page.
 */
export function KioskPaymentQr({
  qr,
  amount,
  payee,
  reference,
  size = 256,
  onUpiLink,
}: {
  qr: { kind: "paynow" | "upi" | null; imageUrl: string | null; upiQrPath: string | null };
  amount: number;
  payee: string;
  reference: string;
  size?: number;
  onUpiLink?: (link: string) => void;
}) {
  const [upi, setUpi] = useState<string>("");
  const [reading, setReading] = useState(qr.kind === "upi");

  useEffect(() => {
    if (qr.kind !== "upi" || !qr.upiQrPath) return;
    let cancelled = false;
    extractUpiId(uploadUrl(qr.upiQrPath)).then((id) => {
      if (cancelled) return;
      const link = id ? upiLink(id, payee, amount, `Order ${reference}`) : "";
      setUpi(link);
      setReading(false);
      if (link) onUpiLink?.(link);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr.kind, qr.upiQrPath, amount, payee, reference]);

  const box = { width: size, height: size };

  if (qr.kind === "paynow" && qr.imageUrl) {
    return <img src={qr.imageUrl} alt="PayNow QR" style={box} className="object-contain" />;
  }
  if (qr.kind === "upi") {
    if (upi) return <QRCode value={upi} size={size} />;
    if (reading) return <div style={box} className="flex items-center justify-center text-sm text-muted-foreground">{i18nT("Loading QR...")}</div>;
    // the UPI id could not be read from the image: show the shop's own QR (the customer types the amount)
    if (qr.upiQrPath) return <img src={uploadUrl(qr.upiQrPath)} alt="UPI QR" style={box} className="object-contain" />;
  }
  return <div style={box} className="flex items-center justify-center text-sm text-muted-foreground">{i18nT("No payment QR configured")}</div>;
}
