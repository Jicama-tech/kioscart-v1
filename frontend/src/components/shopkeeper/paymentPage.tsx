import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  ArrowLeft,
  CheckCircle,
  QrCode,
  ShoppingCart,
  Package,
  MapPin,
  Clock,
  Truck,
  Store,
  Receipt,
  Download,
  Scan,
  Loader,
  AlertCircle,
  MessageCircle,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import jsQR from "jsqr";
import jsPDF from "jspdf";
import { useCart } from "../../hooks/cartContext";
import QRCode from "react-qr-code";
import { useCurrency } from "@/hooks/useCurrencyhook";
import { Item } from "@radix-ui/react-select";
import { Separator } from "../ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRazorpayCheckout } from "@/hooks/useRazorpayCheckout";
import { CreditCard } from "lucide-react";

// Type definition for UPI Apps
interface UpiApp {
  name: string;
  upiDeepLink: string; // e.g., "com.phonepe.app", "net.one97.paytm"
  displayName: string;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-600">Loading Payment QR...</p>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { clearCart } = useCart();

  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [slug, setSlug] = useState("");
  const [isPaymentInitiated, setIsPaymentInitiated] = useState(false);
  const [qrDecodedData, setQrDecodedData] = useState<string | null>(null);
  const [installedUpiApps, setInstalledUpiApps] = useState<UpiApp[]>([]);
  const [showUpiAppSelector, setShowUpiAppSelector] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [dynamicUpiString, setDynamicUpiString] = useState("");
  const [dynamicUENString, setDynamicUENString] = useState("");
  const [country, setCountry] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [dynamicQR, setDynamicQR] = useState(false);
  const { formatPrice, getSymbol } = useCurrency(country);
  const [customer, setCustomer] = useState<any>();
  const [uenId, setUenId] = useState("");
  const [mobileId, setMobileId] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [transactionId, setTransactionId] = useState("");
  const [timeLeft, setTimeLeft] = useState(24 * 60 * 60); // 24 hours in seconds
  const [razorpayActive, setRazorpayActive] = useState(false);
  const { openCheckout, scriptReady } = useRazorpayCheckout();

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isMobile = isIOS || isAndroid;

  const handlePayClick = () => {
    if (!isMobile) {
      setShowQR(true);
      return;
    }

    const paymentUrl = dynamicUpiString || dynamicUENString || "";

    if (!paymentUrl) {
      console.error("No payment URL available");
      return;
    }

    if (isIOS) {
      window.location.assign(paymentUrl);
    } else {
      window.location.href = paymentUrl;
    }
  };

  const apiUrl = __API_URL__;

  // Ref to hold the canvas element
  const canvasRef = useRef(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dynamicUpiString && !dynamicUENString) return;

