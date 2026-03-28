import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CreditCard,
  Banknote,
  QrCode,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KioskCart } from "@/hooks/useKioskCarts";
import { jwtDecode } from "jwt-decode";

const apiURL = __API_URL__;

interface KioskCheckoutDialogProps {
  open: boolean;
  onClose: () => void;
  cart: KioskCart;
  total: number;
  shopkeeperId: string;
  onOrderPlaced: () => void;
}

export function KioskCheckoutDialog({
  open,
  onClose,
  cart,
  total,
  shopkeeperId,
  onOrderPlaced,
}: KioskCheckoutDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [instructions, setInstructions] = useState("");

  async function handleCashPayment() {
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");
      const decoded: any = jwtDecode(token);

      // Fetch shopkeeper details for whatsapp number
      const shopRes = await fetch(
        `${apiURL}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
      );
      if (!shopRes.ok) throw new Error("Failed to fetch shopkeeper info");
      const { data: shop } = await shopRes.json();

      const now = new Date();
      const orderId = `KIOSK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const orderData = {
        orderId,
        userId: decoded.sub,
        shopkeeperId,
        items: cart.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          price: item.isDiscounted && item.discountedPrice
            ? item.discountedPrice
            : item.price,
          quantity: item.quantity,
          variantTitle: item.variantTitle,
          subcategoryName: item.subcategoryName,
          image: item.image,
          trackQuantity: item.trackQuantity,
        })),
        totalAmount: total,
        orderType: "pickup",
        pickupDate: now.toISOString().split("T")[0],
        pickupTime: `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
        paymentConfirmed: true,
        whatsAppNumber: shop.whatsappNumber || decoded.email || "kiosk-order",
        fullName: cart.customerName,
        instructions: instructions || undefined,
      };

      const res = await fetch(`${apiURL}/orders/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create order");
      }

      toast({
        title: "Order Placed",
        description: `Order for ${cart.customerName} created successfully`,
      });

      onOrderPlaced();
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to place order",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQRPayment() {
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");
      const decoded: any = jwtDecode(token);

      // Fetch shopkeeper details
      const shopRes = await fetch(
        `${apiURL}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
      );
      if (!shopRes.ok) throw new Error("Failed to fetch shopkeeper info");
      const { data: shop } = await shopRes.json();

      const now = new Date();
      const orderId = `KIOSK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const paymentImageUrl = shop.paymentURL
        ? apiURL + shop.paymentURL
        : "";

      // Navigate to payment page with all required state
      navigate("/payment", {
        state: {
          paymentImageUrl,
          whatsAppNumber: shop.whatsappNumber,
          merchantName: shop.shopName || "Merchant",
          hasDocVerification: shop.hasDocVerification,
          orderId,
          shopkeeperId,
          fullName: cart.customerName,
          userWhatsApp: shop.whatsappNumber,
          instructions,
          userId: decoded.sub,
          orderType: "pickup",
          deliveryAddress: null,
          pickupDate: now.toISOString().split("T")[0],
          pickupTime: `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
          cartItems: cart.items,
          subtotal: total,
          deliveryFee: 0,
          taxPercentage: 0,
          discountPercentage: 0,
          tax: 0,
          total,
          discount: 0,
          couponDiscount: 0,
          appliedCoupon: null,
          itemCount: cart.items.reduce((s, i) => s + i.quantity, 0),
        },
      });

      onOrderPlaced();
      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to initiate payment",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkout — {cart.customerName}</DialogTitle>
          <DialogDescription>
            {cart.items.length} item{cart.items.length !== 1 ? "s" : ""} |
            Total: ${total.toFixed(2)}
          </DialogDescription>
        </DialogHeader>

        {/* Order Summary */}
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {cart.items.map((item) => (
            <div
              key={`${item.productId}-${item.subcategoryIndex}-${item.variantIndex}`}
              className="flex justify-between text-sm"
            >
              <span className="text-slate-600">
                {item.productName}
                {item.variantTitle !== "Default"
                  ? ` (${item.variantTitle})`
                  : ""}{" "}
                x{item.quantity}
              </span>
              <span className="font-medium">
                $
                {(
                  (item.isDiscounted && item.discountedPrice
                    ? item.discountedPrice
                    : item.price) * item.quantity
                ).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex justify-between text-base font-bold">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>

        {/* Instructions */}
        <div>
          <Label className="text-xs text-slate-500">
            Order Notes (optional)
          </Label>
          <Textarea
            placeholder="Any special instructions..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className="mt-1 h-16 text-sm"
          />
        </div>

        <Separator />

        {/* Payment Method Selection */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">
            Payment Method
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={paymentMethod === "cash" ? "default" : "outline"}
              className="h-20 flex-col gap-1.5"
              onClick={() => setPaymentMethod("cash")}
            >
              <Banknote className="h-6 w-6" />
              <span className="text-xs">Cash</span>
            </Button>
            <Button
              variant={paymentMethod === "qr" ? "default" : "outline"}
              className="h-20 flex-col gap-1.5"
              onClick={() => setPaymentMethod("qr")}
            >
              <QrCode className="h-6 w-6" />
              <span className="text-xs">QR Payment</span>
            </Button>
          </div>
        </div>

        {/* Confirm Button */}
        {paymentMethod && (
          <Button
            className="w-full h-10"
            disabled={submitting}
            onClick={
              paymentMethod === "cash" ? handleCashPayment : handleQRPayment
            }
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : paymentMethod === "cash" ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : (
              <QrCode className="h-4 w-4 mr-2" />
            )}
            {paymentMethod === "cash"
              ? "Confirm Cash Payment"
              : "Generate QR Code"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
