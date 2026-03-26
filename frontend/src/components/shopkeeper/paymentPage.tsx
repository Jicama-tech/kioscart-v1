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
import { useCart } from "../../hooks/cartContext";
import QRCode from "react-qr-code";
import { useCurrency } from "@/hooks/useCurrencyhook";
import { Item } from "@radix-ui/react-select";
import { Separator } from "../ui/separator";

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
  const [timeLeft, setTimeLeft] = useState(24 * 60 * 60); // 24 hours in seconds

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
          `• ${item.productName} (Qty: ${item.quantity}) - ${formatPrice(
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
          `• ${item.productName} (Qty: ${item.quantity}) - ${formatPrice(
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

      if (res.ok) {
        // We generate the link immediately to ensure we have the data
        const whatsappUrl = getWhatsappLink();

        if (whatsappUrl !== "#") {
          // Start the 3-second timer
          setTimeout(() => {
            // Option A: Redirect the current tab (Recommended for mobile/reliability)
            window.open(whatsappUrl, "_blank");

            // Option B: Try to open in a new tab (Note: May be blocked by browser popup blockers)
            // window.open(whatsappUrl, "_blank");
          }, 3000); // 3000 milliseconds = 3 seconds
        }
      }
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

  async function handleDownload() {
    if (!state?.paymentImageUrl) {
      toast({
        duration: 5000,
        title: "No QR code available",
        variant: "destructive",
      });
      return;
    }
    try {
      const response = await fetch(state.paymentImageUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch image for download.");
      }
      const imageBlob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(imageBlob);
      link.download = `payment-qr-order-${state.merchantName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
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

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <Button
            variant="buttonOutline"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cart
          </Button>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            Order #{state.orderId}
          </Badge>
        </div>
        <div className="grid lg:grid-cols-3 gap-8">
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
                        <div className="flex gap-2 mt-1">
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
                  {/* Dynamic QR Code */}
                  {dynamicQR && country === "IN" && (
                    <div>
                      {dynamicUpiString ? (
                        <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl shadow-lg border-2 border-blue-200">
                          <QRCode
                            value={dynamicUpiString}
                            size={280}
                            fgColor="#000000ff"
                            bgColor="#ffffff"
                          />

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
                            {/* <p className="text-xs text-gray-600">
                          Google Pay, PhonePe, Paytm, etc.
                        </p> */}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-center animate-pulse">
                          <div className="w-72 h-72 bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
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
                          className="mx-auto w-72 h-72 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex justify-center animate-pulse">
                          <div className="w-72 h-72 bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
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
                        <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-xl shadow-lg border-2 border-blue-200">
                          <img
                            src={dynamicUENString}
                            alt="PayNow QR"
                            className="w-[280px] h-[280px] rounded-xl shadow-lg"
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
                          <div className="w-72 h-72 bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
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
                          className="mx-auto w-72 h-72 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex justify-center animate-pulse">
                          <div className="w-72 h-72 bg-gray-100 rounded-xl border-4 border-dashed border-gray-300 flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <QrCode className="w-12 h-12 mx-auto mb-2" />
                              <p>Loading Payment QR...</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-bold text-green-800">
                      ✅ After Payment
                    </p>
                    <p className="text-xs text-green-700">
                      Once your payment is successful, Click the "I have
                      Completed Payment" to complete your order.
                    </p>
                  </div>
                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* <Button
                      onClick={handlePayNow}
                      disabled={isDecoding || isSubmitting}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                      {isDecoding ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Scan className="mr-2 h-5 w-5" />
                          Scan & Pay Now
                        </>
                      )}
                    </Button> */}
                    <Button
                      onClick={handleDownload}
                      variant="outline"
                      disabled={!state?.paymentImageUrl}
                      className="flex-1"
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Download QR
                    </Button>
                  </div>
                  {/* Shop Info */}
                  {/* <div className="border-t pt-4 text-xs text-gray-600 space-y-1">
                    <p>
                      <span className="font-semibold">📍 Pickup:</span>{" "}
                      {state.merchantName}
                    </p>
                    <p>
                      <span className="font-semibold">📅 Date:</span>{" "}
                      {state.pickupDate}
                    </p>
                    <p>
                      <span className="font-semibold">⏰ Time:</span>{" "}
                      {state.pickupTime}
                    </p>
                  </div> */}
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
            {/* Payment Confirmation */}
            <Card>
              <CardContent className="pt-6">
                {!paymentSubmitted ? (
                  <Button
                    onClick={handlePaymentCompletion}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? "Submitting..."
                      : "I Have Completed Payment"}
                  </Button>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center gap-2 text-green-600 font-semibold mb-4">
                      <CheckCircle className="w-6 h-6" />
                      Orders are processed and receipts will be issued after
                      payment verification!
                    </div>
                    <div className="text-sm text-gray-500 mb-4 animate-pulse">
                      Redirecting to Shopkeeper in{" "}
                      <span className="font-bold text-green-600">3s</span>
                      ...
                    </div>
                    <div className="flex w-full max-w-xs gap-3">
                      {/* Back To Store */}
                      <div className="flex-1">
                        <Button
                          onClick={backToStore}
                          variant="buttonOutline"
                          className="w-full h-12 flex items-center justify-center px-0 py-0 leading-none rounded-lg bg-primary text-white"
                        >
                          Back To Store
                        </Button>
                      </div>

                      {/* Contact Shopkeeper */}
                      {state.whatsAppNumber && (
                        <div className="flex-1">
                          <a
                            href={getWhatsappLink()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full h-12 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                          >
                            <FaWhatsapp size={20} />
                            Shopkeeper
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
