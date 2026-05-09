import { useCallback, useEffect, useState } from "react";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const RZP_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

interface CreateOrderArgs {
  orderId: string;
  shopkeeperId: string;
  amount: number;
  currency?: "INR";
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
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
    const res = await fetch(`${apiURL}/payments/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(args),
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
        name: args.shopName || "KiosCart",
        description: args.description || `Order ${args.orderId}`,
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

  return { scriptReady, openCheckout, createPaymentOrder, verifyPayment };
}
