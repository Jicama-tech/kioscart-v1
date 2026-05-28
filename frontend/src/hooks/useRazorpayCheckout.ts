import { useCallback, useEffect, useState } from "react";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const RZP_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

interface CreateOrderArgs {
  /** Human-readable cart tag used in Razorpay receipt + notes. The real
   * Mongo Order is materialized server-side only after capture. */
  orderId: string;
  shopkeeperId: string;
  amount: number;
  currency?: "INR";
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /** Full cart payload (CreateOrderDto shape). Backend stashes this on
   * the Payment record and creates the Order only after Razorpay confirms
   * capture, so abandoned modals don't leave ghost orders behind. */
  order: any;
}

interface OpenCheckoutArgs extends CreateOrderArgs {
  shopName?: string;
  themeColor?: string;
  description?: string;
  /** Restrict to a subset of methods. Empty/undefined = all enabled methods. */
  methods?: Array<"card" | "upi" | "netbanking" | "wallet">;
  onSuccess?: (paymentId: string) => void;
  onFailure?: (error: any) => void;
  onDismiss?: () => void;
}

/**
 * Cart payload for the LAZY-creation Razorpay flow. The backend stashes
 * this in a CheckoutIntent at /payments/initiate time and creates the
 * actual Order ONLY on /payments/verify-create after payment captures.
 * Result: no zombie unpaid orders in the DB if the customer abandons.
 */
interface InitiateLazyArgs {
  orderId: string; // pre-generated shopslug-order-xxx
  shopkeeperId: string;
  items: any[];
  totalAmount: number;
  orderType: string;
  deliveryAddress?: { street: string; city: string; state: string; zip: string };
  pickupDate?: string;
  pickupTime?: string;
  couponCode?: string;
  instructions?: string;
  customerWhatsApp: string;
  customerName?: string;
  customerEmail?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
}

interface OpenCheckoutLazyArgs extends InitiateLazyArgs {
  shopName?: string;
  themeColor?: string;
  description?: string;
  methods?: Array<"card" | "upi" | "netbanking" | "wallet">;
  /** Fires AFTER backend has verified the payment AND created the Order. */
  onSuccess?: (info: { paymentId: string; orderId: string; publicOrderId: string }) => void;
  onFailure?: (error: any) => void;
  onDismiss?: () => void;
}

let scriptPromise: Promise<boolean> | null = null;

function loadCheckoutScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = RZP_SCRIPT;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Razorpay Custom Checkout: our UI initiates payment, but the rzp SDK
 * collects card/UPI inputs and tokenizes them in-browser — so card data
 * never reaches our backend (no PCI scope expansion).
 */
