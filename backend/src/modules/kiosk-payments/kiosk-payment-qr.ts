/**
 * The QR a customer pays a kiosk sale with, built from the shop's own settings (the same ones KiosCart's kiosk uses):
 *  - Singapore: a PayNow QR for the shop's phone number (Settings > Profile > Phone) with the exact amount;
 *  - India: the UPI QR the shop uploaded (Settings > Payments > Static QR Code); the payment page reads the UPI id
 *    from it and shows a QR (and a "pay in UPI app" button) with the amount filled in.
 */
export type QrKind = "paynow" | "upi";

export interface ShopQrSettings {
  country?: string;
  phone?: string;
  paymentURL?: string;
}

/** Which QR this shop can take, or null when it has not set one up. */
export function qrKindFor(shop: ShopQrSettings): QrKind | null {
  const country = String(shop.country || "IN").toUpperCase();
  if (country === "SG") return payNowMobile(shop.phone) ? "paynow" : null;
  if (country === "IN") return shop.paymentURL ? "upi" : null;
  return null;
}

/** What to set up, in the shop's KiosCart settings, for QR payments to work. */
export function qrSetupHint(shop: ShopQrSettings): string {
  return String(shop.country || "IN").toUpperCase() === "SG"
    ? "Add the shop's PayNow mobile number in KiosCart Settings > Profile > Phone."
    : "Upload the shop's UPI QR in KiosCart Settings > Payments > Static QR Code.";
}

/** The 8-digit Singapore mobile number PayNow pays to, from the shop's phone as typed. */
export function payNowMobile(phone?: string): string | null {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("65")) digits = digits.slice(2);
  return /^[89]\d{7}$/.test(digits) ? digits : null;
}

/** An image of the PayNow QR for this amount (the same service KiosCart's kiosk and payment page use). */
export function payNowImageUrl(phone: string | undefined, amount: number, ref: string, expiresAt: Date): string | null {
  const mobile = payNowMobile(phone);
  if (!mobile || !(amount > 0)) return null;
  // shown in Singapore time, as the payer's banking app does
  const sg = new Date(expiresAt.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const expiry = `${sg.getUTCFullYear()}/${pad(sg.getUTCMonth() + 1)}/${pad(sg.getUTCDate())} ${pad(sg.getUTCHours())}:${pad(sg.getUTCMinutes())}`;
  return (
    "https://www.sgqrcode.com/paynow?mobile=" + mobile +
    "&uen=&editable=0&amount=" + amount.toFixed(2) +
    "&expiry=" + encodeURIComponent(expiry) +
    "&ref_id=" + encodeURIComponent(ref.slice(0, 25)) +
    "&company="
  );
}