    setTimeLeft(24 * 60 * 60); // reset to 24 hrs when QR changes

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [dynamicUpiString, dynamicUENString]);

  function formatTime(seconds: number) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(
      2,
      "0",
    )}:${String(secs).padStart(2, "0")}`;
  }

  useEffect(() => {
    if (timeLeft === 0) {
      // Optional: short delay so user can see expiry message
      const timer = setTimeout(() => {
        navigate(-1); // go to previous page
      }, 2000); // 2 seconds

      return () => clearTimeout(timer);
    }
  }, [timeLeft, navigate]);

  useEffect(() => {
    if (!state?.userId || !state?.shopkeeperId) {
      toast({
        duration: 5000,
        title: "Invalid payment data",
        description: "Order information is missing.",
        variant: "destructive",
      });
      navigate(-1);
    }

    if (state?.userWhatsApp) {
      fetchUserDetails(state.userWhatsApp);
    }

    // Fetch shopkeeper details to get pickup address if this is a pickup order

    fetchShopkeeperDetails(state.shopkeeperId);
    fetchShopkeeperStoreDetails(state.shopkeeperId);
  }, [state, navigate, toast]);

  async function fetchUserDetails(userId: string) {
    try {
      const response = await fetch(
        `${apiUrl}/users/get-user-by-whatsAppNumber/${userId}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch shopkeeper details");
      }

      const data = await response.json();
    } catch (error) {
      console.error("Failed to fetch user details:", error);
    }
  }

  async function fetchShopkeeperDetails(shopkeeperId) {
    try {
      const response = await fetch(
        `${apiUrl}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch shopkeeper details");
      }
      const data = await response.json();
      if (data.data) {
        setPickupAddress(data.data.address);
        setDiscountPercentage(data?.data.discountPercentage || 0);
        setDynamicQR(data?.data?.dynamicQR);
        setMobileId(data?.data.phone);
        setCountry(data?.data.country);
        const rzp = data?.data?.razorpay;
        const shopCountry = (data?.data?.country || "").toUpperCase();
        // Direct mode: configured AND not toggled off. Route mode: existing
        // accountId + status check. Either path requires India for now.
        const directReady =
          rzp?.mode === "direct" &&
          !!rzp?.directKeyId &&
          rzp?.directEnabled !== false;
        const routeReady =
          rzp?.mode !== "direct" &&
          !!rzp?.accountId &&
          rzp?.status === "active";
        if ((directReady || routeReady) && shopCountry === "IN") {
          setRazorpayActive(true);
        }
      }
    } catch (error) {
      console.error("Error fetching shopkeeper details:", error);
    }
  }

  function normalizeSGMobile(mobile: string): string {
    const digits = mobile.replace(/\D/g, "");
    if (digits.startsWith("65")) return digits;
    return `65${digits}`;
  }

  function calculateCRC16(payload: string): number {
    let crc = 0xffff;

    for (let i = 0; i < payload.length; i += 2) {
      const byte = parseInt(payload.substr(i, 2), 16);
      crc ^= byte;

      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >>> 1) ^ 0xa001; // FIXED: IBM polynomial
        } else {
          crc = crc >>> 1;
        }
      }
    }
    return crc;
  }

  function generatePayNowMobileQR(): string {
    if (!mobileId || !state?.total) return "";

    const rawMobile = mobileId.trim().replace("+", ""); // Normalize: 6590037950
    if (!/^(65)?[6-9]\d{7}$/.test(rawMobile)) {
      throw new Error(`Invalid SG mobile: ${rawMobile}`);
    }

    const mobile = "65" + rawMobile.replace("65", ""); // Ensure 65 prefix
    const amountCents = Math.round(state.total * 100); // 15.02 → 1502
    const amountStr = amountCents.toString().padStart(10, "0"); // 0000001502

    // FIXED Field 26: Proper PayNow mobile proxy structure
    const merchantAccount =
      "0009SG.PAYNOW" + // Scheme
      "0101" + // Version
      "01" + // Mobile proxy type
      "0A" +
      mobile + // 0A=10 chars: 6590037950
      "0301"; // Dynamic amount flag

    const payload =
      "000201" + // Payload format
      "010212" + // Dynamic QR
      "26" + // PayNow proprietary
      merchantAccount.length.toString(16).toUpperCase().padStart(2, "0") +
      merchantAccount +
      "52040000" + // Category code
      "5303702" + // SGD currency
      "54" +
      amountStr.length.toString(16).toUpperCase().padStart(2, "0") +
      amountStr +
      "5802SG" + // Country
      "5900" + // No merchant name
      "6009Singapore" + // City
      "6304"; // CRC placeholder

    const crc = calculateCRC16(payload)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");

    return payload + crc;
  }

  useEffect(() => {
    if (dynamicUENString) {
      setShowQR(false); // reset if QR changes

      const timer = setTimeout(() => {
        setShowQR(true);
      }, 5000); // 5 seconds

      return () => clearTimeout(timer);
    }
  }, [dynamicUENString]);

  async function extractUpiFromImage() {
    if (!state?.paymentImageUrl || upiId) return;

    try {
      setLoading(true);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = state.paymentImageUrl;

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);

      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData?.data, imageData?.width, imageData?.height);

      if (code?.data?.startsWith("upi://pay")) {
        const params = new URLSearchParams(code.data.replace("upi://pay?", ""));
        const extractedUpi = params.get("pa");

        if (extractedUpi) {
          setUpiId(extractedUpi);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error("❌ QR decode failed:", error);
    }
  }

  async function extractUenFromImage() {
    if (!state?.paymentImageUrl || uenId) return;

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = state.paymentImageUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);

      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData?.data, imageData?.width!, imageData?.height!);

      if (code?.data) {
        const uen = extractUenFromPayNowQR(code.data);
        if (uen) {
          setUenId(uen);
        }
      }
    } catch (error) {
      console.error("❌ PayNow QR decode failed:", error);
    }
  }

  function extractUenFromPayNowQR(qrData: string): string | null {
    try {
      let pos = 0;
      let foundProxyType = false;

      while (pos + 4 < qrData.length) {
        const id = qrData.slice(pos, pos + 2);
        const lenHex = qrData.slice(pos + 2, pos + 4);
        const len = parseInt(lenHex, 16);

        const value = qrData.slice(pos + 4, pos + 4 + len);

        // Look for proxy type field (ID=01, value="01" for UEN proxy)
        if (id === "01" && value === "01") {
          foundProxyType = true;
          // Next field should be ID=02 (UEN value)
          const nextPos = pos + 4 + len;
          if (nextPos + 4 < qrData.length) {
            const uenId = qrData.slice(nextPos, nextPos + 2);
            const uenLenHex = qrData.slice(nextPos + 2, nextPos + 4);
            const uenLen = parseInt(uenLenHex, 16);
            const uen = qrData.slice(nextPos + 4, nextPos + 4 + uenLen);

            // Validate UEN format
            if (
              uenId === "02" &&
              uen.length >= 9 &&
              uen.length <= 10 &&
              /^[A-Z0-9]+$/.test(uen)
            ) {
              return uen;
            }
          }
        }

        pos += 4 + len;
      }
    } catch (e) {
      console.error("UEN parse error:", e);
    }
    return null;
  }

  function generateDynamicUpi(): string {
    if (!upiId || !state?.total) return "";

    return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(
      state.merchantName || "Payment",
    )}&am=${state.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
      `Order ${state.orderId}`,
    )}&tr=${state.orderId}`;
  }

  async function generateDynamicPayNowQR(): Promise<string> {
    if (!mobileId || !state?.total) return "";

    try {
      setLoading(true);
      const cleanedMobileId = mobileId.startsWith("+65")
        ? mobileId.substring(3)
        : mobileId;

      // Execution time
      const now = new Date();

      // Expiry = now + 90 hours
      const expiryTime = new Date(now.getTime() + 90 * 60 * 60 * 1000);

      // Format: YYYY/MM/DD HH:mm (sgqrcode requirement)
      const formattedExpiry =
        expiryTime.getFullYear() +
        "/" +
        String(expiryTime.getMonth() + 1).padStart(2, "0") +
        "/" +
        String(expiryTime.getDate()).padStart(2, "0") +
        " " +
        String(expiryTime.getHours()).padStart(2, "0") +
        ":" +
        String(expiryTime.getMinutes()).padStart(2, "0");

      const encodedExpiry = encodeURIComponent(formattedExpiry);

      const payNowString = `https://www.sgqrcode.com/paynow?mobile=${cleanedMobileId}&uen=&editable=0&amount=${state.total}&expiry=${encodedExpiry}&ref_id=&company=`;

      setLoading(false);
      return payNowString;
    } catch (error) {
      throw error;
    }
    // Remove +65
  }

  useEffect(() => {
    const loadPaymentData = async () => {
      if (state?.paymentImageUrl && !upiId && country === "IN") {
        extractUpiFromImage();
      }
      if (country === "SG" && mobileId && state?.total) {
        const qr = await generateDynamicPayNowQR();
        setDynamicUENString(qr);
      }
    };
    loadPaymentData();
  }, [
    state?.paymentImageUrl,
    upiId,
    country,
    mobileId,
    state?.total,
    dynamicUENString,
  ]);

  useEffect(() => {
    const loadDynamicData = async () => {
      if (upiId && state?.total && country === "IN") {
        const upiStr = generateDynamicUpi();
        setDynamicUpiString(upiStr);
      }
      if (uenId && state?.total && country === "SG") {
        const upiStr = await generateDynamicPayNowQR();
        // const upiStr = `https://www.sgqrcode.com/paynow?mobile=90037950&uen=&editable=0&amount=10&expiry=2026%2F01%2F24%2001%3A00&ref_id=&company=`;
        setDynamicUENString(upiStr);
      }
    };
    loadDynamicData();
  }, [upiId, state?.total, uenId, country]);

  const generateWhatsAppMessage = () => {
    const itemsList = state.cartItems
      ?.map(
        (item) =>
          `• ${item.productName}${[item.optionTitle, item.subcategoryName, item.variantTitle].filter((v) => v && v !== "Default").join(" · ") ? ` (${[item.optionTitle, item.subcategoryName, item.variantTitle].filter((v) => v && v !== "Default").join(" · ")})` : ""} x${item.quantity} - ${formatPrice(
            item.price * item.quantity,
          )}`,
      )
      .join("\n");

    const deliveryInfo =
      state.orderType === "delivery" && state.deliveryAddress
        ? `\n📍 Delivery Address:\n${state.deliveryAddress.street}, ${
            state.deliveryAddress.city
          }, ${state.deliveryAddress.state} - ${state.deliveryAddress.zipCode}${
            state.deliveryAddress.instructions
              ? `\nInstructions: ${state.deliveryAddress.instructions}`
              : ""
          }`
        : state.orderType === "pickup"
          ? `\n🏪 Pickup Details:\nDate: ${state.pickupDate}\nTime: ${state.pickupTime}\nAddress: ${pickupAddress}`
          : "";

    const message = `Hi, I want to purchase from your shop:\n\n${itemsList}\n\nTotal Amount: ₹${state.total.toFixed(
      2,
    )}\n\n${deliveryInfo}
    \n\nPlease confirm this order.`;

    return encodeURIComponent(message);
  };

  // ✅ Helper: Get WhatsApp link
  const getWhatsAppLink = () => {
    const shopPhone = state.whatsAppNumber?.replace(/\D/g, ""); // Remove non-digits
    return `https://wa.me/${shopPhone}?text=${generateWhatsAppMessage()}`;
  };

  async function fetchShopkeeperStoreDetails(shopkeeperId) {
    try {
      const response = await fetch(
        `${apiUrl}/shopkeeper-stores/shopkeeper-store-detail/${shopkeeperId}`,
        { method: "GET" },
      );
      if (!response.ok) throw new Error("Failed to fetch store details");
      const storeData = await response.json();
      const data = storeData.data;

      await setSlug(data.slug);
    } catch (error) {
      throw error;
    }
  }

  async function backToStore() {
    navigate(`/${slug}`);
  }

  function getWhatsappLink() {
    if (!state?.whatsAppNumber) return "#";

    const itemsList = state.cartItems
      ?.map(
        (item) =>
          `• ${item.productName}${[item.optionTitle, item.subcategoryName, item.variantTitle].filter((v) => v && v !== "Default").join(" · ") ? ` (${[item.optionTitle, item.subcategoryName, item.variantTitle].filter((v) => v && v !== "Default").join(" · ")})` : ""} x${item.quantity} - ${formatPrice(
            item.price * item.quantity,
          )}`,
      )
      .join("\n");

    const deliveryInfo =
      state.orderType === "delivery" && state.deliveryAddress
        ? `\n📍 Delivery Address:\n${state.deliveryAddress.street}, ${
            state.deliveryAddress.city
          }, ${state.deliveryAddress.state} - ${state.deliveryAddress.zipCode}${
            state.deliveryAddress.instructions
              ? `\nInstructions: ${state.deliveryAddress.instructions}`
              : ""
          }`
        : state.orderType === "pickup"
          ? `\n🏪 Pickup Details:\nDate: ${state.pickupDate}\nTime: ${state.pickupTime}\nAddress: ${pickupAddress}`
          : "";

    const text = encodeURIComponent(
      `Hello,
I have placed an order (${state.orderId}) with the following items:
${itemsList}
${deliveryInfo}
Total amount paid: $${state.total?.toFixed(2)}.
Please confirm and process the order at your earliest convenience.
Thank you!`,
    );

    const phone = state.whatsAppNumber.replace(/\D/g, "");
    return `https://wa.me/${phone}?text=${text}`;
  }

  async function handleRazorpayPay(
    methodPreference?: "card" | "upi" | "netbanking" | "wallet",
  ) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const sanitizedItems = (state.cartItems || []).map((it: any) => ({
        productId: it.productId,
        productName: it.productName,
        price: it.price,
        quantity: it.quantity,
        variantTitle: it.variantTitle,
        subcategoryName: it.subcategoryName,
        image: it.image,
        trackQuantity: !!it.trackQuantity,
        optionTitle: it.optionTitle,
        optionPrice: it.optionPrice,
      }));
      const orderData = {
        orderId: state.orderId,
        userId: state.userId,
        shopkeeperId: state.shopkeeperId,
        items: sanitizedItems,
        totalAmount: state.total || 0,
        orderType: state.orderType,
        instructions: state.instructions,
        deliveryAddress: state.deliveryAddress,
        pickupDate: state.pickupDate,
        pickupTime: state.pickupTime,
        paymentConfirmed: false,
        whatsAppNumber: state.userWhatsApp,
        fullName: state.fullName,
        couponCode: state.appliedCoupon?._id,
      };
      const res = await fetch(`${apiUrl}/orders/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.message || "Failed to create order");
      }
      const created = await res.json();
      const mongoOrderId = created?._id || created?.id || created?.data?._id;
      if (!mongoOrderId) throw new Error("Server did not return order id");

      await openCheckout({
        orderId: mongoOrderId,
        shopkeeperId: state.shopkeeperId,
        amount: state.total,
        shopName: state.merchantName,
        customerName: state.fullName,
        customerPhone: state.userWhatsApp,
        ...(methodPreference ? { methods: [methodPreference] } : {}),
        onSuccess: (paymentId) => {
          setTransactionId(paymentId);
          setPaymentSubmitted(true);
          clearCart(state.shopkeeperId);
          toast({
            duration: 6000,
            title: "Payment successful",
            description: `Razorpay payment ${paymentId} captured.`,
          });
          setIsSubmitting(false);
        },
        onFailure: (err) => {
          setIsSubmitting(false);
          toast({
            duration: 5000,
            title: "Payment failed",
            description: err?.message || "Please try again",
            variant: "destructive",
          });
        },
        onDismiss: () => setIsSubmitting(false),
      });
    } catch (err: any) {
      setIsSubmitting(false);
      toast({
        duration: 5000,
        title: "Error",
        description: err.message || "Could not start Razorpay payment",
        variant: "destructive",
      });
    }
  }

  async function handlePaymentCompletion() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const orderData = {
        orderId: state.orderId,
        userId: state.userId,
        shopkeeperId: state.shopkeeperId,
        items: state.cartItems || [],
        totalAmount: state.total || 0,
        orderType: state.orderType,
        instructions: state.instructions,
        deliveryAddress: state.deliveryAddress,
        pickupDate: state.pickupDate,
        pickupTime: state.pickupTime,
        paymentConfirmed: false,
        whatsAppNumber: state.userWhatsApp,
        fullName: state.fullName,
        couponCode: state.appliedCoupon?._id,
        transactionId: transactionId || undefined,
      };

      const res = await fetch(`${apiUrl}/orders/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create order");
      }

      setPaymentSubmitted(true);
      clearCart(state.shopkeeperId); // Use clearCart from context
      toast({
        duration: 5000,
        title: "Payment submitted",
        description:
          "Orders are processed and receipts will be issued after payment verification",
      });
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Error submitting payment",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Preliminary on-screen order quote → PDF. The final receipt is still
  // generated by the vendor after payment verification; this is just what the
  // customer can keep / forward in the meantime.
  function handleDownloadReceipt() {
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const left = 15;
      const right = pageW - 15;
      let y = 18;

      const writePair = (label: string, amount: string, bold = false) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.text(label, left, y);
        doc.text(amount, right, y, { align: "right" });
        y += 6;
      };

      // Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("Order Quote", pageW / 2, y, { align: "center" });
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        "Preliminary summary — your official receipt will be issued by",
        pageW / 2,
        y,
        { align: "center" },
      );
      y += 4;
      doc.text(
        "the vendor once payment is verified.",
        pageW / 2,
        y,
        { align: "center" },
      );
      y += 9;
      doc.setTextColor(0);

      // Order metadata
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`Order #${state.orderId}`, left, y);
      doc.setFont("helvetica", "normal");
      doc.text(new Date().toLocaleString(), right, y, { align: "right" });
      y += 8;

      // Two-column: Customer + Merchant
      doc.setFont("helvetica", "bold");
      doc.text("Customer", left, y);
      doc.text("Merchant", pageW / 2, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.text(String(state.fullName || ""), left, y);
      doc.text(String(state.merchantName || ""), pageW / 2, y);
      y += 5;
      doc.text(String(state.userWhatsApp || ""), left, y);
      if (state.whatsAppNumber)
        doc.text(String(state.whatsAppNumber), pageW / 2, y);
      y += 9;

      // Fulfilment
      doc.setFont("helvetica", "bold");
      doc.text(
        state.orderType === "delivery" ? "Delivery" : "Pickup",
        left,
        y,
      );
      y += 5;
      doc.setFont("helvetica", "normal");
      if (state.orderType === "delivery" && state.deliveryAddress) {
        const a = state.deliveryAddress;
        const addr = [a.street, a.city, a.state, a.zipCode]
          .filter(Boolean)
          .join(", ");
        const split = doc.splitTextToSize(addr, pageW - 30);
        doc.text(split, left, y);
        y += split.length * 5;
      } else {
        if (state.pickupDate) {
          doc.text(`Date: ${state.pickupDate}`, left, y);
          y += 5;
        }
        if (state.pickupTime) {
          doc.text(`Time: ${state.pickupTime}`, left, y);
          y += 5;
        }
        if (pickupAddress) {
          const split = doc.splitTextToSize(
            `Address: ${pickupAddress}`,
            pageW - 30,
          );
          doc.text(split, left, y);
          y += split.length * 5;
        }
      }
      if (state.instructions) {
        const split = doc.splitTextToSize(
          `Notes: ${state.instructions}`,
          pageW - 30,
        );
        doc.text(split, left, y);
        y += split.length * 5;
      }
      y += 4;

      // Items
      doc.setDrawColor(210);
      doc.line(left, y, right, y);
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.text("Items", left, y);
      doc.text("Amount", right, y, { align: "right" });
      y += 5;
      doc.setDrawColor(230);
      doc.line(left, y, right, y);
      y += 5;

      (state.cartItems || []).forEach((it: any) => {
        if (y > pageH - 40) {
          doc.addPage();
          y = 20;
        }
        const extras = [it.optionTitle, it.subcategoryName, it.variantTitle]
          .filter((v: string) => v && v !== "Default")
          .join(" · ");
        const namePart = `${it.productName}${extras ? ` (${extras})` : ""} ×${it.quantity}`;
        const lines = doc.splitTextToSize(namePart, pageW - 65);
        doc.setFont("helvetica", "normal");
        doc.text(lines, left, y);
        doc.text(formatPrice(it.price * it.quantity), right, y, {
          align: "right",
        });
        y += Math.max(lines.length * 5, 6);
      });

      y += 2;
      doc.setDrawColor(210);
      doc.line(left, y, right, y);
      y += 6;

      // Totals
      writePair("Subtotal", formatPrice(state.subtotal));
      writePair("Delivery Fee", formatPrice(state.deliveryFee));
      writePair(`Tax ${state.taxPercentage}%`, formatPrice(state.tax));
      writePair(
        `Discount ${state.discountPercentage}%`,
        `-${formatPrice(state.discount)}`,
      );
      if (state.appliedCoupon) {
        writePair(
          `Coupon (${state.appliedCoupon.code})`,
          `-${formatPrice(state.couponDiscount)}`,
        );
      }
      y += 1;
      doc.setDrawColor(120);
      doc.line(left, y, right, y);
      y += 6;
      doc.setFontSize(13);
      writePair("Total", formatPrice(state.total), true);

      // Footer disclaimer
      y += 6;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(120);
      const disclaimer = doc.splitTextToSize(
        "This is a customer-side quote generated at the time of order placement. The vendor will issue and share the official receipt as a PDF once payment is verified.",
        pageW - 30,
      );
      doc.text(disclaimer, left, y);

      doc.save(`order-${state.orderId}.pdf`);
    } catch (err) {
      toast({
        duration: 5000,
        title: "Could not generate PDF",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  async function handleDownload() {
    const filename = `payment-qr-${state?.merchantName || "order"}.png`;

    // Download whatever QR is currently on screen — SVG (react-qr-code for
    // dynamic IN) or <img> (static / SG dynamic). Rasterise through a canvas
    // so the result is always a PNG.
    const triggerBlobDownload = (blob: Blob) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    };

    const rasteriseToPng = (source: HTMLImageElement, size: number) =>
      new Promise<Blob>((resolve, reject) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas unavailable"));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(source, 0, 0, size, size);
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
          "image/png",
        );
      });

    try {
      const container = qrContainerRef.current;

      // 1) SVG QR (dynamic IN, rendered by react-qr-code)
      const svg = container?.querySelector("svg");
      if (svg) {
        const xml = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
        const svgUrl = URL.createObjectURL(svgBlob);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("svg load failed"));
          img.src = svgUrl;
        });
        const pngBlob = await rasteriseToPng(img, 560);
        URL.revokeObjectURL(svgUrl);
        triggerBlobDownload(pngBlob);
        return;
      }

      // 2) <img> QR (static or SG dynamic). Prefer fetching bytes so the
      // download is a real PNG rather than a redirect/html page.
      const imgEl = container?.querySelector("img") as HTMLImageElement | null;
      const src = imgEl?.src || state?.paymentImageUrl;
      if (!src) {
        toast({
          duration: 5000,
          title: "No QR code available",
          variant: "destructive",
        });
        return;
      }

      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`status ${response.status}`);
        triggerBlobDownload(await response.blob());
      } catch {
        // Cross-origin sources (e.g. sgqrcode.com) may block fetch; fall back
        // to canvas rasterisation via an anonymous <img>.
        const anon = new Image();
        anon.crossOrigin = "anonymous";
        await new Promise<void>((resolve, reject) => {
          anon.onload = () => resolve();
          anon.onerror = () => reject(new Error("img load failed"));
          anon.src = src;
        });
        const pngBlob = await rasteriseToPng(
          anon,
          anon.naturalWidth || 560,
        );
        triggerBlobDownload(pngBlob);
      }
    } catch (error) {
      toast({
        duration: 5000,
        title: "Download failed",
        description: "Could not download the QR image. Please try again.",
        variant: "destructive",
      });
    }
  }

  async function handlePayNow() {
    if (isDecoding || !state?.paymentImageUrl) return;
    setIsDecoding(true);

    try {
      // Step 1: Fetch the image
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = state.paymentImageUrl;
      await img.decode();

      // Step 2: Draw the image onto a hidden canvas
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas element not found");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // Step 3: Get image data and decode the QR code
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code && code.data) {
        // Step 4: Check the decoded data format and open the appropriate app
        const decodedData = code.data;
        if (decodedData.startsWith("upi://")) {
          // It's a UPI deep link, open it directly
          window.location.href = decodedData;
        } else if (
          decodedData.startsWith("http://") ||
          decodedData.startsWith("https://")
        ) {
          // It's a standard URL, open it directly
          window.location.href = decodedData;
        } else {
          // Could be a PayNow QR data or other non-URL format.
          // In a real-world scenario, you would parse this data and
          // use a custom function to handle it. For now, we'll
          // log it and inform the user.
          toast({
            duration: 5000,
            title: "QR Code Format Not Supported",
            description:
              "The QR code does not contain a recognized URL. Please scan it manually.",
            variant: "destructive",
          });
        }
      } else {
        throw new Error("Could not decode QR code from image.");
      }
    } catch (error) {
      toast({
        duration: 5000,
        title: "Payment App Failed",
        description:
          "Could not open the payment app. Please scan the QR code manually or try to download it.",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setIsDecoding(false);
    }
  }

  if (!state?.orderId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-xl text-gray-600">Loading payment information...</p>
      </div>
    );
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (paymentSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Success headline */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              Order placed — thanks!
            </h1>
            <p className="text-sm text-slate-600">
              The shop has been notified. Below is your temporary order quote.
            </p>
          </div>

          {/* Receipt */}
          <div className="rounded-xl border-2 border-dashed border-green-300 bg-white overflow-hidden shadow-sm">
            <div className="bg-green-50 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-green-700 font-semibold">
                  Customer Quote
                </p>
                <p className="text-sm font-bold text-slate-800">
                  Order #{state.orderId}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500">Total</p>
                <p className="text-base font-bold text-green-700">
                  {formatPrice(state.total)}
                </p>
              </div>
            </div>

            <div className="px-4 py-3 space-y-3 text-sm text-slate-700">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                  {state.orderType === "delivery" ? "Delivery" : "Pickup"}
                </p>
                {state.orderType === "delivery" && state.deliveryAddress ? (
                  <p className="leading-relaxed">
                    {[
                      state.deliveryAddress.street,
                      state.deliveryAddress.city,
                      state.deliveryAddress.state,
                      state.deliveryAddress.zipCode,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : (
                  <p className="leading-relaxed">
                    {state.pickupDate}
                    {state.pickupTime ? ` · ${state.pickupTime}` : ""}
                    {pickupAddress ? (
                      <span className="block text-slate-500 text-xs">
                        {pickupAddress}
                      </span>
                    ) : null}
                  </p>
                )}
                {state.instructions && (
                  <p className="text-xs text-slate-500 mt-1">
                    Note: {state.instructions}
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                  Items
                </p>
                <ul className="space-y-1">
                  {(state.cartItems || []).map((it: any, idx: number) => {
                    const extras = [
                      it.optionTitle,
                      it.subcategoryName,
                      it.variantTitle,
                    ]
                      .filter((v: string) => v && v !== "Default")
                      .join(" · ");
                    return (
                      <li key={idx} className="flex justify-between gap-3">
                        <span className="flex-1">
                          {it.productName}
                          {extras ? (
                            <span className="text-xs text-slate-500">
                              {" "}
                              ({extras})
                            </span>
                          ) : null}
                          <span className="text-slate-500">
                            {" "}
                            ×{it.quantity}
                          </span>
                        </span>
                        <span className="whitespace-nowrap">
                          {formatPrice(it.price * it.quantity)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="border-t pt-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatPrice(state.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery</span>
                  <span>{formatPrice(state.deliveryFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax {state.taxPercentage}%</span>
                  <span>{formatPrice(state.tax)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Discount {state.discountPercentage}%</span>
                  <span>-{formatPrice(state.discount)}</span>
                </div>
                {state.appliedCoupon && (
                  <div className="flex justify-between">
                    <span>Coupon ({state.appliedCoupon.code})</span>
                    <span>-{formatPrice(state.couponDiscount)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border-t px-4 py-2.5 text-[11px] text-slate-600 leading-snug">
              Keep this as a temporary quote. The vendor will generate and share
              the official receipt PDF on their side once payment is verified.
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              onClick={handleDownloadReceipt}
              variant="outline"
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            {state.whatsAppNumber && (
              <a
                href={getWhatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-10 inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
              >
                <FaWhatsapp size={18} />
                Send to Shopkeeper
              </a>
            )}
            <Button
              onClick={backToStore}
              className="w-full bg-primary text-white"
            >
              Back to Store
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Button
            variant="buttonOutline"
            onClick={() => navigate(-1)}
            size="icon"
            aria-label="Back to cart"
          >
            <ShoppingCart className="w-5 h-5" />
          </Button>
        </div>
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Payment Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Order Items ({state.itemCount})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {state.cartItems?.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-4 p-3 border rounded-lg"
                    >
                      {item.image && (
                        <img
                          src={apiUrl + item.image}
                          alt={item.productName}
                          className="w-16 h-16 object-cover rounded-md"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1">
                        <h4 className="font-semibold">{item.productName}</h4>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {item.optionTitle && (
                            <Badge
                              variant="buttonOutline"
                              className="text-xs bg-purple-50"
                            >
                              {item.optionTitle}
                            </Badge>
                          )}
                          {item.subcategoryName && (
                            <Badge variant="buttonOutline" className="text-xs">
                              {item.subcategoryName}
                            </Badge>
                          )}
                          {item.variantTitle && (
                            <Badge variant="buttonOutline" className="text-xs">
                              {item.variantTitle}
                            </Badge>
                          )}
                        </div>
                        {!item.isDiscounted && (
                          <p className="text-sm text-gray-600 mt-1">
                            {formatPrice(item.price)} × {item.quantity}
                          </p>
                        )}
                        {item.isDiscounted && (
                          <div>
                            <span className="text-xs text-gray-400 line-through">
                              {formatPrice(item.price)}
                            </span>{" "}
                            <span className="text-green-600">
                              {formatPrice(item.discountedPrice)} ×{" "}
                              {item.quantity}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {!item.isDiscounted && (
                          <p className="font-bold">
                            {formatPrice(item.price * item.quantity)}
                          </p>
                        )}

                        {item.isDiscounted && (
                          <p className="font-bold">
                            {formatPrice(item.discountedPrice * item.quantity)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            {/* ✅ PAYMENT SECTION - WITH GST VERIFICATION CHECK */}
            {state.total > 1000 && !state.hasDocVerification ? (
              <Card className="mt-6 border-slate-200 bg-slate-50">
                {/* STATUS BAR */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-2 px-6 py-3 bg-slate-100 border-b border-slate-200 rounded-t-lg">
                  <div className="text-xs md:text-sm text-slate-700">
                    <span className="font-semibold">Payment pending.</span>{" "}
                    Complete the payment and then select{" "}
                    <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded">
                      "I Have Completed Payment"
                    </span>{" "}
                    so the shop can confirm your order.
                  </div>
                  {/* <div className="text-xs md:text-sm text-slate-800">
                    Amount:{" "}
                    <span className="font-semibold">
                      {formatPrice(state.total)}
                    </span>
                  </div> */}
                </div>

                <CardContent className="space-y-4 pt-4">
                  {/* TITLE + BADGE */}
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                    <div>
                      <p className="text-sm md:text-base font-semibold text-slate-900">
                        Manual payment required for this order
                      </p>
                      <p className="text-xs md:text-sm text-slate-700 mt-1">
                        The shop’s business verification is still in progress,
                        so this high‑value payment is handled through a simple
                        manual confirmation flow.
                      </p>
                    </div>
                    <Badge className="bg-slate-100 text-slate-800 border-slate-300 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      Verification in review
                    </Badge>
                  </div>

                  {/* STEPS */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      How to complete the payment
                    </p>
                    <ol className="mt-2 text-xs sm:text-sm text-slate-700 space-y-1.5 list-decimal list-inside">
                      <li>
                        Agree with the shop on the exact amount and payment
                        method.
                      </li>
                      <li>
                        Pay using UPI, bank transfer, or card as shared by the
                        shop.
                      </li>
                      <li>
                        Once you have paid, come back to this page and click{" "}
                        <span className="font-mono bg-slate-200 px-1.5 py-0.5 rounded">
                          "I Have Completed Payment"
                        </span>{" "}
                        to submit your confirmation.
                      </li>
                    </ol>
                  </div>

                  {/* INFO NOTE */}
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3">
                    <p className="text-xs text-slate-700">
                      After the shop finishes business verification, high‑value
                      orders like this can also be paid using automatic QR‑based
                      payments. Until then, this manual confirmation step helps
                      keep both buyer and seller safe.
                    </p>
                  </div>

                  {/* WHATSAPP CONNECT (UNCHANGED) */}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">
                      Contact the shop for payment confirmation
                    </p>
                    <a
                      href={getWhatsAppLink()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 shadow-sm"
                    >
                      <MessageCircle className="w-5 h-5" />
                      Send order details via WhatsApp
                    </a>
                    <p className="text-xs text-slate-600">
                      The order amount and details will be auto‑filled in
                      WhatsApp. After the shop confirms the payment, click{" "}
                      <span className="font-mono bg-slate-200 px-1 rounded">
                        "I Have Completed Payment"
                      </span>{" "}
                      here to continue.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* ✅ GST VERIFIED OR AMOUNT ≤ 1000 - SHOW QR CODE */
              <Card className="mt-6">
                <CardHeader className="text-center">
                  <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                    <QrCode className="w-6 h-6 text-blue-600" />
                    Complete Your Payment
                  </CardTitle>
                  <div className="text-4xl font-bold text-green-600 mt-4">
                    {formatPrice(state.total)}
                  </div>
                </CardHeader>
                <CardContent className="text-center space-y-6">
                  {razorpayActive && country === "IN" && (
                    <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-200 bg-white text-left">
                      {/* Branded header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-4 text-white">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-wide opacity-80">
                              Secure Checkout
                            </p>
                            <p className="font-semibold text-lg">
                              {state.merchantName || "KiosCart"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs opacity-80">Amount to pay</p>
                            <p className="text-2xl font-bold">
                              {formatPrice(state.total)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Customer info preview */}
                      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {state.fullName || "Customer"}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span>{state.userWhatsApp}</span>
                        </div>
                      </div>

                      {/* Method tiles */}
                      <div className="p-5 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Choose payment method
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => handleRazorpayPay("card")}
                            disabled={isSubmitting || !scriptReady}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CreditCard className="h-6 w-6 text-indigo-600" />
                            <span className="text-sm font-semibold text-slate-800">
                              Cards
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Visa · Mastercard · RuPay
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRazorpayPay("upi")}
                            disabled={isSubmitting || !scriptReady}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Scan className="h-6 w-6 text-indigo-600" />
                            <span className="text-sm font-semibold text-slate-800">
                              UPI
                            </span>
                            <span className="text-[10px] text-slate-500">
                              GPay · PhonePe · Paytm
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRazorpayPay("netbanking")}
                            disabled={isSubmitting || !scriptReady}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Store className="h-6 w-6 text-indigo-600" />
                            <span className="text-sm font-semibold text-slate-800">
                              Netbanking
                            </span>
                            <span className="text-[10px] text-slate-500">
                              All major banks
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRazorpayPay("wallet")}
                            disabled={isSubmitting || !scriptReady}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ShoppingCart className="h-6 w-6 text-indigo-600" />
                            <span className="text-sm font-semibold text-slate-800">
                              Wallets
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Mobikwik · Freecharge
                            </span>
                          </button>
                        </div>

                        <Button
                          className="w-full py-6 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 mt-2"
                          onClick={() => handleRazorpayPay()}
                          disabled={isSubmitting || !scriptReady}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader className="mr-2 h-5 w-5 animate-spin" />
                              Opening secure checkout…
                            </>
                          ) : (
                            <>
                              Pay {formatPrice(state.total)}
                              <ArrowLeft className="ml-2 h-4 w-4 rotate-180" />
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Trust footer */}
                      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          256-bit SSL · PCI-DSS compliant
                        </span>
                        <span className="font-semibold text-slate-700">
                          Powered by Razorpay
                        </span>
                      </div>
                    </div>
                  )}

                  {razorpayActive && country === "IN" && (
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span>Or scan QR to pay manually</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  )}
                  <div ref={qrContainerRef} className="space-y-6">
                  {/* Dynamic QR Code */}
                  {dynamicQR && country === "IN" && (
                    <div>
                      {dynamicUpiString ? (
                        <div className="flex flex-col items-center gap-4 p-4 sm:p-6 bg-white rounded-xl shadow-lg border-2 border-blue-200">
                          <div className="w-full max-w-[280px] aspect-square">
                            <QRCode
                              value={dynamicUpiString}
                              fgColor="#000000ff"
                              bgColor="#ffffff"
                              style={{
                                height: "100%",
                                width: "100%",
                                maxWidth: "100%",
                              }}
                            />
                          </div>

                          <Button
                            className="w-full py-6 text-lg font-semibold"
                            onClick={handlePayClick}
                          >
                            Click to Pay
                          </Button>
                          <div className="text-center space-y-2">
                            <p className="font-bold text-lg text-green-700">
                              📱 Scan with any Payment App
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center animate-pulse">
                          <div className="w-full max-w-[288px] aspect-square bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <QrCode className="w-12 h-12 mx-auto mb-2" />
                              <p>Generating Payment QR...</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}{" "}
                  {!dynamicQR && country === "IN" && (
                    <div>
                      {!dynamicQR && state?.paymentImageUrl ? (
                        <img
                          src={state.paymentImageUrl}
                          alt="Payment QR Code"
                          className="mx-auto w-full max-w-[288px] aspect-square object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex justify-center animate-pulse">
                          <div className="w-full max-w-[288px] aspect-square bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <QrCode className="w-12 h-12 mx-auto mb-2" />
                              <p>Loading Payment QR...</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {dynamicQR && country === "SG" && (
                    <div>
                      {dynamicUENString ? (
                        <div className="flex flex-col items-center gap-4 p-4 sm:p-6 bg-white rounded-xl shadow-lg border-2 border-blue-200">
                          <img
                            src={dynamicUENString}
                            alt="PayNow QR"
                            className="w-full max-w-[280px] aspect-square rounded-xl shadow-lg"
                            loading="lazy"
                          />

                          <div className="text-center space-y-2">
                            <p className="font-bold text-lg text-green-700">
                              📱 Scan with any Payment App
                            </p>
                            {mobileId && !uenId && (
                              <div>
                                <p className="font-semibold text-lg text-green-700">
                                  If the QR code fails, Pay Directly to Mobile
                                  Number:
                                  {mobileId}.
                                </p>

                                <p className="text-sm text-gray-600">
                                  WhatsAppNumber:{" "}
                                  <span className="font-medium">
                                    {state?.whatsAppNumber}
                                  </span>
                                </p>
                              </div>
                            )}
                            {uenId && mobileId === null && (
                              <div>
                                <p className="font-semibold text-lg text-green-700">
                                  If the QR code fails, Pay Directly to UEN:{" "}
                                  {uenId}.
                                </p>

                                <p className="text-sm text-gray-600">
                                  WhatsAppNumber:{" "}
                                  <span className="font-medium">
                                    {state?.whatsAppNumber}
                                  </span>
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center animate-pulse">
                          <div className="w-full max-w-[288px] aspect-square bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <QrCode className="w-12 h-12 mx-auto mb-2" />
                              <p>Generating Payment QR...</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {!dynamicQR && country === "SG" && (
                    <div>
                      {!dynamicQR && state?.paymentImageUrl ? (
                        <img
                          src={state.paymentImageUrl}
                          alt="Payment QR Code"
                          className="mx-auto w-full max-w-[288px] aspect-square object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex justify-center animate-pulse">
                          <div className="w-full max-w-[288px] aspect-square bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <QrCode className="w-12 h-12 mx-auto mb-2" />
                              <p>Loading Payment QR...</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                  {/* Shop Details */}
                  {/* Payment Instructions */}
                  {timeLeft > 0 && (
                    <div className="flex items-center justify-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                      <Clock className="w-4 h-4 text-yellow-700" />
                      <p className="text-sm font-semibold text-yellow-800">
                        QR expires in {formatTime(timeLeft)}
                      </p>
                    </div>
                  )}
                  {timeLeft === 0 && (
                    <div className="flex items-center justify-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                      <AlertCircle className="w-4 h-4 text-red-700" />
                      <p className="text-sm font-semibold text-red-800">
                        QR has expired. Please refresh to generate a new one.
                      </p>
                    </div>
                  )}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3 text-left">
                    <p className="text-sm font-bold text-green-800">
                      ✅ After Payment
                    </p>
                    <p className="text-xs text-green-700">
                      Once your payment is successful, tap Place Order to
                      complete your order.
                    </p>
                    {!paymentSubmitted && (
                      <Button
                        onClick={handlePaymentCompletion}
                        className="w-full h-14 text-base font-semibold bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-500/40 ring-2 ring-green-300 animate-pulse transition-all"
                        size="lg"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Submitting..." : "Place Order"}
                      </Button>
                    )}
                  </div>
                  {paymentSubmitted && (
                    <div className="text-left space-y-4">
                      {/* Success headline */}
                      <div className="flex items-center gap-2 text-green-700 font-semibold">
                        <CheckCircle className="w-6 h-6 shrink-0" />
                        <span>Order placed — thanks!</span>
                      </div>

                      {/* Order Quote */}
                      <div className="rounded-xl border-2 border-dashed border-green-300 bg-white overflow-hidden">
                        <div className="bg-green-50 px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-green-700 font-semibold">
                              Customer Quote
                            </p>
                            <p className="text-sm font-bold text-slate-800">
                              Order #{state.orderId}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] text-slate-500">Total</p>
                            <p className="text-base font-bold text-green-700">
                              {formatPrice(state.total)}
                            </p>
                          </div>
                        </div>

                        <div className="px-4 py-3 space-y-3 text-sm text-slate-700">
                          {/* Fulfilment */}
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                              {state.orderType === "delivery"
                                ? "Delivery"
                                : "Pickup"}
                            </p>
                            {state.orderType === "delivery" &&
                            state.deliveryAddress ? (
                              <p className="leading-relaxed">
                                {[
                                  state.deliveryAddress.street,
                                  state.deliveryAddress.city,
                                  state.deliveryAddress.state,
                                  state.deliveryAddress.zipCode,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            ) : (
                              <p className="leading-relaxed">
                                {state.pickupDate}
                                {state.pickupTime
                                  ? ` · ${state.pickupTime}`
                                  : ""}
                                {pickupAddress ? (
                                  <span className="block text-slate-500 text-xs">
                                    {pickupAddress}
                                  </span>
                                ) : null}
                              </p>
                            )}
                            {state.instructions && (
                              <p className="text-xs text-slate-500 mt-1">
                                Note: {state.instructions}
                              </p>
                            )}
                          </div>

                          {/* Items */}
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                              Items
                            </p>
                            <ul className="space-y-1">
                              {(state.cartItems || []).map(
                                (it: any, idx: number) => {
                                  const extras = [
                                    it.optionTitle,
                                    it.subcategoryName,
                                    it.variantTitle,
                                  ]
                                    .filter(
                                      (v: string) => v && v !== "Default",
                                    )
                                    .join(" · ");
                                  return (
                                    <li
                                      key={idx}
                                      className="flex justify-between gap-3"
                                    >
                                      <span className="flex-1">
                                        {it.productName}
                                        {extras ? (
                                          <span className="text-xs text-slate-500">
                                            {" "}
                                            ({extras})
                                          </span>
                                        ) : null}
                                        <span className="text-slate-500">
                                          {" "}
                                          ×{it.quantity}
                                        </span>
                                      </span>
                                      <span className="whitespace-nowrap">
                                        {formatPrice(it.price * it.quantity)}
                                      </span>
                                    </li>
                                  );
                                },
                              )}
                            </ul>
                          </div>

                          {/* Breakdown */}
                          <div className="border-t pt-2 text-xs space-y-1">
                            <div className="flex justify-between">
                              <span>Subtotal</span>
                              <span>{formatPrice(state.subtotal)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Delivery</span>
                              <span>{formatPrice(state.deliveryFee)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Tax {state.taxPercentage}%</span>
                              <span>{formatPrice(state.tax)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>
                                Discount {state.discountPercentage}%
                              </span>
                              <span>-{formatPrice(state.discount)}</span>
                            </div>
                            {state.appliedCoupon && (
                              <div className="flex justify-between">
                                <span>
                                  Coupon ({state.appliedCoupon.code})
                                </span>
                                <span>
                                  -{formatPrice(state.couponDiscount)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Disclaimer strip */}
                        <div className="bg-slate-50 border-t px-4 py-2.5 text-[11px] text-slate-600 leading-snug">
                          Keep this as a temporary quote. The vendor will
                          generate and share the official receipt PDF on their
                          side once payment is verified.
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button
                          onClick={handleDownloadReceipt}
                          variant="outline"
                          className="w-full"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download PDF
                        </Button>
                        {state.whatsAppNumber && (
                          <a
                            href={getWhatsappLink()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full h-10 inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium"
                          >
                            <FaWhatsapp size={18} />
                            Send to Shopkeeper
                          </a>
                        )}
                        <Button
                          onClick={backToStore}
                          className="w-full bg-primary text-white"
                        >
                          Back to Store
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
          {/* Order Summary */}
          <div className="space-y-6">
            {/* Merchant Info */}
            <Card>
              <CardHeader>
                <CardTitle>Merchant Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-semibold text-lg">
                  Shop Name: {state.merchantName}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-semibold text-l">
                  Customer Name: {state.fullName}
                </p>
                <p className="font-semibold text-l">
                  Contact No. : {state.userWhatsApp}
                </p>
              </CardContent>
            </Card>

            {/* Delivery/Pickup Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {state.orderType === "delivery" ? (
                    <>
                      <Truck className="w-5 h-5" /> Delivery Details
                    </>
                  ) : (
                    <>
                      <Store className="w-5 h-5" /> Pickup Details
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {state.orderType === "delivery" && state.deliveryAddress ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-1 text-gray-500" />
                      <div>
                        <p>{state.deliveryAddress.street}</p>
                        <p>
                          {state.deliveryAddress.city},{" "}
                          {state.deliveryAddress.state}
                        </p>
                        <p>{state.deliveryAddress.zipCode}</p>
                      </div>
                    </div>
                    <Separator />
                    {state.instructions && (
                      <p className="text-l mt-2">
                        <strong>Special Instructions:</strong>{" "}
                        {state.instructions}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <div>
                        <p>
                          <strong>Date:</strong> {state.pickupDate}
                        </p>
                        <p>
                          <strong>Time:</strong> {state.pickupTime}
                        </p>
                      </div>
                    </div>

                    {/* Pickup Address */}
                    {pickupAddress && (
                      <div className="flex items-start gap-2 pt-2 border-t">
                        <MapPin className="w-4 h-4 mt-1 text-gray-500" />
                        <div>
                          <p>
                            <strong>Pickup Address:</strong>
                          </p>
                          <p className="text-sm text-gray-600">
                            {pickupAddress}
                          </p>
                        </div>
                      </div>
                    )}

                    <Separator />
                    {state.instructions && (
                      <p className="text-l mt-2">
                        <strong>Special Instructions:</strong>{" "}
                        {state.instructions}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Price Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  Price Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatPrice(state.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Delivery Fee</span>
                    <span>{formatPrice(state.deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax {state.taxPercentage}%</span>
                    <span>{formatPrice(state.tax)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount {state.discountPercentage}%</span>
                    <span>-{formatPrice(state.discount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Coupon ({state?.appliedCoupon?.code})</span>
                    <span>-{formatPrice(state?.couponDiscount)}</span>
                  </div>

                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-green-600">
                      {formatPrice(state.total)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