export function useRazorpayCheckout() {
  const [scriptReady, setScriptReady] = useState<boolean>(false);

  useEffect(() => {
    loadCheckoutScript().then(setScriptReady);
  }, []);

  const createPaymentOrder = useCallback(async (args: CreateOrderArgs) => {
    const token = localStorage.getItem("token") || "";
    const body = {
      shopkeeperId: args.shopkeeperId,
      amount: args.amount,
      order: args.order,
      ...(args.currency ? { currency: args.currency } : {}),
      ...(args.customerName ? { customerName: args.customerName } : {}),
      ...(args.customerEmail ? { customerEmail: args.customerEmail } : {}),
      ...(args.customerPhone ? { customerPhone: args.customerPhone } : {}),
    };
    const res = await fetch(`${apiURL}/payments/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Failed to create payment order");
    return data as {
      paymentId: string;
      gatewayOrderId: string;
      amount: number;
      currency: string;
      keyId: string;
      shopkeeperAccountId: string;
      customer: { name?: string; email?: string; contact?: string };
    };
  }, []);

  const verifyPayment = useCallback(
    async (input: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => {
      const res = await fetch(`${apiURL}/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Verification failed");
      return data;
    },
    [],
  );

  /** Lazy-flow step 1: stash cart + create Razorpay order. No Order doc yet.
   *  Sends ONLY the cart payload — never display/SDK fields like shopName,
   *  methods, callbacks (NestJS DTO whitelist rejects unknown keys). */
  const initiatePayment = useCallback(async (args: InitiateLazyArgs) => {
    const token = localStorage.getItem("token") || "";
    const body: InitiateLazyArgs = {
      orderId: args.orderId,
      shopkeeperId: args.shopkeeperId,
      items: args.items,
      totalAmount: args.totalAmount,
      orderType: args.orderType,
      deliveryAddress: args.deliveryAddress,
      pickupDate: args.pickupDate,
      pickupTime: args.pickupTime,
      couponCode: args.couponCode,
      instructions: args.instructions,
      customerWhatsApp: args.customerWhatsApp,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      fullName: args.fullName,
      firstName: args.firstName,
      lastName: args.lastName,
    };
    // Drop undefined keys — class-validator complains about `pickupDate: undefined`
    Object.keys(body).forEach(
      (k) => (body as any)[k] === undefined && delete (body as any)[k],
    );
    const res = await fetch(`${apiURL}/payments/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Failed to initiate payment");
    return data as {
      gatewayOrderId: string;
      amount: number;
      currency: string;
      keyId: string;
      shopkeeperAccountId?: string;
      mode: "route" | "direct";
      customer: { name?: string; email?: string; contact?: string };
    };
  }, []);

  /** Lazy-flow step 2: verify the signature AND create the actual Order. */
  const verifyAndCreate = useCallback(
    async (input: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
    }) => {
      const res = await fetch(`${apiURL}/payments/verify-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Verification failed");
      return data as {
        success: boolean;
        orderId: string;
        publicOrderId: string;
        paymentId: string;
        transferId?: string;
        transferStatus?: string;
        alreadyProcessed?: boolean;
        transferError?: string;
      };
    },
    [],
  );

  const openCheckout = useCallback(
    async (args: OpenCheckoutArgs) => {
      const ready = await loadCheckoutScript();
      if (!ready || !window.Razorpay) {
        args.onFailure?.(new Error("Razorpay SDK failed to load"));
        return;
      }

      const order = await createPaymentOrder(args);

      const options: any = {
        key: order.keyId,
        order_id: order.gatewayOrderId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        // Same brand lock as openCheckoutLazy — modal title is always
        // "KiosCart"; shop name shows in the description line.
        name: "KiosCart",
        description:
          args.description ||
          (args.shopName
            ? `Order from ${args.shopName}`
            : `Order ${args.orderId}`),
        prefill: {
          name: args.customerName || order.customer.name || "",
          email: args.customerEmail || order.customer.email || "",
          contact: args.customerPhone || order.customer.contact || "",
        },
        theme: { color: args.themeColor || "#6366f1" },
        notes: {
          kioscart_order_id: args.orderId,
          shopkeeper_id: args.shopkeeperId,
        },
        modal: {
          ondismiss: () => args.onDismiss?.(),
        },
        handler: async (response: any) => {
          try {
            await verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            args.onSuccess?.(response.razorpay_payment_id);
          } catch (err) {
            args.onFailure?.(err);
          }
        },
      };

      if (args.methods?.length) {
        options.method = args.methods.reduce(
          (acc, m) => ({ ...acc, [m]: true }),
          {} as Record<string, boolean>,
        );
      }

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp: any) => args.onFailure?.(resp.error));
      rzp.open();
    },
    [createPaymentOrder, verifyPayment],
  );

  /**
   * Lazy-creation Razorpay flow: takes the full cart payload, initiates the
   * Razorpay order with no DB writes, opens the SDK, and on success calls
   * verify-create which materializes the Order + Payment in one shot.
   *
   * Customer abandons → backend's CheckoutIntent TTL-expires → no zombie
   * unpaid Order in DB. Replaces the old "create order, then pay" flow.
   */
  const openCheckoutLazy = useCallback(
    async (args: OpenCheckoutLazyArgs) => {
      const ready = await loadCheckoutScript();
      if (!ready || !window.Razorpay) {
        args.onFailure?.(new Error("Razorpay SDK failed to load"));
        return;
      }

      let initiated;
      try {
        initiated = await initiatePayment(args);
      } catch (err) {
        args.onFailure?.(err);
        return;
      }

      const options: any = {
        key: initiated.keyId,
        order_id: initiated.gatewayOrderId,
        amount: Math.round(initiated.amount * 100),
        currency: initiated.currency,
        // Platform branding — checkout always shows KiosCart, never the
        // shopkeeper's business name (even though the underlying Razorpay
        // key may belong to the shop in Direct mode).
        name: "KiosCart",
        // Shop name goes here so the customer still knows who they're
        // buying from, just one line down.
        description:
          args.description ||
          (args.shopName
            ? `Order from ${args.shopName}`
            : `Order ${args.orderId}`),
        prefill: {
          name: args.customerName || args.fullName || initiated.customer.name || "",
          email: args.customerEmail || initiated.customer.email || "",
          contact: args.customerWhatsApp || initiated.customer.contact || "",
        },
        theme: { color: args.themeColor || "#6366f1" },
        notes: {
          kioscart_order_id: args.orderId,
          shopkeeper_id: args.shopkeeperId,
          shop_name: args.shopName || "",
        },
        modal: {
          ondismiss: () => args.onDismiss?.(),
        },
        handler: async (response: any) => {
          try {
            const result = await verifyAndCreate({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            args.onSuccess?.({
              paymentId: response.razorpay_payment_id,
              orderId: result.orderId,
              publicOrderId: result.publicOrderId,
            });
          } catch (err) {
            args.onFailure?.(err);
          }
        },
      };

      if (args.methods?.length) {
        options.method = args.methods.reduce(
          (acc, m) => ({ ...acc, [m]: true }),
          {} as Record<string, boolean>,
        );
      }

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp: any) => args.onFailure?.(resp.error));
      rzp.open();
    },
    [initiatePayment, verifyAndCreate],
  );

  return {
    scriptReady,
    openCheckout,
    openCheckoutLazy,
    createPaymentOrder,
    verifyPayment,
    initiatePayment,
    verifyAndCreate,
  };
}
