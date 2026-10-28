import jsQR from "jsqr";

const apiURL = __API_URL__;

/**
 * Kiosk sales paid by QR (PayNow / UPI): "Payment pending" until the customer presses "I have paid" on the payment
 * link (/kiosk-pay/<token>) or the staff confirm it at the kiosk; only then is the order placed (backend:
 * modules/kiosk-payments).
 */
export interface KioskPayment {
  id: string;
  status: "pending" | "paid" | "cancelled" | "expired";
  amount: number;
  currency: string | null;
  customerName: string | null;
  customerWhatsApp: string | null;
  lines: { name: string; quantity: number; lineTotal: number; option?: string | null }[];
  orderRef: string;
  payUrl: string;
  qr: { kind: "paynow" | "upi" | null; imageUrl: string | null; upiQrPath: string | null };
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  paidBy: "customer" | "staff" | null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("token");
  const res = await fetch(`${apiURL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error([].concat(data?.message || "Something went wrong").join(" "));
  return data as T;
}

export const kioskPayments = {
  create: (order: Record<string, any>, externalRef?: string) =>
    call<KioskPayment>("/kiosk-payments", { method: "POST", body: JSON.stringify({ order, ...(externalRef ? { externalRef } : {}) }) }),
  list: () => call<{ payments: KioskPayment[] }>("/kiosk-payments"),
  support: () => call<{ qr: boolean; qrKind: "paynow" | "upi" | null; qrSetup: string | null }>("/kiosk-payments/support"),
  markPaid: (id: string) => call<KioskPayment>(`/kiosk-payments/${id}/paid`, { method: "POST" }),
  cancel: (id: string) => call<KioskPayment>(`/kiosk-payments/${id}/cancel`, { method: "POST" }),
};

/** The UPI id (pa=...) inside the shop's uploaded UPI QR image, or "" when it cannot be read. */
export function extractUpiId(imageUrl: string): Promise<string> {
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
      const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      const match = code?.data?.includes("upi://pay") ? code.data.match(/pa=([^&]+)/) : null;
      resolve(match?.[1] || "");
    };
    img.onerror = () => resolve("");
    img.src = imageUrl;
  });
}

/** A UPI payment request for this amount, as a QR or a "pay in UPI app" link. */
export function upiLink(upiId: string, payee: string, amount: number, note: string): string {
  return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payee || "Payment")}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
}

export const uploadUrl = (path: string | null | undefined) => (path ? apiURL + path : "");
