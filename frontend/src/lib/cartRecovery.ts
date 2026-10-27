/**
 * Saving a shopper's cart on the server once we know how to reach them (WhatsApp number or email), so a cart they
 * leave behind can be followed up and opened again from the reminder ("restore my cart" link).
 *
 *  - the contact comes from the cart page (WhatsApp number, or the email of a Google sign-in), the "Save my cart"
 *    box, or a logged-in customer;
 *  - each shop's cart in this browser has its own random key, which is also the secret in the restore link;
 *  - CartProvider sends the cart whenever it changes (see cartContext.tsx).
 */
import { jwtDecode } from "jwt-decode";
import type { CartItem } from "@/hooks/cartContext";

const apiURL = __API_URL__;

const CONTACT_KEY = "kc_cart_contact";
const CART_KEY_PREFIX = "kc_cart_key_";
export const CONTACT_EVENT = "kc-cart-contact";

export interface CartContact {
  whatsapp?: string; // with country code, e.g. "+6590037950"
  name?: string;
  email?: string;
}

export const isValidWhatsApp = (value?: string | null) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
};

export const isValidEmail = (value?: string | null) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

/** We can remind this shopper: a WhatsApp number or an email. */
const isReachable = (c?: Partial<CartContact> | null) => !!c && (isValidWhatsApp(c.whatsapp) || isValidEmail(c.email));

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private browsing: the cart just is not saved
  }
};

export function getCartContact(): CartContact | null {
  try {
    const c = JSON.parse(read(CONTACT_KEY) || "null");
    return isReachable(c) ? c : null;
  } catch {
    return null;
  }
}

/** Remembers how to reach the shopper; with neither a complete number nor an email it is ignored. */
export function setCartContact(contact: CartContact) {
  if (!isReachable(contact)) return;
  const clean: CartContact = {
    ...(isValidWhatsApp(contact.whatsapp) ? { whatsapp: contact.whatsapp!.trim() } : {}),
    ...(contact.name?.trim() ? { name: contact.name.trim() } : {}),
    ...(isValidEmail(contact.email) ? { email: contact.email!.trim() } : {}),
  };
  if (JSON.stringify(clean) === read(CONTACT_KEY)) return;
  write(CONTACT_KEY, JSON.stringify(clean));
  window.dispatchEvent(new Event(CONTACT_EVENT));
}

const newKey = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** This browser's key for the shop's cart (made on first use unless create is false). */
export function cartKeyFor(shopkeeperId: string, create = true): string | null {
  let key = read(CART_KEY_PREFIX + shopkeeperId);
  if (!key && create) {
    key = newKey();
    write(CART_KEY_PREFIX + shopkeeperId, key);
  }
  return key;
}

export function setCartKey(shopkeeperId: string, key: string | null) {
  write(CART_KEY_PREFIX + shopkeeperId, key);
}

/** Sends the shop's cart (an empty list removes a cart that was never checked out). */
export async function saveCart(shopkeeperId: string, cartKey: string, items: unknown[], contact: CartContact) {
  await fetch(`${apiURL}/storefront-carts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cartKey,
      shopkeeperId,
      ...(contact.whatsapp ? { customerWhatsApp: contact.whatsapp } : {}),
      ...(contact.name ? { customerName: contact.name } : {}),
      ...(contact.email ? { customerEmail: contact.email } : {}),
      items,
    }),
    keepalive: true,
  });
}

export interface SavedCart {
  shopkeeperId: string;
  status: "open" | "recovered";
  items: CartItem[];
  customerWhatsApp: string | null;
  customerName: string | null;
  customerEmail: string | null;
}

/** A Google sign-in (buyer token) gives us the shopper's email, and their WhatsApp number if they gave one before. */
export function rememberSignedInCustomer(token: string | null = sessionStorage.getItem("userToken")) {
  if (!token) return;
  try {
    const d = jwtDecode<{ whatsAppNumber?: string; name?: string; firstName?: string; lastName?: string; email?: string }>(token);
    const name = d.name || [d.firstName, d.lastName].filter(Boolean).join(" ");
    if (d.whatsAppNumber || d.email) setCartContact({ whatsapp: d.whatsAppNumber, name, email: d.email });
  } catch {
    // an old or broken token: the shopper is just asked again
  }
}

// The item a shopper was adding when they went off to sign in with Google; added when they come back
const PENDING_ADD_KEY = "kc_pending_add";

export interface PendingAdd {
  shopkeeperId: string;
  item: Omit<CartItem, "quantity">;
  quantity: number;
}

export function takePendingAdd(): PendingAdd | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ADD_KEY);
    sessionStorage.removeItem(PENDING_ADD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Off to Google; back on this same page afterwards, where the item being added is put in the cart. */
export function startGoogleSignIn(pending?: PendingAdd) {
  try {
    if (pending) sessionStorage.setItem(PENDING_ADD_KEY, JSON.stringify(pending));
    sessionStorage.setItem("cartReturnUrl", window.location.pathname + window.location.search);
  } catch {
    // ignore: they come back to the home page instead
  }
  window.location.href = `${apiURL}/auth/google-buyer?origin=${encodeURIComponent(window.location.origin)}`;
}

export async function fetchSavedCart(cartKey: string): Promise<SavedCart | null> {
  const res = await fetch(`${apiURL}/storefront-carts/${encodeURIComponent(cartKey)}`);
  return res.ok ? res.json() : null;
}
