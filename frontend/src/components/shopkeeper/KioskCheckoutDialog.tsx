import { useState, useEffect } from "react";
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
  Clock,
  Copy,
  MessageCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KioskCart } from "@/hooks/useKioskCarts";
import { generateOrderId } from "@/lib/orderId";
import { jwtDecode } from "jwt-decode";
import { kioskPayments, type KioskPayment } from "@/lib/kioskPayments";
import { KioskPaymentQr } from "./KioskPaymentQr";
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
  // the QR payment is not confirmed yet: the cart is parked as "Payment pending"
  onPaymentPending: (payment: KioskPayment) => void;
}

export function KioskCheckoutDialog({
  open,
  onClose,
  cart,
  total,
  shopkeeperId,
  formatPrice,
  onOrderPlaced,
  onPaymentPending,
}: KioskCheckoutDialogProps) {
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "qr" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);

  // QR payment: the sale waits as "Payment pending" (with a payment link for the customer) until the payment is
  // confirmed here ("Payment received") or by the customer on the link ("I have paid"); only then is the order placed
  const [showQRPayment, setShowQRPayment] = useState(false);
  const [qrPayment, setQrPayment] = useState<KioskPayment | null>(null);
  const [qrOrderCreated, setQrOrderCreated] = useState(false);
  const [shopkeeperCountry, setShopkeeperCountry] = useState("");

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
        source: "kiosk",
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

  // QR payment: puts the sale on "Payment pending" with a payment link (backend kiosk-payments)
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
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Not authenticated");
      const decoded: any = jwtDecode(token);
      if (!shopInfo) throw new Error("Shop info not loaded");

      const { date, time } = getNow();
      const orderId = generateOrderId(shopInfo?.shopName);
      const payment = await kioskPayments.create(
        {
          orderId,
          userId: decoded.sub,
          shopkeeperId,
          items: getOrderItems(),
          totalAmount: finalTotal,
          orderType: "pickup",
          pickupDate: date,
          pickupTime: time,
          whatsAppNumber:
            userWhatsApp || shopInfo.whatsappNumber || "kiosk-order",
          source: "kiosk",
          fullName,
          firstName,
          lastName,
          instructions: instructions || undefined,
        },
        `kc-${orderId}`,
      );
      setQrPayment(payment);
      setShowQRPayment(true);
    } catch (error: any) {
      toast({
        title: i18nT("Error"),
        description: error.message || "Failed to start the QR payment",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // The staff saw the payment: the order is placed
  async function handleQRPaymentConfirm() {
    if (!qrPayment) return;
    setSubmitting(true);
    try {
      await kioskPayments.markPaid(qrPayment.id);
      setQrOrderCreated(true);
      toast({
        title: i18nT("Order Placed"),
        description: `Payment received from ${fullName}. The order is placed.`,
      });
      setTimeout(() => {
        resetAndClose();
      }, 1500);
    } catch (error: any) {
      toast({
        title: i18nT("Error"),
        description: error.message || "Failed to place the order",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Not paid yet: the cart is parked as "Payment pending" until the customer or the shop confirms the payment
  function handleWaitForPayment() {
    if (!qrPayment) return;
    toast({
      title: i18nT("Payment pending"),
      description: `${fullName}'s cart is parked. The order is placed once the payment is confirmed.`,
    });
    const payment = qrPayment;
    resetForm();
    onPaymentPending(payment);
  }

  function copyPayLink() {
    if (!qrPayment) return;
    navigator.clipboard?.writeText(qrPayment.payUrl);
    toast({ title: i18nT("Link copied"), duration: 2000 });
  }

  function resetForm() {
    setPaymentMethod(null);
    setInstructions("");
    setWhatsapp("");
    setWhatsappVerified(false);
    setFirstName("");
    setLastName("");
    setCustomerEmail("");
    setShowQRPayment(false);
    setQrOrderCreated(false);
    setQrPayment(null);
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
    setQrPayment(null);
    onOrderPlaced();
  }

  const payLinkMessage = qrPayment
    ? `${i18nT("Please pay for your order here:")} ${qrPayment.payUrl}`
    : "";
  const customerDigits = userWhatsApp.replace(/\D/g, "");

  return (
    <Dialog
      open={open}
      onOpenChange={(flag) => {
        if (!flag && !showQRPayment) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">

        {/* === QR PAYMENT: "Payment pending" until confirmed === */}
        {showQRPayment && qrPayment ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {qrOrderCreated ? i18nT("Order Placed!") : i18nT("Payment pending")}
              </DialogTitle>
              <DialogDescription>
                {qrOrderCreated
                  ? `Payment received from ${fullName}`
                  : `${fullName} — ${formatPrice(qrPayment.amount)}`}
              </DialogDescription>
            </DialogHeader>

            {qrOrderCreated ? (
              <div className="flex flex-col items-center py-8 gap-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
                <p className="text-lg font-semibold text-green-700">
                  {i18nT("Order Created Successfully")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                {/* Face to face: the customer scans this */}
                <div className="bg-white p-4 rounded-lg border-2 border-border">
                  <KioskPaymentQr
                    qr={qrPayment.qr}
                    amount={qrPayment.amount}
                    payee={shopInfo?.shopName || "Payment"}
                    reference={qrPayment.orderRef}
                  />
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold">
                    {formatPrice(qrPayment.amount)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {shopkeeperCountry === "SG"
                      ? "Scan with PayNow"
                      : "Scan with any UPI app"}
                  </p>
                </div>

                <Separator className="w-full" />

                {/* Not at the counter: send the payment link; they pay and press "I have paid" */}
                <div className="w-full space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {i18nT("Customer not here? Send them the payment link")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={qrPayment.payUrl}
                      className="text-xs"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button variant="outline" size="icon" onClick={copyPayLink} title={i18nT("Copy link")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {customerDigits && (
                    <a
                      href={`https://wa.me/${customerDigits}?text=${encodeURIComponent(payLinkMessage)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      <Button variant="outline" className="w-full h-10">
                        <MessageCircle className="h-4 w-4 mr-2" />
                        {i18nT("Send on WhatsApp")}
                      </Button>
                    </a>
                  )}
                </div>

                <Separator className="w-full" />

                <div className="flex gap-3 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 h-10"
                    onClick={handleWaitForPayment}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    {i18nT("Wait for payment")}
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
                    {i18nT("Payment received")}
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
