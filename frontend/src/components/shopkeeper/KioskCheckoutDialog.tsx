import { useState, useEffect, useRef } from "react";
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
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KioskCart } from "@/hooks/useKioskCarts";
import { generateOrderId } from "@/lib/orderId";
import { jwtDecode } from "jwt-decode";
import QRCode from "react-qr-code";
import jsQR from "jsqr";
import { COUNTRY_CODES } from "@/data/countryCodes";

import { t as i18nT } from "@/i18n/t";
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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);

  // Inline QR payment state
  const [showQRPayment, setShowQRPayment] = useState(false);
  const [qrPaymentData, setQrPaymentData] = useState<any>(null);
  const [dynamicUpiString, setDynamicUpiString] = useState("");
  const [dynamicPayNowUrl, setDynamicPayNowUrl] = useState("");
  const [qrOrderCreated, setQrOrderCreated] = useState(false);
  const [qrOrderId, setQrOrderId] = useState("");
  const [shopkeeperCountry, setShopkeeperCountry] = useState("");
  const [shopkeeperPhone, setShopkeeperPhone] = useState("");
  const [upiId, setUpiId] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Customer details — same as cartPage self/kiosk mode
  const [countryCode, setCountryCode] = useState("+65");
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    setCountries(
      COUNTRY_CODES.map((c) => ({
        name: c.name,
        code: c.code,
        dialCode: c.dial_code,
      })),
    );
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
          setShopkeeperCountry(data.country || "IN");
          setShopkeeperPhone(data.phone || "");
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
          title: i18nT("New Customer"),
          description: i18nT("Please fill in customer details"),
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
          title: i18nT("Customer Found"),
          description: i18nT("Details auto-filled successfully"),
        });
      } else {
        setWhatsappVerified(true);
        toast({
          duration: 3000,
          title: i18nT("New Customer"),
          description: i18nT("Please fill in customer details"),
        });
      }
    } catch (err: any) {
      toast({
        title: i18nT("Error"),
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
      price:
        item.isDiscounted && item.discountedPrice
          ? item.discountedPrice
          : item.price,
      quantity: item.quantity,
      variantTitle: item.variantTitle,
      subcategoryName: item.subcategoryName,
      image: item.image,
      trackQuantity: item.trackQuantity,
      optionTitle: item.optionTitle,
      optionPrice: item.optionPrice,
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
      toast({
        title: i18nT("Required"),
        description: i18nT("Please enter first name"),
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");
      const decoded: any = jwtDecode(token);
      if (!shopInfo) throw new Error("Shop info not loaded");

      const { date, time } = getNow();
      const orderId = generateOrderId(shopInfo?.shopName);

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
        whatsAppNumber:
          userWhatsApp || shopInfo.whatsappNumber || "kiosk-order",
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
        title: i18nT("Order Placed"),
        description: `Order for ${fullName} created successfully`,
      });

      resetAndClose();
    } catch (error: any) {
      toast({
        title: i18nT("Error"),
        description: error.message || "Failed to place order",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Extract UPI ID from payment QR image
  async function extractUpiFromImage(imageUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("");
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);
        if (code?.data?.includes("upi://pay")) {
          const match = code.data.match(/pa=([^&]+)/);
          resolve(match?.[1] || "");
        } else {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = imageUrl;
    });
  }

  // Generate dynamic UPI string
  function generateDynamicUpi(extractedUpiId: string, orderId: string): string {
    if (!extractedUpiId || !finalTotal) return "";
    return `upi://pay?pa=${extractedUpiId}&pn=${encodeURIComponent(
      shopInfo?.shopName || "Payment",
    )}&am=${finalTotal.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
      `Kiosk Order - ${orderId}`,
    )}`;
  }

  // Generate PayNow QR URL for Singapore
  function generateDynamicPayNowUrl(orderId: string): string {
    if (!shopkeeperPhone || !finalTotal) return "";
    const cleanedMobile = shopkeeperPhone.startsWith("+65")
      ? shopkeeperPhone.substring(3)
      : shopkeeperPhone;
    const now = new Date();
    const expiry = new Date(now.getTime() + 90 * 60 * 60 * 1000);
    const formatted = `${expiry.getFullYear()}/${String(expiry.getMonth() + 1).padStart(2, "0")}/${String(expiry.getDate()).padStart(2, "0")} ${String(expiry.getHours()).padStart(2, "0")}:${String(expiry.getMinutes()).padStart(2, "0")}`;
    return `https://www.sgqrcode.com/paynow?mobile=${cleanedMobile}&uen=&editable=0&amount=${finalTotal.toFixed(2)}&expiry=${encodeURIComponent(formatted)}&ref_id=${encodeURIComponent(orderId)}&company=`;
  }

  async function handleQRPayment() {
    if (!firstName) {
      toast({
        title: i18nT("Required"),
        description: i18nT("Please enter first name"),
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      if (!shopInfo) throw new Error("Shop info not loaded");

      // Generate orderId upfront so it can be embedded in the QR code
      const orderId = generateOrderId(shopInfo?.shopName);
      setQrOrderId(orderId);

      // Generate QR data based on country
      if (shopkeeperCountry === "SG") {
        const payNowUrl = generateDynamicPayNowUrl(orderId);
        setDynamicPayNowUrl(payNowUrl);
      } else {
        // India — extract UPI from payment image
        if (shopInfo.paymentURL) {
          const extracted = await extractUpiFromImage(
            apiURL + shopInfo.paymentURL,
          );
          if (extracted) {
            setUpiId(extracted);
            setDynamicUpiString(generateDynamicUpi(extracted, orderId));
          }
        }
      }

      // Show inline QR payment view
      setShowQRPayment(true);
    } catch (error: any) {
      toast({
        title: i18nT("Error"),
        description: error.message || "Failed to generate QR",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Create order after customer confirms QR payment
  async function handleQRPaymentConfirm() {
    setSubmitting(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");
      const decoded: any = jwtDecode(token);

      const { date, time } = getNow();

      const orderData = {
        orderId: qrOrderId,
        userId: decoded.sub,
        shopkeeperId,
        items: getOrderItems(),
        totalAmount: finalTotal,
        orderType: "pickup",
        pickupDate: date,
        pickupTime: time,
        paymentConfirmed: false,
        whatsAppNumber:
          userWhatsApp || shopInfo?.whatsappNumber || "kiosk-order",
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

      setQrOrderCreated(true);
      toast({
        title: i18nT("Order Placed"),
        description: `Order for ${fullName} created. Payment pending verification.`,
      });

      // Auto-close after a brief delay
      setTimeout(() => {
        resetAndClose();
      }, 2000);
    } catch (error: any) {
      toast({
        title: i18nT("Error"),
        description: error.message || "Failed to create order",
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
    setShowQRPayment(false);
    setQrOrderCreated(false);
    setQrOrderId("");
    setDynamicUpiString("");
    setDynamicPayNowUrl("");
    setUpiId("");
    onOrderPlaced();
  }

  // Hidden canvas for QR extraction
  const hiddenCanvas = <canvas ref={canvasRef} style={{ display: "none" }} />;

  return (
    <Dialog
      open={open}
      onOpenChange={(flag) => {
        if (!flag && !showQRPayment) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {hiddenCanvas}

        {/* === INLINE QR PAYMENT VIEW === */}
        {showQRPayment ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {qrOrderCreated ? "Order Placed!" : "Scan & Pay"}
              </DialogTitle>
              <DialogDescription>
                {qrOrderCreated
                  ? `Payment pending verification for ${fullName}`
                  : `${fullName} — ${formatPrice(finalTotal)}`}
              </DialogDescription>
            </DialogHeader>

            {qrOrderCreated ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
                <p className="text-lg font-semibold text-green-700">
                  {i18nT("Order Created Successfully")}
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  {i18nT("Payment will be verified by the shopkeeper. Closing...")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                {/* QR Code Display */}
                <div className="bg-card p-4 rounded-lg border-2 border-border">
                  {shopkeeperCountry === "SG" && dynamicPayNowUrl ? (
                    <img
                      src={dynamicPayNowUrl}
                      alt="PayNow QR"
                      className="w-64 h-64 object-contain"
                    />
                  ) : dynamicUpiString ? (
                    <QRCode value={dynamicUpiString} size={256} />
                  ) : shopInfo?.paymentURL ? (
                    <img
                      src={apiURL + shopInfo.paymentURL}
                      alt="Payment QR"
                      className="w-64 h-64 object-contain"
                    />
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center text-muted-foreground">
                      {i18nT("No payment QR configured")}
                    </div>
                  )}
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {formatPrice(finalTotal)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {shopkeeperCountry === "SG"
                      ? "Scan with PayNow"
                      : "Scan with any UPI app"}
                  </p>
                </div>

                <Separator className="w-full" />

                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 h-10"
                    onClick={() => setShowQRPayment(false)}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {i18nT("Back")}
                  </Button>
                  <Button
                    className="flex-1 h-10"
                    disabled={submitting}
                    onClick={handleQRPaymentConfirm}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Payment Done
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* === NORMAL CHECKOUT VIEW === */}
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
                  <span className="text-muted-foreground flex-1 min-w-0">
                    <span className="truncate block">
                      {item.productName}
                      {item.optionTitle ? ` · ${item.optionTitle}` : ""}
                      {item.subcategoryName && item.subcategoryName !== "Default"
                        ? ` · ${item.subcategoryName}`
                        : ""}
                      {item.variantTitle && item.variantTitle !== "Default"
                        ? ` · ${item.variantTitle}`
                        : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
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
              <div className="flex justify-between text-muted-foreground">
                <span>{i18nT("Subtotal")}</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({discountPercentage}%)</span>
                  <span>-{formatPrice(discount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax ({taxPercentage}%)</span>
                  <span>+{formatPrice(tax)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>{i18nT("Total")}</span>
                <span>{formatPrice(finalTotal)}</span>
              </div>
            </div>

            <Separator />

            {/* Customer Details — same as cartPage self/kiosk mode */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {i18nT("Customer Details")}
              </Label>

              {/* WhatsApp Number with Validate */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center justify-between mb-1">
                  <span>{i18nT("WhatsApp Number *")}</span>
                  {whatsappVerified && (
                    <Badge variant="default" className="text-[10px]">
                      {i18nT("Verified")}
                    </Badge>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <Select value={countryCode} onValueChange={setCountryCode}>
                    <SelectTrigger className="w-24 h-9 text-xs">
                      <SelectValue placeholder={i18nT("Code")} />
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
                    placeholder={i18nT("Enter number")}
                    maxLength={10}
                    className="h-9"
                    value={whatsapp}
                    onChange={(e) => {
                      setWhatsapp(e.target.value.replace(/\D/g, ""));
                      setWhatsappVerified(false);
                      setFirstName(
                        cart.customerName.startsWith("Walk-in")
                          ? ""
                          : cart.customerName.split(" ")[0] || "",
                      );
                      setLastName(
                        cart.customerName.startsWith("Walk-in")
                          ? ""
                          : cart.customerName.split(" ").slice(1).join(" ") ||
                              "",
                      );
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
                  <Label className="text-xs text-muted-foreground">{i18nT("First Name *")}</Label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={i18nT("John")}
                    className="h-9 mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{i18nT("Last Name *")}</Label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={i18nT("Doe")}
                    className="h-9 mt-1"
                  />
                </div>
              </div>

              {/* Customer Email */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Customer Email{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder={i18nT("customer@email.com")}
                  className="h-9 mt-1"
                />
              </div>
            </div>

            <Separator />

            {/* Instructions */}
            <div>
              <Label className="text-xs text-muted-foreground">
                {i18nT("Order Notes (optional)")}
              </Label>
              <Textarea
                placeholder={i18nT("Any special instructions...")}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="mt-1 h-16 text-sm"
              />
            </div>

            <Separator />

            {/* Payment Method */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">
                {i18nT("Payment Method")}
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  className="h-16 flex-col gap-1.5"
                  onClick={() => setPaymentMethod("cash")}
                >
                  <Banknote className="h-5 w-5" />
                  <span className="text-xs">{i18nT("Cash")}</span>
                </Button>
                <Button
                  variant={paymentMethod === "qr" ? "default" : "outline"}
                  className="h-16 flex-col gap-1.5"
                  onClick={() => setPaymentMethod("qr")}
                >
                  <QrCode className="h-5 w-5" />
                  <span className="text-xs">{i18nT("QR Payment")}</span>
                </Button>
              </div>
            </div>

            {/* Confirm Button */}
            {paymentMethod && (
              <Button
                className="w-full h-10"
                disabled={submitting || !shopInfo || !firstName || !whatsapp}
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
                  ? `Confirm Cash — ${formatPrice(finalTotal)}`
                  : `Pay ${formatPrice(finalTotal)} via QR`}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
