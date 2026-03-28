import { useState, useEffect } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Banknote,
  QrCode,
  Loader2,
  CheckCircle,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KioskCart } from "@/hooks/useKioskCarts";
import { jwtDecode } from "jwt-decode";

const apiURL = __API_URL__;

interface Country {
  name: string;
  code: string;
  dialCode: string;
}

interface ShopInfo {
  whatsappNumber: string;
  shopName: string;
  paymentURL: string;
  hasDocVerification: boolean;
  taxPercentage: number;
  discountPercentage: number;
}

interface KioskCheckoutDialogProps {
  open: boolean;
  onClose: () => void;
  cart: KioskCart;
  total: number;
  shopkeeperId: string;
  formatPrice: (amount: number) => string;
  onOrderPlaced: () => void;
}

export function KioskCheckoutDialog({
  open,
  onClose,
  cart,
  total,
  shopkeeperId,
  formatPrice,
  onOrderPlaced,
}: KioskCheckoutDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);

  // Customer details — same as cartPage self/kiosk mode
  const [countryCode, setCountryCode] = useState("+65");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [validating, setValidating] = useState(false);

  // Fetch countries on mount
  useEffect(() => {
    async function fetchCountries() {
      try {
        const res = await fetch(
          "https://restcountries.com/v3.1/all?fields=name,cca2,idd",
        );
        const data = await res.json();
        const list: Country[] = data
          .map((c: any) => {
            const root = c.idd?.root ?? "";
            const suffixes = c.idd?.suffixes ?? [];
            let dial = "";
            if (root && suffixes.length === 1) dial = root + suffixes[0];
            else if (root) dial = root;
            return { name: c.name?.common || "", code: c.cca2 || "", dialCode: dial };
          })
          .filter((c: Country) => c.dialCode)
          .sort((a: Country, b: Country) => a.name.localeCompare(b.name));
        setCountries(list);
      } catch {}
    }
    fetchCountries();
  }, []);

  // Fetch shopkeeper info when dialog opens
  useEffect(() => {
    if (!open) return;
    async function fetchShop() {
      try {
        const res = await fetch(
          `${apiURL}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
        );
        if (res.ok) {
          const { data } = await res.json();
          setShopInfo({
            whatsappNumber: data.whatsappNumber || "",
            shopName: data.shopName || "Merchant",
            paymentURL: data.paymentURL || "",
            hasDocVerification: data.hasDocVerification || false,
            taxPercentage: data.taxPercentage || 0,
            discountPercentage: data.discountPercentage || 0,
          });
        }
      } catch {}
    }
    fetchShop();
  }, [open, shopkeeperId]);

  // Pre-fill customer name from cart
  useEffect(() => {
    if (open && cart.customerName && !cart.customerName.startsWith("Walk-in")) {
      const parts = cart.customerName.split(" ");
      setFirstName(parts[0] || "");
      setLastName(parts.slice(1).join(" ") || "");
    }
  }, [open, cart.customerName]);

  // Validate WhatsApp — look up existing customer (same as cartPage)
  async function findUserByWhatsApp() {
    if (!whatsapp) return;
    setValidating(true);
    try {
      const fullNumber = `${countryCode}${whatsapp}`;
      const res = await fetch(
        `${apiURL}/users/get-user-by-whatsAppNumber/${fullNumber}`,
      );

      if (res.status === 404) {
        setWhatsappVerified(true);
        toast({
          duration: 3000,
          title: "New Customer",
          description: "Please fill in customer details",
        });
        return;
      }

      if (!res.ok) throw new Error("Failed to validate");

      const data = await res.json();
      if (data.data) {
        setCustomerEmail(data.data.email || "");
        setFirstName(data.data.name?.split(" ")[0] || "");
        setLastName(data.data.name?.split(" ").slice(1).join(" ") || "");
        setWhatsappVerified(true);
        toast({
          duration: 3000,
          title: "Customer Found",
          description: "Details auto-filled successfully",
        });
      } else {
        setWhatsappVerified(true);
        toast({
          duration: 3000,
          title: "New Customer",
          description: "Please fill in customer details",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Validation failed",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  }

  // Calculate totals — same as cartPage
  const subtotal = total;
  const discountPercentage = shopInfo?.discountPercentage || 0;
  const taxPercentage = shopInfo?.taxPercentage || 0;
  const discount = (subtotal * discountPercentage) / 100;
  const grandTotal = subtotal - discount;
  const tax = (grandTotal * taxPercentage) / 100;
  const finalTotal = grandTotal + tax;

  const fullName = `${firstName} ${lastName}`.trim() || cart.customerName;
  const userWhatsApp = whatsapp ? `${countryCode}${whatsapp}` : "";

  function getOrderItems() {
    return cart.items.map((item) => ({
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
    }));
  }

  function getNow() {
    const now = new Date();
    return {
      date: now.toISOString().split("T")[0],
      time: `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
    };
  }

  async function handleCashPayment() {
    if (!firstName) {
      toast({ title: "Required", description: "Please enter first name", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");
      const decoded: any = jwtDecode(token);
      if (!shopInfo) throw new Error("Shop info not loaded");

      const { date, time } = getNow();
      const orderId = `ORDER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const orderData = {
        orderId,
        userId: decoded.sub,
        shopkeeperId,
        items: getOrderItems(),
        totalAmount: finalTotal,
        orderType: "pickup",
        pickupDate: date,
        pickupTime: time,
        paymentConfirmed: true,
        whatsAppNumber: userWhatsApp || shopInfo.whatsappNumber || "kiosk-order",
        fullName,
        firstName,
        lastName,
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
        description: `Order for ${fullName} created successfully`,
      });

      resetAndClose();
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
    if (!firstName) {
      toast({ title: "Required", description: "Please enter first name", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");
      const decoded: any = jwtDecode(token);
      if (!shopInfo) throw new Error("Shop info not loaded");

      const { date, time } = getNow();
      const orderId = `ORDER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const paymentImageUrl = shopInfo.paymentURL
        ? apiURL + shopInfo.paymentURL
        : "";

      navigate("/payment", {
        state: {
          paymentImageUrl,
          whatsAppNumber: shopInfo.whatsappNumber,
          merchantName: shopInfo.shopName,
          hasDocVerification: shopInfo.hasDocVerification,
          orderId,
          shopkeeperId,
          fullName,
          userWhatsApp: userWhatsApp || shopInfo.whatsappNumber,
          instructions,
          userId: decoded.sub,
          orderType: "pickup",
          deliveryAddress: null,
          pickupDate: date,
          pickupTime: time,
          cartItems: cart.items,
          subtotal,
          deliveryFee: 0,
          taxPercentage,
          discountPercentage,
          tax,
          total: finalTotal,
          discount,
          couponDiscount: 0,
          appliedCoupon: null,
          itemCount: cart.items.reduce((s, i) => s + i.quantity, 0),
          isKioskOrder: true,
        },
      });

      resetAndClose();
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

  function resetAndClose() {
    setPaymentMethod(null);
    setInstructions("");
    setWhatsapp("");
    setWhatsappVerified(false);
    setFirstName("");
    setLastName("");
    setCustomerEmail("");
    onOrderPlaced();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkout — {cart.customerName}</DialogTitle>
          <DialogDescription>
            {cart.items.length} item{cart.items.length !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Order Summary */}
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {cart.items.map((item) => (
            <div
              key={`${item.productId}-${item.subcategoryIndex}-${item.variantIndex}`}
              className="flex justify-between text-sm"
            >
              <span className="text-slate-600 flex-1 min-w-0">
                <span className="truncate block">
                  {item.productName}
                  {item.variantTitle !== "Default" ? ` (${item.variantTitle})` : ""}
                  {item.subcategoryName !== "Default" ? ` — ${item.subcategoryName}` : ""}
                </span>
                <span className="text-xs text-slate-400">
                  x{item.quantity}
                  {item.measurement ? ` · ${item.measurement}` : ""}
                </span>
              </span>
              <span className="font-medium ml-2 whitespace-nowrap">
                {formatPrice(
                  (item.isDiscounted && item.discountedPrice
                    ? item.discountedPrice
                    : item.price) * item.quantity,
                )}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        {/* Price Breakdown */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount ({discountPercentage}%)</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>Tax ({taxPercentage}%)</span>
              <span>+{formatPrice(tax)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{formatPrice(finalTotal)}</span>
          </div>
        </div>

        <Separator />

        {/* Customer Details — same as cartPage self/kiosk mode */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Customer Details
          </Label>

          {/* WhatsApp Number with Validate */}
          <div>
            <Label className="text-xs text-slate-500 flex items-center justify-between mb-1">
              <span>WhatsApp Number *</span>
              {whatsappVerified && <Badge variant="default" className="text-[10px]">Verified</Badge>}
            </Label>
            <div className="flex items-center gap-2">
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger className="w-24 h-9 text-xs">
                  <SelectValue placeholder="Code" />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.dialCode}>
                      {c.name} {c.dialCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="tel"
                placeholder="Enter number"
                maxLength={10}
                className="h-9"
                value={whatsapp}
                onChange={(e) => {
                  setWhatsapp(e.target.value.replace(/\D/g, ""));
                  setWhatsappVerified(false);
                  setFirstName(cart.customerName.startsWith("Walk-in") ? "" : cart.customerName.split(" ")[0] || "");
                  setLastName(cart.customerName.startsWith("Walk-in") ? "" : cart.customerName.split(" ").slice(1).join(" ") || "");
                  setCustomerEmail("");
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 text-xs px-3"
                disabled={whatsappVerified || !whatsapp || validating}
                onClick={findUserByWhatsApp}
              >
                {validating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : whatsappVerified ? (
                  "Validated"
                ) : (
                  "Validate"
                )}
              </Button>
            </div>
          </div>

          {/* First Name & Last Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">First Name *</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                className="h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Last Name *</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
                className="h-9 mt-1"
              />
            </div>
          </div>

          {/* Customer Email */}
          <div>
            <Label className="text-xs text-slate-500">
              Customer Email <span className="text-slate-400">(optional)</span>
            </Label>
            <Input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@email.com"
              className="h-9 mt-1"
            />
          </div>
        </div>

        <Separator />

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

        {/* Payment Method */}
        <div>
          <Label className="text-xs text-slate-500 mb-2 block">
            Payment Method
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={paymentMethod === "cash" ? "default" : "outline"}
              className="h-16 flex-col gap-1.5"
              onClick={() => setPaymentMethod("cash")}
            >
              <Banknote className="h-5 w-5" />
              <span className="text-xs">Cash</span>
            </Button>
            <Button
              variant={paymentMethod === "qr" ? "default" : "outline"}
              className="h-16 flex-col gap-1.5"
              onClick={() => setPaymentMethod("qr")}
            >
              <QrCode className="h-5 w-5" />
              <span className="text-xs">QR Payment</span>
            </Button>
          </div>
        </div>

        {/* Confirm Button */}
        {paymentMethod && (
          <Button
            className="w-full h-10"
            disabled={submitting || !shopInfo || !firstName || !whatsapp}
            onClick={paymentMethod === "cash" ? handleCashPayment : handleQRPayment}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : paymentMethod === "cash" ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : (
              <QrCode className="h-4 w-4 mr-2" />
            )}
            {paymentMethod === "cash"
              ? `Confirm Cash — ${formatPrice(finalTotal)}`
              : `Pay ${formatPrice(finalTotal)} via QR`}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
