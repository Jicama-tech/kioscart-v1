import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCart } from "@/hooks/cartContext";
import { useToast } from "@/components/ui/use-toast";
import {
  X,
  Plus,
  Minus,
  ShoppingCart,
  ArrowLeft,
  Truck,
  Store,
  Calendar,
  Clock,
  CreditCard,
  Loader2,
  Package,
  StoreIcon,
} from "lucide-react";
import { jwtDecode } from "jwt-decode";
import { FaInfoCircle, FaWhatsapp, FaGoogle } from "react-icons/fa";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/useCurrencyhook";

export interface Country {
  name: string;
  code: string;
  dialCode: string;
}

interface ShopkeeperToken {
  roles: string[];
}

export function CartPage() {
  const { shopkeeperId } = useParams<{ shopkeeperId: string }>();
  const [isNavigating, setIsNavigating] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { toast } = useToast();
  const apiURL = __API_URL__;
  const navigate = useNavigate();

  const {
    cartItems,
    updateQuantity,
    removeFromCart,
    cartTotal,
    cartCount,
    clearCart,
  } = useCart();

  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [emailVerifying, setEmailVerifying] = useState(false);

  const [countryCode, setCountryCode] = useState("+65");
  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);

  // WhatsApp is now an optional contact field for buyers — no OTP required
  const [whatsapp, setWhatsapp] = useState("");
  // whatsappVerified is used in the "self" tab for shopkeeper customer lookup
  const [whatsappVerified, setWhatsappVerified] = useState(false);

  // Buyer Google sign-in state
  const [buyerGoogleLoggedIn, setBuyerGoogleLoggedIn] = useState(false);
  const [whatsAppNumber, setWhatsappNumber] = useState("");
  const [shopClosedFromDate, setClosedFromDate] = useState("");
  const [shopClosedToDate, setClosedToDate] = useState("");

  // New state for order tabs and fields
  const [orderFor, setOrderFor] = useState<"customer" | "self">(() => {
    // If token exists immediately on load, start with "self"
    return sessionStorage.getItem("token") ? "self" : "customer";
  });
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [customerWhatsAppNumber, setCustomerWhatsAppNumber] = useState("");

  // State for shopkeeper verification
  const [shopkeeperWhatsAppNumber, setShopkeeperWhatsAppNumber] = useState("");
  const [shopkeeperOtp, setShopkeeperOtp] = useState("");
  const [isShopkeeperOtpSent, setIsShopkeeperOtpSent] = useState(false);
  const [isShopkeeperVerified, setIsShopkeeperVerified] = useState(false);
  const [isShopkeeperVerifying, setIsShopkeeperVerifying] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [completeWhatsAppNumber, setCompleteWhatsAppNumber] = useState("");
  const [country, setCountry] = useState<"IN" | "SG">("IN");
  const { formatPrice, getSymbol } = useCurrency(country);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  // (OTP timer removed — WhatsApp OTP no longer used for buyers)
  const [shopName, setShopName] = useState("");


  useEffect(() => {
    async function fetchCountries() {
      try {
        setLoadingCountries(true);
        const response = await fetch(
          "https://restcountries.com/v3.1/all?fields=name,cca2,idd",
        );
        const data = await response.json();

        const fetchedCountries: Country[] = data
          .map((country: any) => {
            const root = country.idd?.root ?? "";
            const suffixes = country.idd?.suffixes ?? [];
            let dial = "";
            if (root && suffixes.length === 1) dial = root + suffixes[0];
            else if (root) dial = root;
            return {
              name: country.name?.common || "",
              code: country.cca2 || "",
              dialCode: dial,
            };
          })
          .filter((c) => c.dialCode)
          .sort((a, b) => a.name.localeCompare(b.name));
        setCountries(fetchedCountries);
      } catch (e) {
        toast({
          duration: 5000,
          title: "Error loading countries",
          description: "Failed to fetch country codes",
          variant: "destructive",
        });
      } finally {
        setLoadingCountries(false);
      }
    }

    async function fetchWhatsAppNumber() {
      try {
        if (shopkeeperId) {
          const response = await fetch(
            `${apiURL}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
          );

          if (!response.ok) {
            throw new Error("Failed to fetch store details");
          }

          const shopData = await response.json();
          setWhatsappNumber(shopData.data.whatsappNumber);
          setClosedFromDate(shopData.data.shopClosedFromDate);
          setClosedToDate(shopData.data.shopClosedToDate);
          setPickupAddress(shopData.data.address);
        }
      } catch (error) {
        console.error("Error fetching store details:", error);
      }
    }

    const fetchAddress = async () => {
      try {
        const response = await fetch(
          `${apiURL}/shopkeeper-stores/shopkeeper-store-detail/${shopkeeperId}`,
          { method: "GET" },
        );
        if (!response.ok) throw new Error("Failed to fetch store details");
        const storeData = await response.json();
        const data = storeData.data;

        // await setPickupAddress(data.settings.general.contactInfo.address);
        setSlug(data.slug);
      } catch (error) {}
    };

    const fetchTax = async () => {
      try {
        const url = `${apiURL}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`;
        const res = await fetch(url, {
          method: "GET",
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error(
            `Profile fetch failed: ${res.status} ${res.statusText} ${res.url}`,
            errText,
          );
          throw new Error(`Failed to load profile (${res.status})`);
        }

        const data = await res.json();
        if (data.data.country) {
          setCountry(data.data.country);
        }
        if (data.data.taxPercentage) {
          setTaxPercentage(data.data.taxPercentage);
        }
        if (data.data.discountPercentage) {
          setDiscountPercentage(data.data.discountPercentage);
        }
        if (data.data.shopName) {
          setShopName(data.data._id);
        }
        if (data.data.email) {
          setEmailId(data.data.email);
        }

      } catch (err) {
        console.error("Error fetching tax:", err);
      }
    };

    const fetchCoupons = async () => {
      try {
        const url = `${apiURL}/coupons/shopkeeper/${shopkeeperId}`;
        const res = await fetch(url, {
          method: "GET",
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error(
            `Coupons fetch failed: ${res.status} ${res.statusText} ${res.url}`,
            errText,
          );
          throw new Error(`Failed to load coupons (${res.status})`);
        }
        const data = await res.json();
        setCoupons(data.data);
      } catch (err) {
        console.error("Error fetching coupons:", err);
      }
    };

    fetchAddress();
    fetchTax();
    fetchCountries();
    fetchWhatsAppNumber();
    fetchCoupons();
  }, []);

  const applyCoupon = async (coupon: any) => {
    let discount = 0;

    if (sessionStorage.getItem("userToken")) {
      try {
        const token = sessionStorage.getItem("userToken");
        if (!token) throw new Error("User not logged in");
        const decoded = jwtDecode(token);
        const userId = decoded.sub;

        const response = await fetch(
          `${apiURL}/orders/coupon-code-validation/${userId}/coupon/${coupon._id}`,
          { method: "GET" },
        );

        const data = await response.json();

        const applied = data.applied;

        if (!applied) {
          if (coupon.discountType === "PERCENTAGE") {
            discount = (subtotal * coupon.discountPercentage) / 100;
          } else {
            discount = coupon.flatDiscountAmount;
          }

          // Prevent over-discount
          discount = Math.min(discount, subtotal);

          setAppliedCoupon(coupon);
          setCouponDiscount(discount);
        } else {
          throw new Error(data.message || "Coupon cannot be applied");
        }
      } catch (error) {
        toast({
          duration: 5000,
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }
    }

    if (sessionStorage.getItem("token")) {
      if (coupon.discountType === "PERCENTAGE") {
        discount = (subtotal * coupon.discountPercentage) / 100;
      } else {
        discount = coupon.flatDiscountAmount;
      }

      // Prevent over-discount
      discount = Math.min(discount, subtotal);

      setAppliedCoupon(coupon);
      setCouponDiscount(discount);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
  };

  useEffect(() => {
    getShopkeeper();
    // Auto-fill buyer info if already signed in via Google
    const userToken = sessionStorage.getItem("userToken");
    if (userToken) {
      try {
        const decoded: any = jwtDecode(userToken);
        setBuyerGoogleLoggedIn(true);
        setEmail(decoded.email || "");
        setEmailVerified(true);
        if (decoded.firstName) setFirstName(decoded.firstName);
        else if (decoded.name) setFirstName(decoded.name.split(" ")[0] || "");
        if (decoded.lastName) setLastName(decoded.lastName);
        else if (decoded.name) setLastName(decoded.name.split(" ").slice(1).join(" "));
      } catch {
        // Token invalid — clear it
        sessionStorage.removeItem("userToken");
      }
    }
  }, []);

  function handleGoogleSignIn() {
    // Save current cart URL so CartAuthReturn can redirect back here
    sessionStorage.setItem("cartReturnUrl", window.location.pathname);
    const origin = encodeURIComponent(window.location.origin);
    window.location.href = `${apiURL}/auth/google-buyer?origin=${origin}`;
  }

  async function getShopkeeper() {
    const token = sessionStorage.getItem("token");
    if (token) {
      const decode = jwtDecode<ShopkeeperToken>(token);
      const role = decode.roles[0];
      if (role === "shopkeeper") {
        setIsShopkeeperVerified(true);
        setOrderFor("self"); // <--- Add this to force the switch
      }
    }
  }

  async function handleVerifyEmail() {
    if (!email) {
      toast({
        duration: 5000,
        title: "Please enter email",
        variant: "destructive",
      });
      return;
    }
    setEmailVerifying(true);

    try {
      const res = await fetch(`${apiURL}/users/verify-email-for-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, whatsAppNumber: completeWhatsAppNumber }),
      });
      if (!res.ok) throw new Error("Failed to verify email");
      const data = await res.json();

      if (data.success) {
        setEmailVerified(true);
        sessionStorage.setItem("userToken", data.token);
        sessionStorage.removeItem("token");
        toast({
          duration: 5000,
          title: "Email Verified",
          description: data.message,
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      toast({
        duration: 5000,
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setEmailVerifying(false);
    }
  }


  async function findUserBywhatsAppNumber(
    countryCode: string,
    whatsAppNumber: string,
  ) {
    try {
      const fullWhatsAppNumber = `${countryCode}${whatsAppNumber}`;
      const res = await fetch(
        `${apiURL}/users/get-user-by-whatsAppNumber/${fullWhatsAppNumber}`,
        {
          method: "GET",
        },
      );

      if (res.status === 404) {
        // New customer — let shopkeeper fill in details
        setWhatsappVerified(true);
        toast({
          duration: 5000,
          title: "New Customer",
          description: "Please fill in the customer details",
        });
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to validate WhatsApp number");
      }

      const data = await res.json();
      if (data.data) {
        setEmail(data.data.email || "");
        setFirstName(data.data.name?.split(" ")[0] || "");
        setLastName(data.data.name?.split(" ").slice(1).join(" ") || "");
        setWhatsappVerified(true);
        toast({
          duration: 3000,
          title: "Customer Found",
          description: "Details auto-filled successfully",
        });
      } else {
        // User not found in response data — treat as new customer
        setWhatsappVerified(true);
        toast({
          duration: 5000,
          title: "New Customer",
          description: "Please fill in the customer details",
        });
      }
    } catch (err) {
      toast({
        duration: 5000,
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  // Shopkeeper OTP functions
  const handleRequestShopkeeperOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopkeeperWhatsAppNumber || shopkeeperWhatsAppNumber.length < 6) {
      toast({
        duration: 5000,
        title: "Invalid Number",
        description: "Please enter a valid WhatsApp number",
        variant: "destructive",
      });
      return;
    }

    setIsShopkeeperVerifying(true);
    try {
      const fullNumber = `${countryCode}${shopkeeperWhatsAppNumber}`;
      const response = await fetch(`${apiURL}/otp/send-whatsapp-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappNumber: fullNumber,
          role: "shopkeeper",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send OTP");
      }

      toast({
        duration: 5000,
        title: "OTP Sent Successfully",
        description: `OTP sent to WhatsApp number ${fullNumber}`,
      });

      setIsShopkeeperOtpSent(true);
      setCountdown(60);
    } catch (err: any) {
      toast({
        duration: 5000,
        title: "Error",
        description: err.message || "Failed to send OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsShopkeeperVerifying(false);
    }
  };

  const handleVerifyShopkeeperOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpString = shopkeeperOtp;
    if (otpString.length !== 6) {
      toast({
        duration: 5000,
        title: "Invalid OTP",
        description: "Please enter all 6 digits",
        variant: "destructive",
      });
      return;
    }
    setIsShopkeeperVerifying(true);
    try {
      const fullNumber = `${countryCode}${shopkeeperWhatsAppNumber}`;
      const response = await fetch(`${apiURL}/otp/verify-chat-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappNumber: fullNumber,
          otp: otpString,
          role: "shopkeeper",
          shopId: shopName,
          emailId: emailId,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "OTP verification failed");
      }
      const data = await response.json();
      if (data.data) {
        sessionStorage.setItem("token", data.data);
        sessionStorage.removeItem("userToken");
        setIsShopkeeperVerified(true);
        toast({
          duration: 5000,
          title: "Shopkeeper Verified",
          description: "You can now place the order for the customer.",
        });
      } else {
        throw new Error("No token received");
      }
    } catch (err: any) {
      toast({
        duration: 5000,
        title: "Verification Failed",
        description: err.message || "Invalid OTP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsShopkeeperVerifying(false);
    }
  };

  // Order options state
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState({
    street: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [pickupDate, setPickupDate] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [taxPercentage, setTaxPercentage] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [pickupAddress, setPickupAddress] = useState("");
  const [emailId, setEmailId] = useState("");
  const [slug, setSlug] = useState("");
  const [instructions, setInstructions] = useState("");
  const [orderDate, setOrderDate] = useState("");

  const shopCart =
    shopkeeperId && cartItems[shopkeeperId] ? cartItems[shopkeeperId] : [];
  const subtotal = cartTotal(shopkeeperId || "");
  const deliveryFee = orderType === "delivery" ? 30 : 0;

  // Kiosk/self-order mode: auto-set pickup date & time to now
  const isSelfOrder = orderFor === "self";

  useEffect(() => {
    if (isSelfOrder && orderType === "pickup") {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
      const hours = now.getHours().toString().padStart(2, "0");
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const timeStr = `${hours}:${minutes}`;
      setPickupDate(dateStr);
      setPickupTime(timeStr);
    }
  }, [isSelfOrder, orderType]);

  const discount = (subtotal * discountPercentage) / 100;
  const grandTotal = subtotal - discount - couponDiscount;
  const tax = (grandTotal * taxPercentage) / 100;
  const total = grandTotal + deliveryFee + tax;

  const handleBackToStore = () => {
    setIsNavigating(true);
    navigate(`/${slug}`);
  };

  const getAvailablePickupDates = (
    closedFromStr: string,
    closedToStr: string,
  ) => {
    const dates = [];
    const today = new Date();
    const closedFrom = closedFromStr ? new Date(closedFromStr) : null;
    const closedTo = closedToStr ? new Date(closedToStr) : null;

    for (let i = 0; i <= 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      let isClosed = false;
      if (closedFrom && closedTo) {
        isClosed = date >= closedFrom && date <= closedTo;
      }

      dates.push({
        value: date.toISOString().split("T")[0],
        label: date.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        isClosed,
      });
    }
    return dates;
  };

  const getAvailablePickupTimes = () => {
    const times = [];
    const now = new Date();
    const isToday = pickupDate === now.toISOString().split("T")[0];
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    for (let hour = 0; hour <= 23; hour++) {
      for (const min of [0, 30]) {
        // Skip past times if pickup date is today
        if (isToday && (hour < currentHour || (hour === currentHour && min <= currentMin))) {
          continue;
        }
        const timeStr = `${hour.toString().padStart(2, "0")}:${min
          .toString()
          .padStart(2, "0")}`;
        const displayTime = new Date(
          `2000-01-01T${timeStr}`,
        ).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        times.push({ value: timeStr, label: displayTime });
      }
    }
    return times;
  };

  async function handleCheckout() {
    if (!shopkeeperId) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Invalid shopkeeper",
        variant: "destructive",
      });
      return;
    }

    // Basic validation
    if (orderType === "delivery") {
      if (
        !deliveryAddress.street ||
        !deliveryAddress.city ||
        !deliveryAddress.state ||
        !deliveryAddress.zipCode
      ) {
        toast({
          duration: 5000,
          title: "Missing info",
          description: "Please fill all delivery address fields",
          variant: "destructive",
        });
        return;
      }
    } else if (!isSelfOrder) {
      if (!pickupDate || !pickupTime) {
        toast({
          duration: 5000,
          title: "Missing info",
          description: "Please select pickup date and time",
          variant: "destructive",
        });
        return;
      }
    }

    setIsCheckingOut(true);

    try {
      // Get shopkeeper details incl payment QR image path
      const response = await fetch(
        `${apiURL}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
      );
      if (!response.ok) throw new Error("Failed to fetch shopkeeper info");
      const { data: shop } = await response.json();

      let userId;

      if (orderFor === "customer") {
        const token = sessionStorage.getItem("userToken");
        const decoded = jwtDecode(token);
        userId = decoded.sub;
      }

      if (orderFor === "self") {
        const token = sessionStorage.getItem("token");
        const decoded = jwtDecode(token);
        userId = decoded.sub;
      }

      setWhatsappNumber(shop.whatsappNumber);
      const whatsAppNumber = shop.whatsappNumber;
      const orderId = `ORDER-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const paymentImageUrl = shop.paymentURL ? apiURL + shop.paymentURL : "";
      const userWhatsApp = countryCode + whatsapp;

      const fullName = firstName + " " + lastName;
      navigate("/payment", {
        state: {
          paymentImageUrl,
          whatsAppNumber,
          merchantName: shop.shopName || "Merchant",
          hasDocVerification: shop.hasDocVerification,
          orderId,
          shopkeeperId,
          fullName,
          userWhatsApp,
          instructions,
          userId,
          orderType,
          deliveryAddress: orderType === "delivery" ? deliveryAddress : null,
          pickupDate: orderType === "pickup" ? pickupDate : null,
          pickupTime: orderType === "pickup" ? pickupTime : null,
          cartItems: shopCart,
          subtotal,
          deliveryFee,
          taxPercentage,
          discountPercentage,
          tax,
          total,
          discount,
          couponDiscount,
          appliedCoupon,
          itemCount: shopkeeperId ? cartCount(shopkeeperId) : 0,
        },
      });
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Checkout Failed",
        description: error.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  }

  if (!shopkeeperId) {
    return (
      <div className="container mx-auto max-w-xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>Invalid Shop</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>Please select a valid shop to continue.</p>
            <Button onClick={() => navigate("/")}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (shopCart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
        <div className="container mx-auto max-w-6xl px-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
            {/* Left: Cart Items & Order Options */}
            <div className="xl:col-span-2 space-y-6">
              {/* Cart Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <ShoppingCart className="w-5 h-5" />
                    Your Cart ({cartCount(shopkeeperId)})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {shopCart.map((item) => (
                    <div
                      key={`${item.productId}-${item.subcategoryIndex}-${item.variantIndex}`}
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border rounded-lg bg-white"
                    >
                      {item.image && (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0">
                          <img
                            loading="lazy"
                            src={apiURL + item.image}
                            alt={item.productName}
                            className="w-full h-full object-cover rounded-md"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base truncate">
                          {item.productName}
                        </h3>
                        <div className="space-y-2">
                          {item.category && (
                            <p className="text-xs text-muted-foreground">
                              {item.category}
                            </p>
                          )}
                          <div className="flex flew-row gap-2">
                            {item.subcategoryName && (
                              <p className="text-xs bg-black rounded-md px-2 inline-block text-white">
                                {item.subcategoryName}
                              </p>
                            )}
                            {item.variantTitle && (
                              <p className="text-xs bg-black rounded-md px-2 inline-block text-white">
                                {item.variantTitle}
                              </p>
                            )}
                          </div>
                          {item.sku && (
                            <p className="text-xs text-muted-foreground">
                              SKU: {item.sku}
                            </p>
                          )}
                          <p className="text-sm font-medium flex items-center gap-2">
                            {item.isDiscounted && (
                              <div>
                                <span className="text-xs text-gray-400 line-through">
                                  {formatPrice(item.price)}
                                </span>{" "}
                                <span className="text-green-600">
                                  {formatPrice(item.discountedPrice)} each
                                </span>
                              </div>
                            )}

                            {!item.isDiscounted && (
                              <span className="text-green-600">
                                {formatPrice(item.price)} each
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                        <div className="flex items-center gap-1">
                          {/* <Button
                          variant="buttonOutline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            updateQuantity(
                              shopkeeperId,
                              item.productId,
                              item.subcategoryIndex,
                              item.variantIndex,
                              item.quantity - 1,
                            )
                          }
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-3 h-3" />
                        </Button> */}
                          {item.isDiscounted && (
                            <span className="w-20 mr-10 text-center text-sm font-medium">
                              {formatPrice(item.discountedPrice)} *{" "}
                              {item.quantity}
                            </span>
                          )}
                          {!item.isDiscounted && (
                            <span className="w-20 mr-10 text-center text-sm font-medium">
                              {formatPrice(item.price)} * {item.quantity}
                            </span>
                          )}

                          {/* <Button
                          variant="buttonOutline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            updateQuantity(
                              shopkeeperId,
                              item.productId,
                              item.subcategoryIndex,
                              item.variantIndex,
                              item.quantity + 1,
                            )
                          }
                          disabled={item.quantity >= item.inventory}
                        >
                          <Plus className="w-3 h-3" />
                        </Button> */}
                        </div>

                        <div className="text-right flex items-center gap-2">
                          <div>
                            {item.isDiscounted ? (
                              <>
                                <div className="w-20">
                                  <p className="text-xs sm:text-sm text-gray-400 line-through">
                                    {formatPrice(item.price * item.quantity)}
                                  </p>

                                  {/* Discounted total */}
                                  <p className="font-semibold text-sm sm:text-base text-green-600">
                                    {formatPrice(
                                      item.discountedPrice * item.quantity,
                                    )}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <p className="font-semibold text-sm sm:text-base">
                                {formatPrice(item.price * item.quantity)}
                              </p>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeFromCart(
                                shopkeeperId,
                                item.productId,
                                item.subcategoryIndex,
                                item.variantIndex,
                              )
                            }
                            className="text-red-500 hover:text-red-700 h-8 w-8"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex flex-col sm:flex-row justify-between gap-2">
                    <Button
                      onClick={handleBackToStore}
                      variant="buttonOutline"
                      disabled={isNavigating}
                      className="w-full sm:w-auto"
                    >
                      {isNavigating ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <ArrowLeft className="w-4 h-4 mr-2" />
                      )}
                      Back to Store
                    </Button>

                    {whatsAppNumber && (
                      <Button
                        variant="whatsApp"
                        className="w-full sm:w-auto px-3 py-2"
                      >
                        <a
                          href={`https://wa.me/${whatsAppNumber.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 transition w-full"
                        >
                          <FaWhatsapp size={18} className="shrink-0" />
                          <span className="font-medium text-xs sm:text-sm whitespace-nowrap">
                            WhatsApp Contact
                          </span>
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Order Type Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="w-5 h-5" />
                    Fulfillment Options
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <RadioGroup
                    value={orderType}
                    onValueChange={(val: "delivery" | "pickup") =>
                      setOrderType(val)
                    }
                    className="flex flex-col sm:flex-row gap-3 w-full"
                  >
                    {/* Pickup */}
                    <div className="flex items-center space-x-3 p-4 border rounded-xl w-full sm:flex-1">
                      <RadioGroupItem value="pickup" id="pickup" />
                      <Label
                        htmlFor="pickup"
                        className="flex items-center gap-2 cursor-pointer w-full"
                      >
                        <Store className="w-4 h-4 text-blue-600 shrink-0" />
                        <div>
                          <p className="font-medium">Store Pickup</p>
                          <p className="text-sm text-muted-foreground">Free</p>
                        </div>
                      </Label>
                    </div>

                    {/* Delivery */}
                    <div className="flex items-center space-x-3 p-4 border rounded-xl w-full sm:flex-1">
                      <RadioGroupItem value="delivery" id="delivery" />
                      <Label
                        htmlFor="delivery"
                        className="flex items-center gap-2 cursor-pointer w-full"
                      >
                        <Truck className="w-4 h-4 text-green-600 shrink-0" />
                        <div>
                          <p className="font-medium">Home Delivery</p>
                          <p className="text-sm text-muted-foreground">
                            Delivery charges
                          </p>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>

                  {orderType === "delivery" && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <Label htmlFor="street">Street Address *</Label>
                          <Input
                            id="street"
                            value={deliveryAddress.street}
                            onChange={(e) =>
                              setDeliveryAddress((prev) => ({
                                ...prev,
                                street: e.target.value,
                              }))
                            }
                            placeholder="123 Main Street"
                          />
                        </div>
                        <div>
                          <Label htmlFor="city">City *</Label>
                          <Input
                            id="city"
                            value={deliveryAddress.city}
                            onChange={(e) =>
                              setDeliveryAddress((prev) => ({
                                ...prev,
                                city: e.target.value,
                              }))
                            }
                            placeholder="City"
                          />
                        </div>
                        <div>
                          <Label htmlFor="state">State *</Label>
                          <Input
                            id="state"
                            value={deliveryAddress.state}
                            onChange={(e) =>
                              setDeliveryAddress((prev) => ({
                                ...prev,
                                state: e.target.value,
                              }))
                            }
                            placeholder="State"
                          />
                        </div>
                        <div>
                          <Label htmlFor="zipCode">ZIP Code *</Label>
                          <Input
                            id="zipCode"
                            value={deliveryAddress.zipCode}
                            onChange={(e) =>
                              setDeliveryAddress((prev) => ({
                                ...prev,
                                zipCode: e.target.value,
                              }))
                            }
                            placeholder="12345"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor="instructions">
                            Special Instructions
                          </Label>
                          <Textarea
                            id="instructions"
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            placeholder="Any special delivery instructions"
                            rows={3}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {orderType === "pickup" && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                      {isSelfOrder ? (
                        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <Clock className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">
                            Kiosk Order — Pickup set to now
                          </span>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <Label
                              htmlFor="pickupDate"
                              className="flex items-center gap-2"
                            >
                              <Calendar className="w-4 h-4" />
                              Pickup Date *
                            </Label>
                            <Select
                              value={pickupDate}
                              onValueChange={setPickupDate}
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Select date" />
                              </SelectTrigger>
                              <SelectContent>
                                {getAvailablePickupDates(
                                  shopClosedFromDate,
                                  shopClosedToDate,
                                ).map((date) => (
                                  <SelectItem
                                    key={date.value}
                                    value={date.value}
                                    disabled={date.isClosed}
                                    className={
                                      date.isClosed ? "text-gray-400 italic" : ""
                                    }
                                    title={
                                      date.isClosed ? "Shop is closed" : undefined
                                    }
                                  >
                                    {date.label}
                                    {date.isClosed && (
                                      <span className="ml-2 text-red-500">
                                        (Shop is closed)
                                      </span>
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label
                              htmlFor="pickupTime"
                              className="flex items-center gap-2"
                            >
                              <Clock className="w-4 h-4" />
                              Pickup Time *
                            </Label>
                            <Select
                              value={pickupTime}
                              onValueChange={setPickupTime}
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Select time" />
                              </SelectTrigger>
                              <SelectContent>
                                {getAvailablePickupTimes().map((time) => (
                                  <SelectItem key={time.value} value={time.value}>
                                    {time.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <div>
                        <Label className="font-semibold">
                          Pickup Address
                        </Label>
                        <div className="mt-1 p-3 border rounded bg-white text-sm text-muted-foreground">
                          <p>{pickupAddress}</p>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="instructions">
                          Special Instructions
                        </Label>
                        <Textarea
                          id="instructions"
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          placeholder="Any special delivery instructions"
                          rows={3}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Order Summary */}
            <div className="xl:col-span-1">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Order Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Tabs
                    value={orderFor}
                    onValueChange={(value) =>
                      setOrderFor(value as "customer" | "self")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger
                        value="customer"
                        // Disable if verified OR if a token is sitting in storage
                        disabled={
                          isShopkeeperVerified ||
                          !!sessionStorage.getItem("token")
                        }
                        onClick={getShopkeeper}
                      >
                        Customer Order
                      </TabsTrigger>
                      <TabsTrigger value="self">
                        <StoreIcon className="h-4 w-4" />
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="customer" className="space-y-4">
                      {/* Google Sign-In Gate */}
                      {!buyerGoogleLoggedIn ? (
                        <div className="text-center py-4 space-y-3">
                          <p className="text-sm text-muted-foreground">Sign in to place your order</p>
                          <Button
                            onClick={handleGoogleSignIn}
                            className="w-full"
                            variant="buttonOutline"
                          >
                            <FaGoogle className="mr-2 h-4 w-4" />
                            Continue with Google
                          </Button>
                        </div>
                      ) : (
                        <>
                      {/* Customer Order Fields — pre-filled from Google */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">First Name *</Label>
                          <Input
                            id="firstName"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last Name *</Label>
                          <Input
                            id="lastName"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Doe"
                          />
                        </div>
                      </div>

                      {/* Email — from Google, read-only */}
                      <div>
                        <Label
                          htmlFor="email"
                          className="flex items-center justify-between mb-2"
                        >
                          <span>Email Address</span>
                          <Badge variant="default">Verified</Badge>
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          disabled
                          className="bg-muted"
                        />
                      </div>

                      {/* WhatsApp — optional contact for shopkeeper */}
                      <div>
                        <Label htmlFor="whatsapp" className="flex items-center justify-between mb-2">
                          <span>WhatsApp <span className="text-muted-foreground text-xs">(optional)</span></span>
                        </Label>
                        <div className="flex items-center space-x-2">
                          <div className="w-28">
                            <Select value={countryCode} onValueChange={setCountryCode}>
                              <SelectTrigger>
                                <SelectValue placeholder="Code" />
                              </SelectTrigger>
                              <SelectContent>
                                {countries.map((country) => (
                                  <SelectItem key={country.code} value={country.dialCode}>
                                    {country.name} {country.dialCode}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Input
                            id="whatsapp"
                            type="tel"
                            placeholder="For order updates"
                            value={whatsapp}
                            maxLength={10}
                            onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))}
                          />
                        </div>
                      </div>
                        </>
                      )}
                    </TabsContent>
                    <TabsContent value="self" className="space-y-4">
                      {/* Self Order Fields */}
                      {!isShopkeeperVerified ? (
                        <form
                          onSubmit={
                            isShopkeeperOtpSent
                              ? handleVerifyShopkeeperOtp
                              : handleRequestShopkeeperOtp
                          }
                        >
                          <div className="space-y-2">
                            <Label htmlFor="shopkeeperWhatsApp">
                              Shopkeeper WhatsAppNumber *
                            </Label>
                            <div className="flex items-center space-x-2">
                              <div className="w-28">
                                <Select
                                  value={countryCode}
                                  onValueChange={setCountryCode}
                                  disabled={isShopkeeperOtpSent}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Code" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {countries.map((country) => (
                                      <SelectItem
                                        key={country.code}
                                        value={country.dialCode}
                                      >
                                        {country.name} {country.dialCode}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Input
                                id="shopkeeperWhatsApp"
                                type="tel"
                                placeholder="Enter number"
                                maxLength={10}
                                value={shopkeeperWhatsAppNumber}
                                onChange={(e) =>
                                  setShopkeeperWhatsAppNumber(
                                    e.target.value.replace(/\D/g, ""),
                                  )
                                }
                                disabled={isShopkeeperOtpSent}
                              />
                            </div>
                            {isShopkeeperOtpSent && (
                              <div className="space-y-2">
                                <Label htmlFor="shopkeeperOtp">OTP *</Label>
                                <Input
                                  id="shopkeeperOtp"
                                  placeholder="Enter OTP"
                                  maxLength={6}
                                  value={shopkeeperOtp}
                                  onChange={(e) =>
                                    setShopkeeperOtp(e.target.value)
                                  }
                                />
                              </div>
                            )}
                            <Button
                              type="submit"
                              className="w-full"
                              disabled={
                                isShopkeeperVerifying ||
                                (isShopkeeperOtpSent &&
                                  shopkeeperOtp.length !== 6)
                              }
                            >
                              {isShopkeeperVerifying ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : isShopkeeperOtpSent ? (
                                "Verify OTP"
                              ) : (
                                "Send OTP"
                              )}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="space-y-4">
                          <div>
                            <Label
                              htmlFor="whatsapp"
                              className="flex items-center justify-between mb-2"
                            >
                              <span>WhatsApp Number *</span>
                              {whatsappVerified && (
                                <Badge variant="default">Verified</Badge>
                              )}
                            </Label>
                            <div className="flex items-center space-x-2">
                              <div className="w-28">
                                <Select
                                  value={countryCode}
                                  onValueChange={setCountryCode}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Code" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {countries.map((country) => (
                                      <SelectItem
                                        key={country.code}
                                        value={country.dialCode}
                                      >
                                        {country.name} {country.dialCode}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Input
                                id="whatsapp"
                                type="tel"
                                placeholder="Enter number"
                                maxLength={10}
                                value={whatsapp}
                                onChange={(e) =>
                                  setWhatsapp(e.target.value.replace(/\D/g, ""))
                                }
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  findUserBywhatsAppNumber(
                                    countryCode,
                                    whatsapp,
                                  )
                                }
                              >
                                {whatsappVerified ? "Validated" : "Validate"}
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="firstName">First Name *</Label>
                              <Input
                                id="firstName"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="John"
                              />
                            </div>
                            <div>
                              <Label htmlFor="lastName">Last Name *</Label>
                              <Input
                                id="lastName"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Doe"
                              />
                            </div>
                          </div>

                          <div>
                            <Label
                              htmlFor="email"
                              className="flex items-center justify-between mb-2"
                            >
                              <span>Customer Email (Optional)</span>
                            </Label>
                            <div className="flex items-center space-x-2">
                              <Input
                                id="email"
                                type="email"
                                placeholder="Enter customer email"
                                value={email}
                                onChange={(e) => {
                                  setEmail(e.target.value);
                                  setEmailVerified(false);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>

                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal ({cartCount(shopkeeperId)} items)</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Discount</span>
                      <span className="text-green-600">
                        -{formatPrice(discount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Coupon Discount</span>
                      <span className="text-green-600">
                        -{formatPrice(couponDiscount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Grand total</span>
                      <span>{formatPrice(grandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Tax ({taxPercentage}%)</span>
                      <span>{formatPrice(tax)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Delivery Fee</span>
                      <span>{formatPrice(deliveryFee)}</span>
                    </div>
                    <div className="border-t pt-3">
                      <div className="flex justify-between font-semibold text-lg">
                        <span>Total</span>
                        <span className="text-green-600">
                          {formatPrice(total)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleCheckout}
                    disabled={
                      isCheckingOut ||
                      shopCart.length === 0 ||
                      !firstName ||
                      !lastName ||
                      (orderFor === "customer" && !buyerGoogleLoggedIn) ||
                      (orderFor === "self" && !isShopkeeperVerified) ||
                      (!isSelfOrder && orderType === "pickup" && !pickupDate && !pickupTime) ||
                      (orderType === "delivery" && !deliveryAddress)
                    }
                    className="w-full"
                    size="lg"
                  >
                    {isCheckingOut ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Proceed to Payment
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Secure payment • No hidden charges
                  </p>

                  <div className="space-y-2 pt-4 border-t">
                    <Label>Available Coupons</Label>

                    {coupons.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No coupons available
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {coupons.map((coupon) => (
                          <div
                            key={coupon._id}
                            className={`flex items-center justify-between p-3 rounded-lg border transition
            ${
              appliedCoupon?._id === coupon._id
                ? "border-green-600 bg-green-50"
                : "hover:bg-muted"
            }`}
                          >
                            <div>
                              <p className="font-medium">{coupon.code}</p>
                              <p className="text-xs text-muted-foreground">
                                {coupon.discountType === "PERCENTAGE"
                                  ? `${coupon.discountPercentage}% off`
                                  : `${formatPrice(coupon.flatDiscountAmount)} off`}
                              </p>
                              {coupon.minOrderAmount && (
                                <p className="text-xs text-muted-foreground">
                                  Min order {formatPrice(coupon.minOrderAmount)}
                                </p>
                              )}
                            </div>

                            {appliedCoupon?._id === coupon._id ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={removeCoupon}
                              >
                                Remove
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="buttonOutline"
                                disabled={
                                  subtotal < (coupon.minOrderAmount || 0)
                                }
                                onClick={() => applyCoupon(coupon)}
                              >
                                Apply
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
          {/* Left: Cart Items & Order Options */}
          <div className="xl:col-span-2 space-y-6">
            {/* Cart Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <ShoppingCart className="w-5 h-5" />
                  Your Cart ({cartCount(shopkeeperId)})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {shopCart.map((item) => (
                  <div
                    key={`${item.productId}-${item.subcategoryIndex}-${item.variantIndex}`}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border rounded-lg bg-white"
                  >
                    {item.image && (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 flex-shrink-0">
                        <img
                          loading="lazy"
                          src={apiURL + item.image}
                          alt={item.productName}
                          className="w-full h-full object-cover rounded-md"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base truncate">
                        {item.productName}
                      </h3>
                      <div className="space-y-2">
                        {item.category && (
                          <p className="text-xs text-muted-foreground">
                            {item.category}
                          </p>
                        )}
                        <div className="flex flew-row gap-2">
                          {item.subcategoryName && (
                            <p className="text-xs bg-black rounded-md px-2 inline-block text-white">
                              {item.subcategoryName}
                            </p>
                          )}
                          {item.variantTitle && (
                            <p className="text-xs bg-black rounded-md px-2 inline-block text-white">
                              {item.variantTitle}
                            </p>
                          )}
                        </div>
                        {item.sku && (
                          <p className="text-xs text-muted-foreground">
                            SKU: {item.sku}
                          </p>
                        )}
                        <p className="text-sm font-medium flex items-center gap-2">
                          {item.isDiscounted && (
                            <div>
                              <span className="text-xs text-gray-400 line-through">
                                {formatPrice(item.price)}
                              </span>{" "}
                              <span className="text-green-600">
                                {formatPrice(item.discountedPrice)} each
                              </span>
                            </div>
                          )}

                          {!item.isDiscounted && (
                            <span className="text-green-600">
                              {formatPrice(item.price)} / {item.measurement}{" "}
                              each
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                      <div className="flex items-center gap-1">
                        {/* <Button
                          variant="buttonOutline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            updateQuantity(
                              shopkeeperId,
                              item.productId,
                              item.subcategoryIndex,
                              item.variantIndex,
                              item.quantity - 1,
                            )
                          }
                          disabled={item.quantity <= 1}
                        >
                          <Minus className="w-3 h-3" />
                        </Button> */}
                        {item.isDiscounted && (
                          <span className="w-20 mr-10 text-center text-sm font-medium">
                            {formatPrice(item.discountedPrice)} *{" "}
                            {item.quantity}
                          </span>
                        )}
                        {!item.isDiscounted && (
                          <span className="w-20 mr-10 text-center text-sm font-medium">
                            {formatPrice(item.price)} * {item.quantity}
                          </span>
                        )}

                        {/* <Button
                          variant="buttonOutline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            updateQuantity(
                              shopkeeperId,
                              item.productId,
                              item.subcategoryIndex,
                              item.variantIndex,
                              item.quantity + 1,
                            )
                          }
                          disabled={item.quantity >= item.inventory}
                        >
                          <Plus className="w-3 h-3" />
                        </Button> */}
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <div>
                          {item.isDiscounted ? (
                            <>
                              <div className="w-20">
                                <p className="text-xs sm:text-sm text-gray-400 line-through">
                                  {formatPrice(item.price * item.quantity)}
                                </p>

                                {/* Discounted total */}
                                <p className="font-semibold text-sm sm:text-base text-green-600">
                                  {formatPrice(
                                    item.discountedPrice * item.quantity,
                                  )}
                                </p>
                              </div>
                            </>
                          ) : (
                            <p className="font-semibold text-sm sm:text-base">
                              {formatPrice(item.price * item.quantity)}
                            </p>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            removeFromCart(
                              shopkeeperId,
                              item.productId,
                              item.subcategoryIndex,
                              item.variantIndex,
                            )
                          }
                          className="text-red-500 hover:text-red-700 h-8 w-8"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex flex-col sm:flex-row justify-between gap-2">
                  <Button
                    onClick={handleBackToStore}
                    variant="buttonOutline"
                    disabled={isNavigating}
                    className="w-full sm:w-auto"
                  >
                    {isNavigating ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ArrowLeft className="w-4 h-4 mr-2" />
                    )}
                    Back to Store
                  </Button>

                  {whatsAppNumber && (
                    <Button
                      variant="whatsApp"
                      className="w-full sm:w-auto px-3 py-2"
                    >
                      <a
                        href={`https://wa.me/${whatsAppNumber.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 transition w-full"
                      >
                        <FaWhatsapp size={18} className="shrink-0" />
                        <span className="font-medium text-xs sm:text-sm whitespace-nowrap">
                          WhatsApp Contact
                        </span>
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Order Type Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Fulfillment Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={orderType}
                  onValueChange={(val: "delivery" | "pickup") =>
                    setOrderType(val)
                  }
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full"
                >
                  {/* Pickup */}
                  <Label
                    htmlFor="pickup"
                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer w-full
      ${orderType === "pickup" ? "border-primary bg-primary/5" : ""}
    `}
                  >
                    <RadioGroupItem value="pickup" id="pickup" />
                    <Store className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <p className="font-medium">Store Pickup</p>
                      <p className="text-sm text-muted-foreground">Free</p>
                    </div>
                  </Label>

                  {/* Delivery */}
                  <Label
                    htmlFor="delivery"
                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer w-full
      ${orderType === "delivery" ? "border-primary bg-primary/5" : ""}
    `}
                  >
                    <RadioGroupItem value="delivery" id="delivery" />
                    <Truck className="w-4 h-4 text-green-600 shrink-0" />
                    <div>
                      <p className="font-medium">Home Delivery</p>
                      <p className="text-sm text-muted-foreground">
                        Delivery charges may apply
                      </p>
                    </div>
                  </Label>
                </RadioGroup>

                {orderType === "delivery" && (
                  <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Label htmlFor="street">Street Address *</Label>
                        <Input
                          id="street"
                          value={deliveryAddress.street}
                          onChange={(e) =>
                            setDeliveryAddress((prev) => ({
                              ...prev,
                              street: e.target.value,
                            }))
                          }
                          placeholder="123 Main Street"
                        />
                      </div>
                      <div>
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          value={deliveryAddress.city}
                          onChange={(e) =>
                            setDeliveryAddress((prev) => ({
                              ...prev,
                              city: e.target.value,
                            }))
                          }
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">State *</Label>
                        <Input
                          id="state"
                          value={deliveryAddress.state}
                          onChange={(e) =>
                            setDeliveryAddress((prev) => ({
                              ...prev,
                              state: e.target.value,
                            }))
                          }
                          placeholder="State"
                        />
                      </div>
                      <div>
                        <Label htmlFor="zipCode">ZIP Code *</Label>
                        <Input
                          id="zipCode"
                          value={deliveryAddress.zipCode}
                          onChange={(e) =>
                            setDeliveryAddress((prev) => ({
                              ...prev,
                              zipCode: e.target.value,
                            }))
                          }
                          placeholder="12345"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="instructions">
                          Special Instructions
                        </Label>
                        <Textarea
                          id="instructions"
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          placeholder="Any special delivery instructions"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {orderType === "pickup" && (
                  <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                    {isSelfOrder ? (
                      <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">
                          Kiosk Order — Pickup set to now
                        </span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label
                            htmlFor="pickupDate"
                            className="flex items-center gap-2"
                          >
                            <Calendar className="w-4 h-4" />
                            Pickup Date *
                          </Label>
                          <Select
                            value={pickupDate}
                            onValueChange={setPickupDate}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select date" />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailablePickupDates(
                                shopClosedFromDate,
                                shopClosedToDate,
                              ).map((date) => (
                                <SelectItem
                                  key={date.value}
                                  value={date.value}
                                  disabled={date.isClosed}
                                  className={
                                    date.isClosed ? "text-gray-400 italic" : ""
                                  }
                                  title={
                                    date.isClosed ? "Shop is closed" : undefined
                                  }
                                >
                                  {date.label}
                                  {date.isClosed && (
                                    <span className="ml-2 text-red-500">
                                      (Shop is closed)
                                    </span>
                                  )}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label
                            htmlFor="pickupTime"
                            className="flex items-center gap-2"
                          >
                            <Clock className="w-4 h-4" />
                            Pickup Time *
                          </Label>
                          <Select
                            value={pickupTime}
                            onValueChange={setPickupTime}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select time" />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailablePickupTimes().map((time) => (
                                <SelectItem key={time.value} value={time.value}>
                                  {time.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="font-semibold">Pickup Address</Label>
                      <div className="mt-1 p-3 border rounded bg-white text-sm text-muted-foreground">
                        <p>{pickupAddress}</p>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="instructions">
                        Special Instructions
                      </Label>
                      <Textarea
                        id="instructions"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Any special delivery instructions"
                        rows={3}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Order Summary */}
          <div className="xl:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Order Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs
                  value={orderFor}
                  onValueChange={(value) =>
                    setOrderFor(value as "customer" | "self")
                  }
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="customer"
                      // Disable if verified OR if a token is sitting in storage
                      disabled={
                        isShopkeeperVerified ||
                        !!sessionStorage.getItem("token")
                      }
                      onClick={getShopkeeper}
                    >
                      Customer Order
                    </TabsTrigger>
                    <TabsTrigger value="self">
                      <StoreIcon className="h-4 w-4" />
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="customer" className="space-y-4">
                    {/* Google Sign-In Gate */}
                    {!buyerGoogleLoggedIn ? (
                      <div className="text-center py-4 space-y-3">
                        <p className="text-sm text-muted-foreground">Sign in to place your order</p>
                        <Button
                          onClick={handleGoogleSignIn}
                          className="w-full"
                          variant="buttonOutline"
                        >
                          <FaGoogle className="mr-2 h-4 w-4" />
                          Continue with Google
                        </Button>
                      </div>
                    ) : (
                      <>
                    {/* Customer Order Fields — pre-filled from Google */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input
                          id="lastName"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    {/* Email — from Google, read-only */}
                    <div>
                      <Label htmlFor="email" className="flex items-center justify-between mb-2">
                        <span>Email Address</span>
                        <Badge variant="default">Verified</Badge>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        disabled
                        className="bg-muted"
                      />
                    </div>

                    {/* WhatsApp — optional contact for shopkeeper */}
                    <div>
                      <Label htmlFor="whatsapp" className="flex items-center justify-between mb-2">
                        <span>WhatsApp <span className="text-muted-foreground text-xs">(optional)</span></span>
                      </Label>
                      <div className="flex items-center space-x-2">
                        <div className="w-28">
                          <Select value={countryCode} onValueChange={setCountryCode}>
                            <SelectTrigger>
                              <SelectValue placeholder="Code" />
                            </SelectTrigger>
                            <SelectContent>
                              {countries.map((country) => (
                                <SelectItem key={country.code} value={country.dialCode}>
                                  {country.name} {country.dialCode}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Input
                          id="whatsapp"
                          type="tel"
                          maxLength={10}
                          placeholder="For order updates"
                          value={whatsapp}
                          onChange={(e) => setWhatsapp(e.target.value.replace(/\D/g, ""))}
                        />
                      </div>
                    </div>
                      </>
                    )}
                  </TabsContent>
                  <TabsContent value="self" className="space-y-4">
                    {/* Self Order Fields */}
                    {!isShopkeeperVerified ? (
                      <form
                        onSubmit={
                          isShopkeeperOtpSent
                            ? handleVerifyShopkeeperOtp
                            : handleRequestShopkeeperOtp
                        }
                      >
                        <div className="space-y-2">
                          <Label htmlFor="shopkeeperWhatsApp">
                            Shopkeeper WhatsAppNumber *
                          </Label>
                          <div className="flex items-center space-x-2">
                            <div className="w-28">
                              <Select
                                value={countryCode}
                                onValueChange={setCountryCode}
                                disabled={isShopkeeperOtpSent}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Code" />
                                </SelectTrigger>
                                <SelectContent>
                                  {countries.map((country) => (
                                    <SelectItem
                                      key={country.code}
                                      value={country.dialCode}
                                    >
                                      {country.name} {country.dialCode}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              id="shopkeeperWhatsApp"
                              type="tel"
                              maxLength={10}
                              placeholder="Enter number"
                              value={shopkeeperWhatsAppNumber}
                              onChange={(e) =>
                                setShopkeeperWhatsAppNumber(
                                  e.target.value.replace(/\D/g, ""),
                                )
                              }
                              disabled={isShopkeeperOtpSent}
                            />
                          </div>
                          {isShopkeeperOtpSent && (
                            <div className="space-y-2">
                              <Label htmlFor="shopkeeperOtp">OTP *</Label>
                              <Input
                                id="shopkeeperOtp"
                                placeholder="Enter OTP"
                                maxLength={6}
                                value={shopkeeperOtp}
                                onChange={(e) =>
                                  setShopkeeperOtp(e.target.value)
                                }
                              />
                            </div>
                          )}
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={
                              isShopkeeperVerifying ||
                              (isShopkeeperOtpSent &&
                                shopkeeperOtp.length !== 6)
                            }
                          >
                            {isShopkeeperVerifying ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isShopkeeperOtpSent ? (
                              "Verify OTP"
                            ) : (
                              "Send OTP"
                            )}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <Label
                            htmlFor="whatsapp"
                            className="flex items-center justify-between mb-2"
                          >
                            <span>WhatsApp Number *</span>
                            {whatsappVerified && (
                              <Badge variant="default">Verified</Badge>
                            )}
                          </Label>
                          <div className="flex items-center space-x-2">
                            <div className="w-28">
                              <Select
                                value={countryCode}
                                onValueChange={setCountryCode}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Code" />
                                </SelectTrigger>
                                <SelectContent>
                                  {countries.map((country) => (
                                    <SelectItem
                                      key={country.code}
                                      value={country.dialCode}
                                    >
                                      {country.name} {country.dialCode}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Input
                              id="whatsapp"
                              type="tel"
                              placeholder="Enter number"
                              maxLength={10}
                              value={whatsapp}
                              onChange={(e) => {
                                setWhatsapp(e.target.value.replace(/\D/g, ""));
                                setWhatsappVerified(false); // ✅ ADD THIS
                                setFirstName("");
                                setLastName("");
                                setEmail("");
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              disabled={whatsappVerified || !whatsapp} // ✅ disable after validated or if empty
                              onClick={() =>
                                findUserBywhatsAppNumber(countryCode, whatsapp)
                              }
                            >
                              {whatsappVerified ? "✓ Validated" : "Validate"}
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="firstName">First Name *</Label>
                            <Input
                              id="firstName"
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                              placeholder="John"
                            />
                          </div>
                          <div>
                            <Label htmlFor="lastName">Last Name *</Label>
                            <Input
                              id="lastName"
                              value={lastName}
                              onChange={(e) => setLastName(e.target.value)}
                              placeholder="Doe"
                            />
                          </div>
                        </div>

                        <div>
                          <Label
                            htmlFor="email"
                            className="flex items-center justify-between mb-2"
                          >
                            <span>Customer Email (Optional)</span>
                          </Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              id="email"
                              type="email"
                              placeholder="Enter customer email"
                              value={email}
                              onChange={(e) => {
                                setEmail(e.target.value);
                                setEmailVerified(false);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                <div className="space-y-3 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal ({cartCount(shopkeeperId)} items)</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Discount</span>
                    <span className="text-green-600">
                      -{formatPrice(discount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Coupon Discount</span>
                    <span className="text-green-600">
                      -{formatPrice(couponDiscount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Grand total</span>
                    <span>{formatPrice(grandTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Tax ({taxPercentage}%)</span>
                    <span>{formatPrice(tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Delivery Fee</span>
                    <span>{formatPrice(deliveryFee)}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total</span>
                      <span className="text-green-600">
                        {formatPrice(total)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleCheckout}
                  disabled={
                    isCheckingOut ||
                    shopCart.length === 0 ||
                    !firstName ||
                    !lastName ||
                    (orderFor === "customer" && !buyerGoogleLoggedIn) ||
                    (orderFor === "self" && !isShopkeeperVerified) ||
                    (!isSelfOrder && orderType === "pickup" && (!pickupDate || !pickupTime)) ||
                    (orderType === "delivery" && !deliveryAddress)
                  }
                  className="w-full"
                  size="lg"
                >
                  {isCheckingOut ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 mr-2" />
                      Proceed to Payment
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Secure payment • No hidden charges
                </p>

                <div className="space-y-2 pt-4 border-t">
                  <Label>Available Coupons</Label>

                  {coupons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No coupons available
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {coupons.map((coupon) => (
                        <div
                          key={coupon._id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition
            ${
              appliedCoupon?._id === coupon._id
                ? "border-green-600 bg-green-50"
                : "hover:bg-muted"
            }`}
                        >
                          <div>
                            <p className="font-medium">{coupon.code}</p>
                            <p className="text-xs text-muted-foreground">
                              {coupon.discountType === "PERCENTAGE"
                                ? `${coupon.discountPercentage}% off`
                                : `${formatPrice(coupon.flatDiscountAmount)} off`}
                            </p>
                            {coupon.minOrderAmount && (
                              <p className="text-xs text-muted-foreground">
                                Min order {formatPrice(coupon.minOrderAmount)}
                              </p>
                            )}
                          </div>

                          {appliedCoupon?._id === coupon._id ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={removeCoupon}
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="buttonOutline"
                              disabled={subtotal < (coupon.minOrderAmount || 0)}
                              onClick={() => applyCoupon(coupon)}
                            >
                              Apply
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
