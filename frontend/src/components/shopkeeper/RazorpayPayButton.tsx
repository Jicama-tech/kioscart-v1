import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";

interface Props {
  /** Internal Mongo Order id (must already exist before clicking). */
  orderId: string;
  shopkeeperId: string;
  amount: number;
  shopName?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /** Country gating — if not "IN", the button hides itself. */
  country?: string;
  /** Whether the shopkeeper's KYC is active. If false, button is disabled. */
  kycActive?: boolean;
  themeColor?: string;
  onSuccess: (paymentId: string) => void;
}

export function RazorpayPayButton({
  orderId,
  shopkeeperId,
  amount,
  shopName,
  customerName,
  customerEmail,
  customerPhone,
  country = "IN",
  kycActive = true,
  themeColor,
  onSuccess,
}: Props) {
  const { openCheckout, scriptReady } = useRazorpayCheckout();
  const [busy, setBusy] = useState(false);

  if (country.toUpperCase() !== "IN") {
    return null; // Other countries fall back to manual QR for now
  }

  const handleClick = async () => {
    if (!kycActive) {
      toast.error(
        "This shop's payment gateway isn't activated yet. Use the manual QR.",
      );
      return;
    }
    setBusy(true);
    try {
      await openCheckout({
        orderId,
        shopkeeperId,
        amount,
        shopName,
        customerName,
        customerEmail,
        customerPhone,
        themeColor,
        onSuccess: (paymentId) => {
          setBusy(false);
          toast.success("Payment successful!");
          onSuccess(paymentId);
        },
        onFailure: (err) => {
          setBusy(false);
          toast.error(err?.message || "Payment failed");
        },
        onDismiss: () => setBusy(false),
      });
    } catch (err: any) {
      setBusy(false);
      toast.error(err.message || "Could not start payment");
    }
  };

  return (
    <Button
      className="w-full"
      onClick={handleClick}
      disabled={busy || !scriptReady || !kycActive}
    >
      {busy ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <CreditCard className="mr-2 h-4 w-4" />
      )}
      {busy ? "Opening checkout…" : `Pay ₹${amount.toFixed(2)} with Razorpay`}
    </Button>
  );
}

export default RazorpayPayButton;
