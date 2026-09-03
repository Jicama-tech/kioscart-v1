import { useState, useEffect, useRef } from "react";
import { GmailPaymentSection } from "./GmailPaymentSection";
import { RazorpayDirectSetup } from "./RazorpayDirectSetup";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Store,
  Palette,
  ShoppingCart,
  CreditCard,
  Package,
  Bell,
  Globe,
  Settings,
  Upload,
  Truck,
  DollarSign,
  Mail,
  Phone,
  MapPin,
  Clock,
  Lock,
  Shield,
  ExternalLink,
  BellRing,
  CalendarIcon,
  FileText,
  Building,
  QrCode,
  Flag,
  Banknote,
  AlertCircle,
  Eye,
  EyeOff,
  ReceiptText,
  Building2,
  CheckCircle2,
  Zap,
  Info,
  ShieldCheck,
  Loader,
  Receipt,
  ReceiptTextIcon,
  CopyPlusIcon,
  Trash,
  Edit3,
  UserPlus2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ModuleGate } from "@/components/ui/ModuleGate";
import { jwtDecode } from "jwt-decode";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format } from "date-fns";
import { Calendar } from "../ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
// import { Globe, CreditCard } from "lucide-react";

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["clean"],
  ],
};

import { useSubscription } from "@/context/SubscriptionContext";
import { COUNTRY_CODES } from "@/data/countryCodes";

import { t as i18nT } from "@/i18n/t";
interface ShopkeeperSettingsProps {
  onSave?: (settings: any) => void;
}

interface Operator {
  _id?: string;
  name: string;
  email: string;
  whatsAppNumber?: string;
  shopkeeperId?: string;
  accessTabs?: string[];
}

interface Country {
  name: string;
  code: string;
  dialCode: string;
}

// Overlay wrapper to blur and disable non-profile tabs
function BlurWrapper({
  children,
  label = "In development",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <span className="rounded-full bg-black/60 text-white text-xs md:text-sm px-3 py-1 shadow">
          {label}
        </span>
      </div>
      <div className="blur-sm pointer-events-none select-none">{children}</div>
    </div>
  );
}

// Wraps a section that's not in the active subscription. Renders the content
// blurred + non-interactive with an "Upgrade" pill overlay so the shopkeeper
// can see what they're missing instead of having it hidden entirely.
function LockedSection({
  locked,
  label,
  onUpgrade,
  children,
}: {
  locked: boolean;
  label: string;
  onUpgrade: () => void;
  children: React.ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative space-y-4">
      <div aria-hidden className="opacity-40 blur-[2px] pointer-events-none select-none space-y-4">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-card shadow-md border border-border">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{label}</span>
          <button
            type="button"
            onClick={onUpgrade}
            className="text-xs font-semibold text-indigo-600 hover:underline"
          >
            {i18nT("Upgrade")}
          </button>
        </div>
      </div>
    </div>
  );
}

const COUNTRIES = [
  {
    code: "IN",
    name: "India",
    countryCode: "+91",
    docType: "GST",
    transactionLimit: "₹100,000",
    contactEmail: "support@kioscart.com",
    contactPhone: "+91-XXX-XXX-XXXX",
  },
  {
    code: "SG",
    name: "Singapore",
    countryCode: "+65",
    docType: "UEN",
    transactionLimit: "SGD 50,000",
    contactEmail: "support@kioscart.com",
    contactPhone: "+65-XXXX-XXXX",
  },
];

export function ShopkeeperSettings({ onSave }: ShopkeeperSettingsProps) {
  const { isModuleEnabled } = useSubscription();
  const { toast } = useToast();
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);
  const [paymentQrPreview, setPaymentQrPreview] = useState<string | null>(null);
  const apiURL = __API_URL__;

  // Country codes for WhatsApp
  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countryCode, setCountryCode] = useState("+91");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState<string | null>(null);

  const [operators, setOperators] = useState<Operator[]>([]);
  const [operatorDialogOpen, setOperatorDialogOpen] = useState(false);
  const [editingOperatorIndex, setEditingOperatorIndex] = useState<
    number | null
  >(null);
  // Keep in sync with the dashboard's NAVIGATION_ITEMS ids so operators can be
  // granted access to every tab the shopkeeper sees (incl. Support). "chat" is
  // the exception: it is no longer a sidebar tab, but the id still gates the
  // floating AI assistant, so keep it in this list.
  const ALL_TABS = [
    "chat",
    "dashboard",
    "orders",
    "products",
    "crm",
    "kiosk",
    "storefront",
    "settings",
    "expenses",
    "suppliers",
    "support",
  ];
  const TAB_LABELS: Record<string, string> = {
    chat: "AI Assistant (chat bubble)",
    dashboard: "Dashboard",
    orders: "Orders & Payments",
    products: "Products",
    crm: "CRM / Customers",
    kiosk: "Kiosk Mode",
    storefront: "Storefront",
    settings: "Settings",
    expenses: "Expenses",
    suppliers: "Suppliers",
    support: "Support",
  };

  const [operatorForm, setOperatorForm] = useState<{
    name: string;
    operatorCountryCode: string;
    operatorEmail: string;
    operatorLocalNumber: string;
    accessTabs: string[];
  }>({
    name: "",
    operatorCountryCode: "+91",
    operatorEmail: "",
    operatorLocalNumber: "",
    accessTabs: [...ALL_TABS],
  });
  const [isSavingOperators, setIsSavingOperators] = useState(false);

  const APPYFLOW_KEY = import.meta.env.VITE_APPYFLOW_KEY_SECRET;

  const [selectedCountry, setSelectedCountry] = useState("IN");
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState({
    shopName: "",
    ownerName: "",
    email: "",
    phone: "",
    address: "",
    description: "",
    GSTNumber: "",
    UENNumber: "",
  });

  const currentCountry = COUNTRIES.find((c) => c.code === selectedCountry);

  const [subscription, setSubscription] = useState<any>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [switchingPlanId, setSwitchingPlanId] = useState<string | null>(null);

  const openChangePlan = async () => {
    setChangePlanOpen(true);
    setLoadingPlans(true);
    try {
      const res = await fetch(`${apiURL}/plans/get-plans?active=true`);
      if (res.ok) {
        const data = await res.json();
        setAvailablePlans(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPlans(false);
    }
  };

  const switchToPlan = async (planId: string) => {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) return;
      const decoded: any = jwtDecode(token);
      const id = decoded?.sub;
      if (!id) return;

      setSwitchingPlanId(planId);
      const res = await fetch(
        `${apiURL}/shopkeepers/add-subscription-plan/${id}/plan/${planId}`,
        { method: "PATCH", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Failed to switch plan");

      const subRes = await fetch(`${apiURL}/shopkeepers/subscription/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (subRes.ok) {
        const data = await subRes.json();
        setSubscription(data);
      }
      setChangePlanOpen(false);
      toast({ duration: 5000, title: "✅ Plan switched successfully" });
    } catch (err: any) {
      toast({ duration: 5000, title: i18nT("Failed to switch plan"), description: err.message });
    } finally {
      setSwitchingPlanId(null);
    }
  };

  const [gstVerified, setGstVerified] = useState(false);
  const [gstVerifying, setGstVerifying] = useState(false);
  const [gstError, setGstError] = useState("");
  const [uenVerified, setUenVerified] = useState(false);
  const [uenVerifying, setUenVerifying] = useState(false);
  const [uenError, setUenError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gstDetails, setGstDetails] = useState(null);
  const [gstValid, setGstValid] = useState<boolean | null>(null);
  const [ueValid, setUeValid] = useState<boolean | null>(null);

  // Profile (aligned to Shopkeeper Registration fields)
  const [shopProfile, setShopProfile] = useState({
    _id: "",
    ownerName: "",
    shopName: "",
    email: "",
    businessEmail: "",
    whatsappNumber: "",
    phone: "",
    address: "",
    description: "",
    businessCategory: "",
    country: selectedCountry,
    receiptType: "58MM",
    whatsAppQR: false,
    instagramQR: false,
    dynamicQR: false,
    whatsAppQRNumber: "",
    instagramHandle: "",
    GSTNumber: "",
    UENNumber: "",
    hasDocVerification: false,
    paymentURL: "",
    taxPercentage: 0,
    discountPercentage: 0,
    deliveryEnabled: true,
    deliveryRules: [] as { minSubtotal: number; fee: number }[],
    shopClosedFromDate: "",
    shopClosedToDate: "",
    termsAndConditions: "",
    pickupDateRequired: true,
    pickupMinDays: 2,
    pickupMessage: "",
    voiceAccessEnabled: false,
    businessHours: {
      monday: { open: "09:00", close: "18:00", closed: false },
      tuesday: { open: "09:00", close: "18:00", closed: false },
      wednesday: { open: "09:00", close: "18:00", closed: false },
      thursday: { open: "09:00", close: "18:00", closed: false },
      friday: { open: "09:00", close: "20:00", closed: false },
      saturday: { open: "10:00", close: "20:00", closed: false },
      sunday: { open: "12:00", close: "17:00", closed: false },
    },
  });

  const [hasDocVerification, setHasDocVerified] = useState(false);

  const [shopClosedFromDate, setShopClosedFromDate] = useState<
    Date | undefined
  >(
    shopProfile.shopClosedFromDate
      ? new Date(shopProfile.shopClosedFromDate)
      : undefined,
  );
  const [shopClosedToDate, setShopClosedToDate] = useState<Date | undefined>(
    shopProfile.shopClosedToDate
      ? new Date(shopProfile.shopClosedToDate)
      : undefined,
  );

  const [bankInfo, setBankInfo] = useState({
    // India
    panNumber: "",
    gstNumber: "",

    // Singapore
    uenNumber: "",

    // Both
    accountHolder: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    accountType: "savings",
    isVerified: false,
  });

  const [showPan, setShowPan] = useState(false);
  const [showUen, setShowUen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [isSavingBank, setIsSavingBank] = useState(false);

  // const handleSaveBankInfo = async () => {
  //   setIsSavingBank(true);
  //   try {
  //     // Encrypt before sending
  //     const encrypted = await encryptSensitiveData(bankInfo);

  //     await api.post(`/shopkeepers/${shopkeeperId}/bank-info`, encrypted);

  //     setBankInfo((prev) => ({ ...prev, isVerified: true }));
  //     toast({ duration: 5000, title: i18nT("Bank details saved securely!") });
  //   } finally {
  //     setIsSavingBank(false);
  //   }
  // };

  const handleFromDateChange = (date: Date | undefined) => {
    setShopClosedFromDate(date);

    setShopProfile((p) => {
      // if no date, clear both in profile
      if (!date) {
        return {
          ...p,
          shopClosedFromDate: "",
          shopClosedToDate: "",
        };
      }

      // if current to-date is <= new from-date, clear to-date
      let newToDateStr = p.shopClosedToDate;
      if (shopClosedToDate && shopClosedToDate <= date) {
        setShopClosedToDate(undefined);
        newToDateStr = "";
      }

      return {
        ...p,
        shopClosedFromDate: date.toISOString(), // store as string
        shopClosedToDate: newToDateStr,
      };
    });
  };

  const handleToDateChange = (date: Date | undefined) => {
    setShopClosedToDate(date);

    setShopProfile((p) => ({
      ...p,
      shopClosedToDate: date ? date.toISOString() : "",
    }));
  };

  // Calculate minimum date for "To Date" (From Date + 1 day)
  const getMinToDate = () => {
    if (!shopClosedFromDate) return new Date();

    const d = new Date(shopClosedFromDate);
    d.setDate(d.getDate() + 1);
    return d;
  };

  useEffect(() => {
    setCountries(
      COUNTRY_CODES.map((c) => ({
        name: c.name,
        code: c.code,
        dialCode: c.dial_code,
      })),
    );
    setLoadingCountries(false);
  }, []);

  const handleVerifyGST = async (GSTnumber: string) => {
    try {
      setLoading(true);

      const gstin = GSTnumber?.trim().toUpperCase();
      if (!gstin) {
        toast({
          duration: 5000,
          title: i18nT("Error"),
          description: i18nT("GST Number is required"),
        });
        return;
      }

      if (!APPYFLOW_KEY) {
        toast({
          duration: 5000,
          title: i18nT("Config error"),
          description: i18nT("AppyFlow API key not configured"),
        });
        return;
      }

      const url = `https://appyflow.in/api/verifyGST?gstNo=${encodeURIComponent(
        gstin,
      )}&key_secret=${encodeURIComponent(APPYFLOW_KEY)}`;

      const response = await fetch(url);
      if (!response.ok) {
        toast({
          duration: 5000,
          title: i18nT("Verification failed"),
          description: `API error: ${response.status}`,
        });
        setGstValid(false);
        return;
      }

      const data = await response.json();

      if (data?.taxpayerInfo?.sts === "Active" || data?.is_gst_valid === true) {
        setGstValid(true);
        setGstDetails(data);

        toast({
          duration: 5000,
          title: i18nT("GST Verified"),
          description: `Registered name: ${
            data.taxablePersonName || data.taxpayerInfo?.tradeNam || gstin
          }`,
        });

        // Auto-fill address from GST data
        const addr = data?.taxpayerInfo?.pradr?.addr || data?.pradr?.addr;
        const fullAddress = [
          addr?.bnm,
          addr?.flno,
          addr?.st,
          addr?.loc,
          addr?.dst,
          addr?.stcd,
          addr?.pncd,
        ]
          .filter(Boolean)
          .join(", ");

        setShopProfile((prev) => ({
          ...prev,
          address: fullAddress || prev.address,
          ownerName: data?.taxpayerInfo?.lgnm || prev.ownerName,
          shopName: data?.taxpayerInfo?.tradeNam || prev.shopName,
          isGSTVerified: true,
          hasDocVerification: true,
        }));
      } else {
        setGstValid(false);
        toast({
          duration: 5000,
          title: i18nT("Invalid GST"),
          description: i18nT("GST number is not valid or inactive"),
        });
      }
    } catch (error) {
      console.error("GST verify error", error);
      toast({
        duration: 5000,
        title: i18nT("Error"),
        description: i18nT("Something went wrong while verifying GST"),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyUEN = async () => {
    try {
      setUenVerifying(true);
      setUenError("");

      const response = await fetch(`${apiURL}/verify/uen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          uenNumber: shopProfile.UENNumber,
        }),
      });

      if (!response.ok) {
        throw new Error("Invalid or inactive UEN number");
      }

      setUenVerified(true);
      toast({
        duration: 5000,
        title: "✓ UEN Verified",
        description: i18nT("Your UEN number has been verified successfully"),
      });
    } catch (error: any) {
      setUenError(error.message || "Failed to verify UEN");
      toast({
        duration: 5000,
        title: i18nT("Verification Failed"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUenVerifying(false);
    }
  };

  // Parse existing whatsapp number into country code and local number
  useEffect(() => {
    if (shopProfile.whatsappNumber) {
      // Try to match country code from existing number
      for (const country of countries) {
        if (shopProfile.whatsappNumber.startsWith(country.dialCode)) {
          setCountryCode(country.dialCode);
          setWhatsappNumber(
            shopProfile.whatsappNumber.slice(country.dialCode.length),
          );
          setWhatsappVerified(true); // Assume existing number is verified
          return;
        }
      }
      // Fallback: assume it's a full number with default country code
      setWhatsappNumber(shopProfile.whatsappNumber);
      setWhatsappVerified(true);
    }
  }, [shopProfile.whatsappNumber, countries]);

  // Get full whatsapp number
  const getFullWhatsappNumber = () => {
    return countryCode + whatsappNumber;
  };

  // Send OTP
  const handleSendOtp = async () => {
    if (!whatsappNumber) {
      toast({
        duration: 5000,
        title: i18nT("Please enter WhatsApp number"),
        variant: "destructive",
      });
      return;
    }

    setSendingOtp(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        toast({
          duration: 5000,
          title: i18nT("Please login first"),
          variant: "destructive",
        });
        return;
      }

      const decoded = jwtDecode<{ sub: string }>(token);
      const userId = decoded.sub;

      const res = await fetch(`${apiURL}/otp/send-whatsapp-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          whatsappNumber: getFullWhatsappNumber(),
        }),
      });

      if (!res.ok) throw new Error("Failed to send WhatsApp OTP");

      const data = await res.json();
      if (data.success) {
        setOtpSent(true);
        toast({
          duration: 5000,
          title: i18nT("OTP Sent"),
          description: i18nT("Please check WhatsApp for OTP"),
        });
      } else if (data.alreadyVerified) {
        setWhatsappVerified(true);
        toast({
          duration: 5000,
          title: i18nT("Already Verified"),
          description: data.message,
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      toast({
        duration: 5000,
        title: i18nT("Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSendingOtp(false);
    }
  };

  // Verify OTP
  const handleVerifyOtp = async () => {
    if (!otp) {
      toast({
        duration: 5000,
        title: i18nT("Please enter OTP"),
        variant: "destructive",
      });
      return;
    }

    setVerifyingOtp(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        toast({
          duration: 5000,
          title: i18nT("Please login first"),
          variant: "destructive",
        });
        return;
      }

      const decoded = jwtDecode<{ sub: string }>(token);
      const userId = decoded.sub;

      const res = await fetch(`${apiURL}/users/verify-whatsapp-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          whatsAppNumber: getFullWhatsappNumber(),
          otp,
        }),
      });

      if (!res.ok) throw new Error("Failed to verify WhatsApp OTP");

      const data = await res.json();
      if (data.success) {
        setWhatsappVerified(true);
        setOtpSent(false);
        setOtp("");
        // Update profile with verified number
        setShopProfile((prev) => ({
          ...prev,
          whatsappNumber: getFullWhatsappNumber(),
        }));
        toast({
          duration: 5000,
          title: i18nT("WhatsApp Verified"),
          description: i18nT("Number verified successfully"),
        });
      } else if (data.alreadyVerified) {
        setWhatsappVerified(true);
        toast({
          duration: 5000,
          title: i18nT("Already Verified"),
          description: data.message,
        });
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      toast({
        duration: 5000,
        title: i18nT("Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setVerifyingOtp(false);
    }
  };

  const onPaymentQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        duration: 5000,
        title: i18nT("Invalid file"),
        description: i18nT("Only images are allowed"),
        variant: "destructive",
      });
      return;
    }
    setPaymentQrFile(file);
    setPaymentQrPreview(URL.createObjectURL(file));
  };

  const removePaymentQr = () => {
    if (paymentQrPreview) URL.revokeObjectURL(paymentQrPreview);
    setPaymentQrPreview(null);
    setPaymentQrFile(null);
  };

  // Branding Settings
  const [branding, setBranding] = useState({
    primaryColor: "#3b82f6",
    secondaryColor: "#64748b",
    accentColor: "#f59e0b",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
    fontFamily: "Inter",
    showLogo: true,
    customCSS: "",
  });

  // Product Settings
  const [productSettings, setProductSettings] = useState({
    defaultCurrency: "USD",
    taxRate: 8.5,
    lowStockThreshold: 10,
    autoPublish: true,
    requireApproval: false,
    allowBackorders: false,
    trackInventory: true,
    showOutOfStock: true,
    enableReviews: true,
    enableWishlist: true,
    productImageSize: "medium",
    enableVariants: true,
    sku: { autoGenerate: true, prefix: "EP", startNumber: 1000 },
  });

  // Cart & Checkout Settings
  const [cartSettings, setCartSettings] = useState({
    enableGuestCheckout: true,
    requireAccountForPurchase: false,
    cartSessionTimeout: 30,
    enableAbandonedCartRecovery: true,
    abandonedCartDelay: 60,
    maxCartItems: 50,
    enableCoupons: true,
    enableDiscounts: true,
    minimumOrderAmount: 0,
    freeShippingThreshold: 50,
    enableMultiplePaymentMethods: true,
    enableSaveForLater: true,
    enableQuickBuy: true,
    showRecommendations: true,
  });

  // Payment Settings
  const [paymentSettings, setPaymentSettings] = useState({
    acceptCreditCards: true,
    acceptDebitCards: true,
    acceptPayPal: true,
    acceptApplePay: false,
    acceptGooglePay: false,
    acceptCrypto: false,
    enableInstallments: false,
    paymentProcessingFee: 2.9,
    refundPolicy: "30 days",
    autoRefund: false,
  });

  const [paymentMethods, setPaymentMethods] = useState({
    razorpayCards: false,
    staticQR: true,
    dynamicQR: false,
    // ...other methods
  });

  // Tracks Razorpay Direct configuration + enabled state for this shopkeeper.
  // configured = keys are saved; enabled = customer-facing toggle is ON.
  // Toggle ON-without-keys is rejected at Save time.
  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [razorpayToggleSaving, setRazorpayToggleSaving] = useState(false);
  // Ref mirrors razorpayConfigured so the toggle handler always sees the
  // latest value (closure-captured state would go stale across renders).
  const razorpayConfiguredRef = useRef(false);

  useEffect(() => {
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (!token) return;
    fetch(`${__API_URL__}/shopkeepers/razorpay/direct/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.configured && d?.mode === "direct") {
          setRazorpayConfigured(true);
          razorpayConfiguredRef.current = true;
          // Reflect persisted enabled state (defaults to true on existing data).
          setPaymentMethods((prev) => ({
            ...prev,
            razorpayCards: d.enabled !== false,
          }));
        }
      })
      .catch(() => {});
  }, []);

  async function persistRazorpayToggle(enabled: boolean) {
    const token =
      sessionStorage.getItem("token") || localStorage.getItem("token");
    if (!token) return;
    setRazorpayToggleSaving(true);
    try {
      const res = await fetch(
        `${__API_URL__}/shopkeepers/razorpay/direct/toggle`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ enabled }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        // Revert UI state on backend rejection.
        setPaymentMethods((prev) => ({ ...prev, razorpayCards: !enabled }));
        toast({
          duration: 5000,
          title: i18nT("Could not change setting"),
          description: data?.message || "Try again",
          variant: "destructive",
        });
        return;
      }
      toast({
        duration: 3500,
        title: enabled ? "Card payments enabled" : "Card payments disabled",
        description: enabled
          ? "Customers can now pay with cards/UPI/netbanking."
          : "Customers will only see the manual QR option.",
      });
    } catch (e: any) {
      setPaymentMethods((prev) => ({ ...prev, razorpayCards: !enabled }));
      toast({
        duration: 5000,
        title: i18nT("Network error"),
        description: e?.message || "Could not save toggle.",
        variant: "destructive",
      });
    } finally {
      setRazorpayToggleSaving(false);
    }
  }

  const [razorpaySettings, setRazorpaySettings] = useState({
    isConnected: false,
    razorpayAccountId: "",
    businessName: "",
    businessType: "proprietorship",
    accountHolderName: "",
    bankAccountNumber: "",
    bankName: "",
    ifscCode: "",
    panNumber: "",
    gstNumber: "",
    uenNumber: "",
    businessEmail: "",
    businessPhone: "",
    consent: false,
    enableCards: true,
    enableUpi: true,
    enableNetbanking: true,
    enableWallets: false,
  });

  const [isConnectingRazorpay, setIsConnectingRazorpay] = useState(false);

  // const handleConnectRazorpay = async () => {
  //   setIsConnectingRazorpay(true);
  //   try {
  //     // POST razorpaySettings + shopProfile.id to your backend
  //     // Backend will call Razorpay partner API to create account
  //     await api.post(`/payments/razorpay/setup`, {
  //       shopkeeperId: shopProfile.id,
  //       data: razorpaySettings,
  //     });
  //     // Then mark as connected or pending based on response
  //     setRazorpaySettings((prev) => ({
  //       ...prev,
  //       isConnected: true,
  //       razorpayAccountId: "RZP_FAKE_ID", // replace with real id from API
  //     }));
  //   } finally {
  //     setIsConnectingRazorpay(false);
  //   }
  // };

  // Shipping Settings
  const [shippingSettings, setShippingSettings] = useState({
    enableShipping: true,
    freeShippingThreshold: 50,
    defaultShippingCost: 5.99,
    expeditedShipping: true,
    expeditedCost: 12.99,
    internationalShipping: false,
    estimatedDelivery: "3-5 business days",
    trackingEnabled: true,
    packageWeight: 1,
    packageDimensions: { length: 12, width: 8, height: 4 },
  });

  const [coupons, setCoupons] = useState<any[]>([]);

  const [openCouponDialog, setOpenCouponDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  const [coupon, setCoupon] = useState<any>({
    code: "",
    discountType: "PERCENTAGE",
    discountPercentage: "",
    flatDiscountAmount: "",
    minOrderAmount: "",
    maxUsage: "",
    expiryDate: "",
    appliesTo: "GLOBAL",
    isActive: true,
  });

  const resetCoupon = () => {
    setCoupon({
      code: "",
      discountType: "PERCENTAGE",
      discountPercentage: "",
      flatDiscountAmount: "",
      minOrderAmount: "",
      maxUsage: "",
      expiryDate: "",
      appliesTo: "GLOBAL",
      isActive: true,
    });
  };

  const handleAddCoupon = () => {
    resetCoupon();
    setIsEditMode(false);
    setOpenCouponDialog(true);
  };

  const handleEditCoupon = (data: any) => {
    setCoupon({
      ...data,
      expiryDate: data.expiryDate?.split("T")[0],
    });
    setIsEditMode(true);
    setOpenCouponDialog(true);
  };

  const today = new Date().toISOString().split("T")[0];

  const handleChange = (key: string, value: string | number | boolean) => {
    setCoupon((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const createCoupon = async (payload: any) => {
    const res = await fetch(`${apiURL}/coupons/create-coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to create coupon");
    }

    return res.json();
  };

  const updateCoupon = async (id: string, payload: any) => {
    const res = await fetch(`${apiURL}/coupons/update-coupon/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Failed to update coupon");
    }

    return res.json();
  };

  const handleSubmitCoupon = async () => {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Please login to continue");
      const decoded = jwtDecode<{ sub: string }>(token);
      const shopkeeperId = decoded.sub;
      const payload = {
        code: coupon.code,
        shopkeeperId: shopkeeperId,
        discountType: coupon.discountType,

        discountPercentage:
          coupon.discountType === "PERCENTAGE"
            ? Number(coupon.discountPercentage)
            : undefined,

        flatDiscountAmount:
          coupon.discountType === "FLAT"
            ? Number(coupon.flatDiscountAmount)
            : undefined,

        minOrderAmount: coupon.minOrderAmount
          ? Number(coupon.minOrderAmount)
          : undefined,

        maxUsage: coupon.maxUsage ? Number(coupon.maxUsage) : undefined,

        expiryDate: coupon.expiryDate ? new Date(coupon.expiryDate) : undefined,

        isActive: true,
        appliesTo: "SHOPKEEPER",
      };

      if (isEditMode && coupon._id) {
        await updateCoupon(coupon._id, payload);
      } else {
        await createCoupon(payload);
      }

      setOpenCouponDialog(false);
      setCoupons((prev) => [
        ...prev.filter((c) => c._id !== coupon._id),
        coupon,
      ]);
    } catch (error: any) {
      console.error("❌ Coupon Error:", error.message);
      alert(error.message);
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    try {
      const res = await fetch(`${apiURL}/coupons/delete-coupon/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete coupon");
      }
      setCoupons((prev) => prev.filter((c) => c._id !== id));
    } catch (error: any) {
      console.error("❌ Delete Coupon Error:", error.message);
      alert(error.message);
    }
  };

  const handleToggleActiveCoupon = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`${apiURL}/coupons/update-coupon/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to toggle coupon");
      }
      setCoupons((prev) =>
        prev.map((c) => (c._id === id ? { ...c, isActive } : c)),
      );
    } catch (error: any) {
      console.error("❌ Toggle Coupon Error:", error.message);
      alert(error.message);
    }
  };

  // ✅ Fetch operators from dedicated endpoint
  const fetchOperators = async (shopkeeperId: string, token: string) => {
    try {
      const res = await fetch(
        `${apiURL}/operators/get-by-shopkeeper/${shopkeeperId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) return; // empty list is fine
      const json = await res.json();
      setOperators(json?.data ?? []);
    } catch (err) {
      console.error("Failed to fetch operators", err);
    }
  };

  // ✅ Create operator via POST
  const handleSubmitOperator = async () => {
    // Operators sign in with email, so name + email are the required identity.
    if (!operatorForm.name.trim() || !operatorForm.operatorEmail.trim()) {
      toast({
        duration: 3000,
        title: i18nT("Name and email are required"),
        variant: "destructive",
      });
      return;
    }

    setIsSavingOperators(true);
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Please login");
      const decoded = jwtDecode<{ sub: string }>(token);
      const shopkeeperId = decoded.sub;

      const isEditing = editingOperatorIndex !== null;
      const editingOperator = isEditing
        ? operators[editingOperatorIndex!]
        : null;

      const url = isEditing
        ? `${apiURL}/operators/update-operator/${editingOperator!._id}`
        : `${apiURL}/operators/create-by-shopkeeper/${shopkeeperId}`;

      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: operatorForm.name,
          email: operatorForm.operatorEmail,
          accessTabs: operatorForm.accessTabs,
          shopkeeperId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save operator");
      }

      await fetchOperators(shopkeeperId, token);
      toast({
        duration: 3000,
        title: isEditing ? "Operator updated" : "Operator added",
      });
      setOperatorDialogOpen(false);
      setOperatorForm({
        name: "",
        operatorCountryCode: "+91",
        operatorEmail: "",
        operatorLocalNumber: "",
        accessTabs: [...ALL_TABS],
      });
      setEditingOperatorIndex(null);
    } catch (err: any) {
      toast({
        duration: 5000,
        title: i18nT("Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingOperators(false);
    }
  };

  // ✅ Delete operator via DELETE
  const handleDeleteOperator = async (operatorId: string) => {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) throw new Error("Please login");
      const decoded = jwtDecode<{ sub: string }>(token);
      const shopkeeperId = decoded.sub;

      const res = await fetch(`${apiURL}/operators/delete-operator/${operatorId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete operator");
      }

      await fetchOperators(shopkeeperId, token);
      toast({ duration: 3000, title: i18nT("Operator deleted") });
    } catch (err: any) {
      toast({
        duration: 5000,
        title: i18nT("Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Notification Settings
  const [notifications, setNotifications] = useState({
    orderReceived: true,
    lowStock: true,
    // newCustomer: true,
    // productReview: true,
    // refundRequest: true,
    emailNotifications: true,
    // smsNotifications: false,
    // pushNotifications: true,
    dailyReports: true,
    weeklyReports: true,
  });

  // Store Front Settings
  const [storeFront, setStoreFront] = useState({
    customDomain: "",
    enableCustomDomain: false,
    seoTitle: "KiosCart Shop",
    seoDescription:
      "Discover premium products at our KiosCart store",
    socialMediaLinks: {
      facebook: "",
      instagram: "",
      twitter: "",
      linkedin: "",
    },
    enableChat: true,
    enableWishlist: true,
    showRecentlyViewed: true,
    enableSearch: true,
    enableFilters: true,
    productsPerPage: 20,
  });

  // const [paymentMethods, setPaymentMethods] = useState({
  //   staticQR: false,
  //   dynamicQR: false,
  //   cardPayments: false,
  // });

  // Stripe (kept as-is)
  const [stripeSettings, setStripeSettings] = useState({
    isConnected: false,
    stripeAccountId: null,
    accountHolder: "",
    panNumber: "",
    gstNumber: "",
    uenNumber: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
  });

  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  const handleSave = async () => {
    try {
      // Guard: Card Payments toggle ON but Razorpay keys never saved.
      if (paymentMethods.razorpayCards && !razorpayConfigured) {
        toast({
          duration: 6000,
          title: i18nT("Razorpay not configured"),
          description: i18nT("Enter your Razorpay Key ID and Secret in the Razorpay Payment Setup section, then click Save & Verify before saving the page."),
          variant: "destructive",
        });
        return;
      }

      const token = sessionStorage.getItem("token");
      if (!token) {
        toast({
          duration: 5000,
          title: i18nT("Error"),
          description: i18nT("Please login"),
          variant: "destructive",
        });
        return;
      }

      type JwtPayload = { sub?: string; [k: string]: any };
      const decoded = jwtDecode<JwtPayload>(token);
      const id = decoded?.sub;
      if (!id) {
        toast({
          duration: 5000,
          title: i18nT("Error"),
          description: i18nT("Invalid session (no id)"),
          variant: "destructive",
        });
        return;
      }

      const fd = new FormData();
      // Optional textual fields to update:
      fd.append("ownerName", shopProfile.ownerName || "");
      fd.append("shopName", shopProfile.shopName || "");
      fd.append("email", shopProfile.email || "");
      fd.append("businessEmail", shopProfile.businessEmail || "");
      fd.append("termsAndConditions", shopProfile.termsAndConditions || "");
      fd.append("pickupDateRequired", String(shopProfile.pickupDateRequired));
      fd.append("pickupMinDays", String(shopProfile.pickupMinDays));
      fd.append("pickupMessage", shopProfile.pickupMessage || "");
      fd.append("voiceAccessEnabled", String(shopProfile.voiceAccessEnabled));
      fd.append("whatsappNumber", getFullWhatsappNumber() || "");
      fd.append("taxPercentage", shopProfile.taxPercentage.toString() || "");
      fd.append("deliveryEnabled", String(shopProfile.deliveryEnabled));
      fd.append(
        "deliveryRules",
        JSON.stringify(
          (shopProfile.deliveryRules || [])
            .filter((r: any) => Number.isFinite(r.minSubtotal) && Number.isFinite(r.fee))
            .map((r: any) => ({ minSubtotal: Number(r.minSubtotal) || 0, fee: Number(r.fee) || 0 })),
        ),
      );
      fd.append(
        "discountPercentage",
        shopProfile.discountPercentage.toString() || "",
      );

      fd.append("phone", shopProfile.phone || "");
      fd.append("address", shopProfile.address || "");
      fd.append("description", shopProfile.description || "");
      fd.append("GSTNumber", shopProfile.GSTNumber || "");
      fd.append(
        "hasDocVerification",
        shopProfile.hasDocVerification.toString(),
      );
      fd.append("receiptType", shopProfile.receiptType);
      fd.append("UENNumber", shopProfile.UENNumber || "");
      fd.append("whatsAppQR", shopProfile.whatsAppQR.toString());
      fd.append("instagramQR", shopProfile.instagramQR.toString());
      fd.append("dynamicQR", shopProfile.dynamicQR.toString());
      fd.append("whatsAppQRNumber", shopProfile.whatsAppQRNumber || "");
      fd.append("instagramHandle", shopProfile.instagramHandle || "");
      fd.append("country", selectedCountry);
      fd.append("businessCategory", shopProfile.businessCategory || "");
      if (shopClosedFromDate) {
        fd.append("shopClosedFromDate", shopClosedFromDate.toISOString());
      }
      if (shopClosedToDate) {
        fd.append("shopClosedToDate", shopClosedToDate.toISOString());
      }

      // File
      if (paymentQrFile) fd.append("paymentURL", paymentQrFile);

      const res = await fetch(`${apiURL}/shopkeepers/profile/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          // Do NOT set Content-Type manually; let the browser set multipart boundary
        },
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Failed to update profile: ${res.status} ${txt}`);
      }

      const json = await res.json().catch(() => ({}));
      const d = json?.data || json;

      setShopProfile((p) => ({
        ...p,
        ownerName: d?.name ?? p.ownerName,
        shopName: d?.shopName ?? p.shopName,
        email: d?.email ?? p.email,
        businessEmail: d?.businessEmail ?? p.businessEmail,
        whatsappNumber: d?.whatsappNumber ?? p.whatsappNumber,
        taxPercentage: d?.taxPercentage ?? p.taxPercentage,
        discountPercentage: d?.discountPercentage ?? p.discountPercentage,
        deliveryEnabled: d?.deliveryEnabled ?? p.deliveryEnabled ?? true,
        deliveryRules: Array.isArray(d?.deliveryRules) ? d.deliveryRules : (p.deliveryRules || []),
        whatsAppQR: d?.whatsAppQR ?? p.whatsAppQR,
        instagramQR: d?.instagramQR ?? p.instagramQR,
        dynamicQR: d?.dynamicQR ?? p.dynamicQR,
        whatsAppQRNumber: d?.whatsAppQRNumber ?? p.whatsAppQRNumber,
        instagramHandle: d?.instagramHandle ?? p.instagramHandle,
        phone: d?.phone ?? p.phone,
        address: d?.address ?? p.address,
        description: d?.description ?? p.description,
        receiptType: d?.receiptType ?? p.receiptType,
        termsAndConditions: d?.termsAndConditions ?? p.termsAndConditions,
        businessCategory: d?.businessCategory ?? p.businessCategory,
        paymentURL: d?.paymentURL ?? p.paymentURL,
        pickupDateRequired: d?.pickupDateRequired ?? p.pickupDateRequired,
        pickupMinDays: d?.pickupMinDays ?? p.pickupMinDays,
        pickupMessage: d?.pickupMessage ?? p.pickupMessage,
        voiceAccessEnabled: d?.voiceAccessEnabled ?? p.voiceAccessEnabled,
      }));

      if (paymentQrPreview) {
        URL.revokeObjectURL(paymentQrPreview);
        setPaymentQrPreview(null);
        setPaymentQrFile(null);
      }

      toast({
        duration: 5000,
        title: i18nT("Saved"),
        description: i18nT("Profile updated successfully"),
      });
    } catch (e: any) {
      console.error("Save profile error", e);
      toast({
        duration: 5000,
        title: i18nT("Error"),
        description: e.message || "Failed to save profile",
        variant: "destructive",
      });
    }
  };

  // const handleSaveStripe = async () => {
  //   setIsStripeLoading(true);
  //   try {
  //     const {
  //       data: { user },
  //     } = await supabase.auth.getUser();
  //     if (!user) throw new Error("Not authenticated");
  //     const { error } = await supabase.from("stripe_configs").upsert({
  //       user_id: user.id,
  //       role: "shopkeeper",
  //       stripe_secret_key: stripeSettings.secretKey,
  //       stripe_publishable_key: stripeSettings.publishableKey,
  //       is_live_mode: stripeSettings.isLiveMode,
  //       is_active: stripeSettings.isActive,
  //     });
  //     if (error) throw error;
  //     toast({ duration: 5000,
  //       title: i18nT("Stripe Settings Saved"),
  //       description: i18nT("Your Stripe configuration has been updated successfully."),
  //     });
  //   } catch (error) {
  //     console.error("Error saving Stripe settings:", error);
  //     toast({ duration: 5000,
  //       title: i18nT("Error"),
  //       description: i18nT("Failed to save Stripe settings. Please try again."),
  //       variant: "destructive",
  //     });
  //   } finally {
  //     setIsStripeLoading(false);
  //   }
  // };

  const loadStripeSettings = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("stripe_configs")
        .select("*")
        .eq("user_id", user.id)
        .eq("role", "shopkeeper")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      // if (data) {
      //   setStripeSettings({
      //     secretKey: data.stripe_secret_key || "",
      //     publishableKey: data.stripe_publishable_key || "",
      //     isLiveMode: data.is_live_mode || false,
      //     isActive: data.is_active || true,
      //   });
      // }
    } catch (error) {
      console.error("Error loading Stripe settings:", error);
    }
  };

  // Load Stripe settings on component mount (kept)
  useEffect(() => {
    loadStripeSettings();
  }, []);

  // Load Shopkeeper profile on mount and fill all fields
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = sessionStorage.getItem("token");
        if (!token) return;

        // Decode JWT to get sub (shopkeeper id)
        type JwtPayload = { sub?: string; [k: string]: any };
        let decoded: JwtPayload | null = null;

        try {
          decoded = jwtDecode<JwtPayload>(token);
        } catch {
          // Fallback manual base64url decode if jwt-decode not available
          try {
            const payload = token.split(".")[1] || "";
            const b64 =
              payload.replace(/-/g, "+").replace(/_/g, "/") +
              "=".repeat((4 - (payload.length % 4)) % 4);
            decoded = JSON.parse(atob(b64));
          } catch (e) {
            console.error("Failed to decode JWT token payload", e);
            return;
          }
        }

        const id = decoded?.sub;
        if (!id) {
          console.error("JWT does not contain sub (id); cannot load profile");
          return;
        }

        const url = `${apiURL}/shopkeepers/Shopkeeper-detail/${id}`;
        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error(
            `Profile fetch failed: ${res.status} ${res.statusText} ${res.url}`,
            errText,
          );
          throw new Error(`Failed to load profile (${res.status})`);
        }

        const raw = await res.text();
        if (!raw) {
          console.warn("Profile response has empty body");
          return;
        }

        let response: any;
        try {
          response = JSON.parse(raw);
        } catch (e) {
          console.error("Profile response is not valid JSON:", raw);
          throw e;
        }

        const d = response?.data ?? response;

        setShopProfile((prev) => ({
          ...prev,
          ownerName: d?.name ?? "",
          shopName: d?.shopName ?? "",
          email: d?.email ?? "",
          businessEmail: d?.businessEmail ?? "",
          whatsappNumber: d?.whatsappNumber ?? "",
          taxPercentage: d?.taxPercentage ?? 0,
          discountPercentage: d?.discountPercentage ?? 0,
          deliveryEnabled: d?.deliveryEnabled ?? true,
          deliveryRules: Array.isArray(d?.deliveryRules) ? d.deliveryRules : [],
          whatsAppQR: d?.whatsAppQR ?? false,
          instagramQR: d?.instagramQR ?? false,
          dynamicQR: d?.dynamicQR ?? false,
          whatsAppQRNumber: d?.whatsAppQRNumber ?? "",
          instagramHandle: d?.instagramHandle ?? "",
          phone: d?.phone ?? "",
          address: d?.address ?? "",
          GSTNumber: d?.GSTNumber ?? "",
          UENNumber: d?.UENNumber ?? "",
          receiptType: d?.receiptType ?? "",
          termsAndConditions: d?.termsAndConditions ?? "",
          hasDocVerification: d?.hasDocVerification ?? "",
          description: d?.description ?? "",
          businessCategory: d?.businessCategory ?? "",
          pickupDateRequired: d?.pickupDateRequired ?? true,
          pickupMinDays: d?.pickupMinDays ?? 2,
          pickupMessage: d?.pickupMessage ?? "",
          voiceAccessEnabled: d?.voiceAccessEnabled ?? false,
          shopClosedFromDate: d?.shopClosedFromDate,
          shopClosedToDate: d?.shopClosedToDate,
          paymentURL: d?.paymentURL ?? "",
        }));

        setSelectedCountry(d?.country);

        setShopClosedFromDate(
          d?.shopClosedFromDate ? new Date(d?.shopClosedFromDate) : undefined,
        );
        setShopClosedToDate(
          d?.shopClosedToDate ? new Date(d?.shopClosedToDate) : undefined,
        );

        // Load operators
        await fetchOperators(id, token);

        const couponsRes = await fetch(
          `${apiURL}/coupons/shopkeeper-coupons/${id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (!couponsRes.ok) {
          console.error("Failed to fetch coupons");
        }

        const couponsData = await couponsRes.json();
        setCoupons(couponsData?.data || []);
      } catch (err) {
        console.error("Failed to load shopkeeper profile:", err);
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    const fetchSubscription = async () => {
      try {
        const token = sessionStorage.getItem("token");
        if (!token) return;
        const decoded: any = jwtDecode(token);
        const id = decoded?.sub;
        if (!id) return;

        const res = await fetch(`${apiURL}/shopkeepers/subscription/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSubscription(data);
        }
      } catch (err) {
        console.error("Failed to load subscription:", err);
      } finally {
        setLoadingSubscription(false);
      }
    };
    fetchSubscription();
  }, []);

  const daysOfWeek = [
    { key: "monday", label: i18nT("Monday") },
    { key: "tuesday", label: i18nT("Tuesday") },
    { key: "wednesday", label: i18nT("Wednesday") },
    { key: "thursday", label: i18nT("Thursday") },
    { key: "friday", label: i18nT("Friday") },
    { key: "saturday", label: i18nT("Saturday") },
    { key: "sunday", label: i18nT("Sunday") },
  ];

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b py-4 -mx-6 px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{i18nT("Settings")}</h1>
            <p className="text-muted-foreground max-w-md">
              {i18nT("Configure your shop preferences and business settings")}
            </p>
          </div>
          {/* ✅ SAVE BUTTON */}
          <div className="flex flex-col items-end">
            <Button
              onClick={handleSave}
              className="w-full sm:w-auto px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {i18nT("Save Profile")}
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="flex w-full">
          <TabsTrigger value="profile" className="flex-1 flex items-center justify-center gap-2">
            <Store className="w-4 h-4" />
            {i18nT("Profile")}
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex-1 flex items-center justify-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {i18nT("Subscription")}
          </TabsTrigger>
          <TabsTrigger value="operator" className={`flex-1 flex items-center justify-center gap-2 ${!isModuleEnabled("operators") ? "opacity-50" : ""}`}>
            <UserPlus2 className="w-4 h-4" />
            Operator
            {!isModuleEnabled("operators") && <Lock className="w-3 h-3 ml-1" />}
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 flex items-center justify-center gap-2">
            <CreditCard className="w-4 h-4" />
            {i18nT("Payments")}
          </TabsTrigger>
          <TabsTrigger value="receipts" className={`flex-1 flex items-center justify-center gap-2 ${!isModuleEnabled("receipts") ? "opacity-50" : ""}`}>
            <ReceiptTextIcon className="w-4 h-4" />
            Receipts
            {!isModuleEnabled("receipts") && <Lock className="w-3 h-3 ml-1" />}
          </TabsTrigger>
          <TabsTrigger value="coupons" className={`flex-1 flex items-center justify-center gap-2 ${!isModuleEnabled("coupons") ? "opacity-50" : ""}`}>
            <CopyPlusIcon className="w-4 h-4" />
            Coupons
            {!isModuleEnabled("coupons") && <Lock className="w-3 h-3 ml-1" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{i18nT("Shop Profile")}</CardTitle>
              <CardDescription>
                {i18nT("Manage shopkeeper details and public info")}
              </CardDescription>
            </CardHeader>

            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* COUNTRY SELECTION */}

              {/* ✅ ENTIRE SECTION - BLUR CONTENT BUT SHOW VALUES */}
              {shopProfile.hasDocVerification ? (
                /* ✅ VERIFIED - BLURRED BUT VISIBLE CONTENT */
                <div className="md:col-span-2 space-y-4">
                  {/* ✅ HEADER */}
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-green-800">
                          {i18nT("Document Verified ✓")}
                        </h3>
                        <p className="text-sm text-green-600">
                          {i18nT("Secure & protected")}
                        </p>
                      </div>
                    </div>
                    {/* <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="border border-green-300 hover:bg-green-100 text-green-700"
                      onClick={() => {
                        setShopProfile({
                          ...shopProfile,
                          hasDocVerification: false,
                        });
                        setGstVerified(false);
                        setUenVerified(false);
                        setGstError("");
                        setUenError("");
                      }}
                    >
                      {i18nT("Edit")}
                    </Button> */}
                  </div>

                  {/* ✅ BLURRED COUNTRY - SHOW SELECTED VALUE */}
                  <div className="grid gap-2 p-4 bg-muted/50 border border-border rounded-lg">
                    <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Globe className="w-4 h-4" />
                      {i18nT("Country")}
                    </Label>
                    <div className="flex items-center gap-3 p-3 bg-card border rounded-md opacity-60">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {COUNTRIES.find((c) => c.code === selectedCountry)
                          ?.name || "India"}
                        (
                        {COUNTRIES.find((c) => c.code === selectedCountry)
                          ?.countryCode || "+91"}
                        )
                      </span>
                    </div>
                  </div>

                  {/* ✅ BLURRED NUMBER - SHOW ACTUAL VALUE */}
                  <div className="grid gap-2 p-4 bg-muted/50 border border-border rounded-lg">
                    <Label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <CreditCard className="w-4 h-4" />
                      {selectedCountry === "IN" ? "GST Number" : "UEN Number"}
                    </Label>
                    <div className="flex items-center justify-between p-3 bg-card border rounded-md opacity-60">
                      <div className="flex items-center gap-3">
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono text-lg font-semibold text-foreground tracking-wider">
                          {selectedCountry === "IN"
                            ? shopProfile.GSTNumber
                            : shopProfile.UENNumber}
                        </span>
                      </div>
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        {i18nT("Verified")}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                /* ✅ NOT VERIFIED - FULLY EDITABLE (your original code) */
                <>
                  {/* COUNTRY SELECTION */}
                  <div className="grid gap-2">
                    <Label
                      htmlFor="country"
                      className="flex items-center gap-2"
                    >
                      <Globe className="w-4 h-4" />
                      {i18nT("Country")}
                    </Label>
                    <Select
                      value={selectedCountry}
                      onValueChange={(value) => {
                        setSelectedCountry(value);
                        setShopProfile({
                          ...shopProfile,
                          country: value,
                          GSTNumber: "",
                          UENNumber: "",
                        });
                      }}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder={i18nT("Select a country")} />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name} ({country.countryCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* GST NUMBER */}
                  {selectedCountry === "IN" && (
                    <div className="grid gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg md:col-span-2">
                      <Label
                        htmlFor="gstNumber"
                        className="flex items-center gap-2 font-semibold"
                      >
                        <CreditCard className="w-4 h-4" />
                        {i18nT("GST Number (15 characters)")}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="gstNumber"
                          value={shopProfile.GSTNumber || ""}
                          onChange={(e) =>
                            setShopProfile({
                              ...shopProfile,
                              GSTNumber: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder={i18nT("e.g., 22AABCT1234A1Z0")}
                          maxLength={15}
                          className="uppercase font-mono"
                          disabled={gstVerified}
                        />
                        {!gstVerified && (
                          <Button
                            type="button"
                            onClick={() =>
                              handleVerifyGST(shopProfile.GSTNumber)
                            }
                            disabled={!shopProfile.GSTNumber || gstVerifying}
                            className="whitespace-nowrap"
                          >
                            {gstVerifying ? "Verifying..." : "Verify"}
                          </Button>
                        )}
                      </div>
                      {gstError && (
                        <p className="text-xs text-red-600">{gstError}</p>
                      )}
                      {gstVerified && (
                        <p className="text-xs text-green-600">
                          ✓ GST verified successfully. Save profile to secure
                          it.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {i18nT("Your GST Identification Number (GSTIN)")}
                      </p>
                    </div>
                  )}

                  {/* UEN NUMBER */}
                  {selectedCountry === "SG" && (
                    <div className="grid gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg md:col-span-2">
                      <Label
                        htmlFor="uenNumber"
                        className="flex items-center gap-2 font-semibold"
                      >
                        <CreditCard className="w-4 h-4" />
                        {i18nT("UEN Number (9-10 characters)")}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="uenNumber"
                          value={shopProfile.UENNumber || ""}
                          onChange={(e) =>
                            setShopProfile({
                              ...shopProfile,
                              UENNumber: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder={i18nT("e.g., 123456789A")}
                          maxLength={10}
                          className="uppercase font-mono"
                          disabled={uenVerified}
                        />
                        {!uenVerified && (
                          <Button
                            type="button"
                            onClick={handleVerifyUEN}
                            disabled={!shopProfile.UENNumber || uenVerifying}
                            className="whitespace-nowrap"
                          >
                            {uenVerifying ? "Verifying..." : "Verify"}
                          </Button>
                        )}
                      </div>
                      {uenError && (
                        <p className="text-xs text-red-600">{uenError}</p>
                      )}
                      {uenVerified && (
                        <p className="text-xs text-green-600">
                          ✓ UEN verified successfully. Save profile to secure
                          it.
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {i18nT("Your Unique Entity Number (UEN)")}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* ✅ GST/UEN VERIFICATION DETAILS BOX */}
              {shopProfile.hasDocVerification && gstDetails && (
                <div className="md:col-span-2 space-y-4">
                  {/* ✅ HEADER */}
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg text-blue-800">
                          {i18nT("Verification Details")}
                        </h3>
                        <p className="text-sm text-blue-600">
                          {i18nT("Official business information")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ✅ BUSINESS INFO CARD */}
                  <Card className="border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building className="w-5 h-5" />
                        {i18nT("Business Information")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs text-muted-foreground font-medium">
                            {i18nT("Legal Name")}
                          </span>
                          <p className="font-semibold">
                            {gstDetails.taxpayerInfo?.lgnm || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-medium">
                            {i18nT("Trade Name")}
                          </span>
                          <p className="font-semibold">
                            {gstDetails.taxpayerInfo?.tradeNam || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-medium">
                            {i18nT("Status")}
                          </span>
                          <Badge className="bg-green-100 text-green-800">
                            {gstDetails.taxpayerInfo?.sts || "N/A"}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-medium">
                            {i18nT("Entity Type")}
                          </span>
                          <p>{gstDetails.taxpayerInfo?.ctb || "N/A"}</p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-medium">
                            PAN
                          </span>
                          <p className="font-mono">
                            {gstDetails.taxpayerInfo?.panNo || "N/A"}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-medium">
                            {i18nT("Registered")}
                          </span>
                          <p>{gstDetails.taxpayerInfo?.rgdt || "N/A"}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ✅ ADDRESS CARD */}
                  <Card className="border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="w-5 h-5" />
                        {i18nT("Principal Address")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
                        <p className="font-mono text-sm tracking-wide text-foreground">
                          {gstDetails.taxpayerInfo?.pradr?.addr?.bno || ""}{" "}
                          {gstDetails.taxpayerInfo?.pradr?.addr?.st || ""},{" "}
                          {gstDetails.taxpayerInfo?.pradr?.addr?.loc || ""},{" "}
                          {gstDetails.taxpayerInfo?.pradr?.addr?.dst || ""}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {gstDetails.taxpayerInfo?.pradr?.addr?.stcd || ""} -{" "}
                          {gstDetails.taxpayerInfo?.pradr?.addr?.pncd || ""}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground font-medium">
                            {i18nT("Jurisdiction")}
                          </span>
                          <p>{gstDetails.taxpayerInfo?.stj || "N/A"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground font-medium">
                            {i18nT("Nature")}
                          </span>
                          <p>{gstDetails.taxpayerInfo?.pradr?.ntr || "N/A"}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* OWNER NAME */}
              <div>
                <Label>{i18nT("Owner Name")}</Label>
                <Input
                  value={shopProfile.ownerName}
                  onChange={(e) =>
                    setShopProfile((p) => ({ ...p, ownerName: e.target.value }))
                  }
                  placeholder={i18nT("Owner full name")}
                />
              </div>

              {/* SHOP NAME */}
              <div>
                <Label>{i18nT("Shop Name")}</Label>
                <Input
                  value={shopProfile.shopName}
                  onChange={(e) =>
                    setShopProfile((p) => ({ ...p, shopName: e.target.value }))
                  }
                  placeholder={i18nT("Business or storefront name")}
                />
              </div>

              {/* PRIMARY EMAIL */}
              <div>
                <Label>{i18nT("Primary Email")}</Label>
                <Input
                  type="email"
                  value={shopProfile.email}
                  onChange={(e) =>
                    setShopProfile((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder={i18nT("owner@example.com")}
                />
              </div>

              {/* BUSINESS EMAIL */}
              <div>
                <Label>{i18nT("Business Email")}</Label>
                <Input
                  type="email"
                  value={shopProfile.businessEmail}
                  onChange={(e) =>
                    setShopProfile((p) => ({
                      ...p,
                      businessEmail: e.target.value,
                    }))
                  }
                  placeholder={i18nT("business@example.com")}
                />
              </div>

              {/* WhatsApp Number with Country Code and Verification */}
              <div>
                <Label className="flex items-center justify-between mb-2">
                  <span>{i18nT("WhatsApp Number *")}</span>
                  {whatsappVerified && (
                    <Badge variant="default" className="ml-2">
                      {i18nT("Verified")}
                    </Badge>
                  )}
                </Label>
                <div className="flex items-center space-x-2">
                  <div className="w-32">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={i18nT("Code")} />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingCountries ? (
                          <SelectItem value="loading" disabled>
                            {i18nT("Loading...")}
                          </SelectItem>
                        ) : (
                          countries
                            .filter(
                              (country) =>
                                country.dialCode &&
                                country.dialCode.trim() !== "",
                            )
                            .map((country) => (
                              <SelectItem
                                key={`${country.code}-${country.dialCode}`}
                                value={country.dialCode}
                              >
                                {country.name} {country.dialCode}
                              </SelectItem>
                            ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    type="tel"
                    maxLength={10}
                    placeholder={i18nT("Enter number")}
                    value={whatsappNumber}
                    onChange={(e) =>
                      setWhatsappNumber(e.target.value.replace(/\D/g, ""))
                    }
                    className="flex-grow"
                  />
                </div>
              </div>

              {/* PHONE */}
              <div>
                <Label>{i18nT("Phone")}</Label>
                <Input
                  value={shopProfile.phone}
                  onChange={(e) =>
                    setShopProfile((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="+91 98765 43210"
                />
              </div>

              {/* ADDRESS */}
              <div className="md:col-span-2">
                <Label>{i18nT("Address")}</Label>
                <Textarea
                  value={shopProfile.address}
                  onChange={(e) =>
                    setShopProfile((p) => ({ ...p, address: e.target.value }))
                  }
                  placeholder={i18nT("Full business address")}
                />
              </div>

              {/* BUSINESS CATEGORY */}
              <div className="md:col-span-2">
                <Label>{i18nT("Business Category")}</Label>
                <Select
                  value={shopProfile.businessCategory}
                  onValueChange={(val) =>
                    setShopProfile((p) => ({ ...p, businessCategory: val }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={i18nT("Select a category")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Technology">{i18nT("Technology")}</SelectItem>
                    <SelectItem value="Music">{i18nT("Music")}</SelectItem>
                    <SelectItem value="Food">{i18nT("Food")}</SelectItem>
                    <SelectItem value="Sports">{i18nT("Sports")}</SelectItem>
                    <SelectItem value="Arts">{i18nT("Arts")}</SelectItem>
                    <SelectItem value="Fashion">{i18nT("Fashion")}</SelectItem>
                    <SelectItem value="Electronics">{i18nT("Electronics")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* TAX PERCENTAGE */}
              <div>
                <Label>{i18nT("Tax %")}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={shopProfile.taxPercentage}
                  onChange={(e) =>
                    setShopProfile((p) => ({
                      ...p,
                      taxPercentage: parseFloat(e.target.value),
                    }))
                  }
                  placeholder={i18nT("e.g., 5.0")}
                />
              </div>

              <div>
                <Label>{i18nT("Overall Shop Based Discount Percentage %")}</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={shopProfile.discountPercentage}
                  onChange={(e) =>
                    setShopProfile((p) => ({
                      ...p,
                      discountPercentage: parseFloat(e.target.value),
                    }))
                  }
                  placeholder={i18nT("e.g., 5.0")}
                />
              </div>

              {/* DELIVERY CHARGES — own card so it stands apart from the scalar fields. */}
              <div className="md:col-span-2 space-y-4 border rounded-lg p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">{i18nT("Offer delivery")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {i18nT("Turn off to make every delivery order free (no fee applied).")}
                    </p>
                  </div>
                  <Switch
                    checked={!!shopProfile.deliveryEnabled}
                    onCheckedChange={(checked) =>
                      setShopProfile((p) => ({ ...p, deliveryEnabled: checked }))
                    }
                  />
                </div>

                {shopProfile.deliveryEnabled && (
                  <div className="space-y-3 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">{i18nT("Delivery fee by subtotal")}</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setShopProfile((p) => ({
                            ...p,
                            deliveryRules: [
                              ...(p.deliveryRules || []),
                              { minSubtotal: 0, fee: 0 },
                            ],
                          }))
                        }
                      >
                        + Add condition
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each row: "if order subtotal is at least <b>{i18nT("min")}</b>, charge <b>{i18nT("fee")}</b>". The rule with the
                      highest matching min wins, so you can do things like "₹50 up to 300, ₹20 from 300, free from 500".
                    </p>
                    {(shopProfile.deliveryRules || []).length === 0 ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                        {i18nT("No conditions yet — delivery is free by default until you add one.")}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(shopProfile.deliveryRules || []).map((rule, idx) => (
                          <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                            <div>
                              <Label className="text-xs text-muted-foreground">{i18nT("Min subtotal")}</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={Number.isFinite(rule.minSubtotal) ? rule.minSubtotal : ""}
                                onChange={(e) =>
                                  setShopProfile((p) => {
                                    const rules = [...(p.deliveryRules || [])];
                                    rules[idx] = { ...rules[idx], minSubtotal: parseFloat(e.target.value) };
                                    return { ...p, deliveryRules: rules };
                                  })
                                }
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">{i18nT("Fee")}</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={Number.isFinite(rule.fee) ? rule.fee : ""}
                                onChange={(e) =>
                                  setShopProfile((p) => {
                                    const rules = [...(p.deliveryRules || [])];
                                    rules[idx] = { ...rules[idx], fee: parseFloat(e.target.value) };
                                    return { ...p, deliveryRules: rules };
                                  })
                                }
                                placeholder="30"
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() =>
                                setShopProfile((p) => {
                                  const rules = [...(p.deliveryRules || [])];
                                  rules.splice(idx, 1);
                                  return { ...p, deliveryRules: rules };
                                })
                              }
                            >
                              {i18nT("Remove")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PICKUP DATE SETTINGS */}
              <div className="md:col-span-2 space-y-4 border rounded-lg p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-medium">{i18nT("Require Pickup Date & Time")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {i18nT("If enabled, customers must select a pickup date and time during checkout")}
                    </p>
                  </div>
                  <Switch
                    checked={shopProfile.pickupDateRequired}
                    onCheckedChange={(checked) =>
                      setShopProfile((p) => ({ ...p, pickupDateRequired: checked }))
                    }
                  />
                </div>

                {shopProfile.pickupDateRequired ? (
                  <div className="space-y-2">
                    <Label className="text-sm">{i18nT("Minimum Lead Days")}</Label>
                    <p className="text-xs text-muted-foreground">
                      {i18nT("Earliest pickup date will be this many days from today (e.g. 2 = day after tomorrow)")}
                    </p>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      className="w-32"
                      value={shopProfile.pickupMinDays}
                      onChange={(e) =>
                        setShopProfile((p) => ({ ...p, pickupMinDays: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-sm">{i18nT("Checkout Message")}</Label>
                    <p className="text-xs text-muted-foreground">
                      This message is shown to customers instead of date/time picker (e.g. "We'll contact you to arrange delivery")
                    </p>
                    <Textarea
                      rows={2}
                      placeholder="e.g. We'll contact you on WhatsApp to arrange pickup/delivery"
                      value={shopProfile.pickupMessage}
                      onChange={(e) =>
                        setShopProfile((p) => ({ ...p, pickupMessage: e.target.value }))
                      }
                    />
                  </div>
                )}
              </div>

              {/* VOICE ACCESS */}
              <div className="md:col-span-2 flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                <div>
                  <Label className="font-medium">{i18nT("Voice Access (KiosAI)")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {i18nT("Enable \"Hey Kios\" voice command to open the chatbot hands-free")}
                  </p>
                </div>
                <Switch
                  checked={shopProfile.voiceAccessEnabled}
                  onCheckedChange={(checked) =>
                    setShopProfile((p) => ({ ...p, voiceAccessEnabled: checked }))
                  }
                />
              </div>

              {/* SHOP HOLIDAY PERIOD */}
              <div className="md:col-span-2">
                <Label className="font-medium">{i18nT("Shop Holiday Period")}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* From Date */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      {i18nT("Closed From")}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="buttonOutline"
                          className={`w-full justify-start text-left font-normal ${
                            !shopClosedFromDate && "text-muted-foreground"
                          }`}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {shopClosedFromDate ? (
                            format(shopClosedFromDate, "PPP")
                          ) : (
                            <span>{i18nT("Pick start date")}</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={shopClosedFromDate}
                          onSelect={handleFromDateChange}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0, 0, 0, 0))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* To Date */}
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      {i18nT("Closed To")}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="buttonOutline"
                          className={`w-full justify-start text-left font-normal ${
                            !shopClosedToDate && "text-muted-foreground"
                          }`}
                          disabled={!shopClosedFromDate}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {shopClosedToDate ? (
                            format(shopClosedToDate, "PPP")
                          ) : (
                            <span>{i18nT("Pick end date")}</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={shopClosedToDate}
                          onSelect={handleToDateChange}
                          disabled={(date) => date < getMinToDate()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {!shopClosedFromDate && (
                      <p className="text-xs text-muted-foreground">
                        {i18nT("Select start date first")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Clear Button */}
                {(shopClosedFromDate || shopClosedToDate) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShopClosedFromDate(undefined);
                      setShopClosedToDate(undefined);
                      setShopProfile((p) => ({
                        ...p,
                        shopClosedFromDate: undefined,
                        shopClosedToDate: undefined,
                      }));
                    }}
                    className="mt-2"
                  >
                    {i18nT("Clear Holiday Dates")}
                  </Button>
                )}

                {/* Display selected range */}
                {shopClosedFromDate && shopClosedToDate && (
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Shop will be closed from{" "}
                      <span className="font-semibold">
                        {format(shopClosedFromDate, "PPP")}
                      </span>{" "}
                      to{" "}
                      <span className="font-semibold">
                        {format(shopClosedToDate, "PPP")}
                      </span>
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Duration:{" "}
                      {Math.ceil(
                        (shopClosedToDate.getTime() -
                          shopClosedFromDate.getTime()) /
                          (1000 * 60 * 60 * 24),
                      )}{" "}
                      days
                    </p>
                  </div>
                )}
              </div>

              {/* DESCRIPTION */}
              <div className="md:col-span-2">
                <Label>{i18nT("Description")}</Label>
                <Textarea
                  value={shopProfile.description}
                  onChange={(e) =>
                    setShopProfile((p) => ({
                      ...p,
                      description: e.target.value,
                    }))
                  }
                  placeholder={i18nT("Tell customers about your shop and services")}
                />
              </div>

              <div className="md:col-span-2">
                <Label className="mb-2 block">{i18nT("Terms & Conditions")}</Label>
                <div className="bg-card dark:bg-slate-950 rounded-md">
                  <ReactQuill
                    theme="snow"
                    value={shopProfile.termsAndConditions || ""}
                    modules={modules}
                    onChange={(content) =>
                      setShopProfile((p) => ({
                        ...p,
                        termsAndConditions: content,
                      }))
                    }
                    placeholder={i18nT("e.g. 1. Goods once sold are not returnable.")}
                    className="[&_.ql-editor]:min-h-[150px] [&_.ql-container]:rounded-b-md [&_.ql-toolbar]:rounded-t-md text-foreground dark:text-white"
                  />
                </div>
                {/* <p className="text-xs text-muted-foreground mt-2">
                  These terms will appear at the bottom of your generated
                  invoices.
                </p> */}
              </div>

              {/* PAYMENT QR */}
              {/* <div className="md:col-span-2">
                <Label>{i18nT("Payment QR")}</Label>
                <div className="flex flex-col md:flex-row gap-4 items-start">
                  <div className="w-48 h-48 rounded-md border flex items-center justify-center overflow-hidden bg-card">
                    {paymentQrPreview ? (
                      <img
                        src={paymentQrPreview}
                        alt="Payment QR preview"
                        className="w-full h-full object-contain"
                      />
                    ) : shopProfile.paymentURL ? (
                      <img
                        src={apiURL + shopProfile.paymentURL}
                        alt="Payment QR"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground px-2 text-center">
                        {i18nT("No QR uploaded")}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={onPaymentQrChange}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={removePaymentQr}
                        disabled={!paymentQrPreview && !shopProfile.paymentURL}
                      >
                        {i18nT("Remove")}
                      </Button>
                    </div>
                    {shopProfile.paymentURL && (
                      <div>
                        <Label>{i18nT("Public URL")}</Label>
                        <Input
                          value={`${apiURL}${shopProfile.paymentURL}`}
                          readOnly
                        />
                        <p className="text-xs text-muted-foreground">
                          {i18nT("Copy and use this URL to view or embed your QR image.")}
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Recommended: Square PNG/JPG around 512×512.
                    </p>
                  </div>
                </div>
              </div> */}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{i18nT("Subscription Plan")}</CardTitle>
              <CardDescription>
                {i18nT("Your current plan and what's included")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSubscription ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="h-6 w-6 animate-spin text-indigo-600" />
                </div>
              ) : !subscription?.subscribed ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-lg font-medium">{i18nT("No Active Plan")}</p>
                  <p className="text-sm mt-1 mb-4">{i18nT("Choose a plan to get started.")}</p>
                  <Button onClick={openChangePlan} className="bg-indigo-600 hover:bg-indigo-700">
                    {i18nT("Browse Plans")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-indigo-50 border border-indigo-200">
                    <div>
                      <h3 className="text-xl font-bold text-indigo-700">{subscription.planName}</h3>
                      <p className="text-sm text-indigo-600 mt-1">
                        ${subscription.pricePaid} / {subscription.validityInDays} days
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={subscription.inGracePeriod ? "destructive" : subscription.isExpired ? "destructive" : "default"}
                        className="text-sm px-3 py-1 w-fit"
                      >
                        {subscription.inGracePeriod
                          ? `Grace: ${subscription.graceDaysLeft}d left`
                          : subscription.isExpired ? "Expired" : "Active"}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={openChangePlan}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        {i18nT("Change Plan")}
                      </Button>
                    </div>
                  </div>
                  {subscription.inGracePeriod && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                      Your plan expired. You have <strong>{subscription.graceDaysLeft} day{subscription.graceDaysLeft === 1 ? "" : "s"}</strong> {i18nT("to renew before being downgraded to the default plan. Products exceeding the new limit will be hidden.")}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border">
                      <p className="text-xs text-muted-foreground">{i18nT("Start Date")}</p>
                      <p className="font-medium">
                        {subscription.planStartDate
                          ? new Date(subscription.planStartDate).toLocaleDateString("en-US", {
                              year: "numeric", month: "long", day: "numeric",
                            })
                          : "—"}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg border">
                      <p className="text-xs text-muted-foreground">{i18nT("Expiry Date")}</p>
                      <p className="font-medium">
                        {subscription.planExpiryDate
                          ? new Date(subscription.planExpiryDate).toLocaleDateString("en-US", {
                              year: "numeric", month: "long", day: "numeric",
                            })
                          : "—"}
                      </p>
                    </div>
                  </div>

                  {subscription.features?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">{i18nT("Features")}</h4>
                      <div className="flex flex-wrap gap-2">
                        {subscription.features.map((f: string, i: number) => (
                          <Badge key={i} variant="secondary">{f}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {subscription.modules && Object.keys(subscription.modules).length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">{i18nT("Modules")}</h4>
                      <div className="space-y-2">
                        {[
                          { label: i18nT("Product Management"), color: "blue", items: [
                            { key: "products", label: i18nT("Products") },
                            { key: "bulkImport", label: "Bulk Import / Export" },
                          ]},
                          { label: i18nT("Order Management"), color: "amber", items: [
                            { key: "orders", label: i18nT("Orders") },
                            { key: "receipts", label: i18nT("Receipt Printing") },
                          ]},
                          { label: i18nT("Online Storefront"), color: "emerald", items: [
                            { key: "storefront", label: i18nT("Storefront") },
                            { key: "customDomain", label: i18nT("Custom Domain") },
                            { key: "instagram", label: i18nT("Instagram Integration") },
                            { key: "videoSection", label: i18nT("Video Section") },
                            { key: "ourStory", label: i18nT("Our Story Section") },
                          ]},
                          { label: i18nT("Analytics"), color: "purple", items: [
                            { key: "analytics", label: i18nT("Analytics & Reports") },
                          ]},
                          { label: i18nT("Payments"), color: "indigo", items: [
                            { key: "staticQR", label: i18nT("Static QR") },
                            { key: "dynamicQR", label: i18nT("Dynamic QR") },
                            { key: "paymentTracking", label: i18nT("Payment Tracking (Gmail)") },
                            { key: "razorpay", label: i18nT("Card Payments (Razorpay)") },
                          ]},
                          { label: "CRM / Customers", color: "pink", items: [
                            { key: "crm", label: i18nT("Customer Management") },
                          ]},
                          { label: i18nT("Coupons"), color: "orange", items: [
                            { key: "coupons", label: i18nT("Coupon Management") },
                          ]},
                          { label: i18nT("Kiosk Mode"), color: "cyan", items: [
                            { key: "kiosk", label: "Kiosk / POS Mode" },
                          ]},
                          { label: i18nT("Operators"), color: "rose", items: [
                            { key: "operators", label: i18nT("Multi-User Operators") },
                          ]},
                          { label: i18nT("Communication"), color: "green", items: [
                            { key: "whatsappQR", label: i18nT("WhatsApp QR") },
                            { key: "chatbot", label: i18nT("Smart Assistant") },
                          ]},
                        ].map((group) => {
                          const groupHasAny = group.items.some((i) => subscription.modules[i.key]?.enabled);
                          if (!groupHasAny) return (
                            <div key={group.label} className="rounded-lg border border-border bg-muted/50 p-3 opacity-60">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-muted-foreground">{group.label}</span>
                                <Badge variant="secondary" className="text-xs">{i18nT("OFF")}</Badge>
                              </div>
                            </div>
                          );
                          return (
                            <div key={group.label} className="rounded-lg border border-green-200 bg-green-50 overflow-hidden">
                              <div className="flex items-center justify-between p-3">
                                <span className="text-sm font-semibold text-green-700">{group.label}</span>
                                <Badge variant="default" className="text-xs">ON</Badge>
                              </div>
                              <div className="border-t border-green-200/60 divide-y divide-green-100">
                                {group.items.map((item) => {
                                  const config = subscription.modules[item.key];
                                  const on = config?.enabled;
                                  return (
                                    <div key={item.key} className="flex items-center justify-between px-4 py-1.5 pl-6">
                                      <span className="text-xs">{item.label}</span>
                                      <div className="flex items-center gap-1.5">
                                        {item.key === "products" && on && (
                                          <span className="text-xs text-muted-foreground">
                                            {config?.limit ? `Limit: ${config.limit}` : "Unlimited"}
                                          </span>
                                        )}
                                        <Badge variant={on ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                                          {on ? "ON" : "OFF"}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operator">
          <ModuleGate moduleKey="operators" fallbackText="Upgrade your plan to access Operators">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus2 className="w-5 h-5" />
                {i18nT("Operator Settings")}
              </CardTitle>
              <CardDescription>
                {i18nT("Create and manage your shop operators here")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Operators{" "}
                  {operators.length > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-1">
                      ({operators.length})
                    </span>
                  )}
                </h3>
                <Button
                  onClick={() => {
                    setOperatorForm({
                      name: "",
                      operatorCountryCode: countryCode,
                      operatorEmail: "",
                      operatorLocalNumber: "",
                      accessTabs: [...ALL_TABS],
                    });
                    setEditingOperatorIndex(null);
                    setOperatorDialogOpen(true);
                  }}
                >
                  <UserPlus2 className="w-4 h-4 mr-2" />
                  {i18nT("Add Operator")}
                </Button>
              </div>

              {operators.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {i18nT("No Operators Found. Add your first operator.")}
                </div>
              ) : (
                <div className="space-y-3">
                  {operators.map((op, index) => (
                    <Card key={op._id ?? index}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-semibold">{op.name}</p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {op.email}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setOperatorForm({
                                name: op.name,
                                operatorCountryCode: countryCode,
                                operatorEmail: op.email,
                                operatorLocalNumber: "",
                                accessTabs: op.accessTabs || [...ALL_TABS],
                              });
                              setEditingOperatorIndex(index);
                              setOperatorDialogOpen(true);
                            }}
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              op._id && handleDeleteOperator(op._id)
                            }
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Add/Edit Operator Dialog */}
          <Dialog
            open={operatorDialogOpen}
            onOpenChange={setOperatorDialogOpen}
          >
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingOperatorIndex !== null
                    ? "Edit Operator"
                    : "Add Operator"}
                </DialogTitle>
                <DialogDescription>
                  {i18nT("Operators can manage orders on behalf of your shop.")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1">
                  <Label>{i18nT("Operator Name *")}</Label>
                  <Input
                    placeholder={i18nT("e.g. John Doe")}
                    value={operatorForm.name}
                    onChange={(e) =>
                      setOperatorForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>{i18nT("Operator Email *")}</Label>
                  <Input
                    type="email"
                    placeholder={i18nT("e.g. operator@example.com")}
                    value={operatorForm.operatorEmail}
                    onChange={(e) =>
                      setOperatorForm((prev) => ({
                        ...prev,
                        operatorEmail: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              {/* Tab Access Permissions - Collapsible */}
              <div className="mt-2">
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    const el = document.getElementById("access-tabs-panel");
                    if (el) el.classList.toggle("hidden");
                    const icon = document.getElementById("access-tabs-chevron");
                    if (icon) icon.classList.toggle("rotate-180");
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div className="text-left">
                      <p className="text-sm font-semibold">{i18nT("Tab Access Permissions")}</p>
                      <p className="text-xs text-muted-foreground">
                        {operatorForm.accessTabs.length} of {ALL_TABS.length} tabs enabled
                      </p>
                    </div>
                  </div>
                  <ChevronDown id="access-tabs-chevron" className="h-4 w-4 text-muted-foreground transition-transform" />
                </button>
                <div id="access-tabs-panel" className="hidden mt-2 space-y-1 border rounded-lg p-3 bg-muted/30">
                  {ALL_TABS.map((tab) => (
                    <div key={tab} className="flex items-center justify-between py-1.5 px-1">
                      <Label className="text-sm cursor-pointer">{TAB_LABELS[tab]}</Label>
                      <Switch
                        checked={operatorForm.accessTabs.includes(tab)}
                        onCheckedChange={(checked) => {
                          setOperatorForm((prev) => ({
                            ...prev,
                            accessTabs: checked
                              ? [...prev.accessTabs, tab]
                              : prev.accessTabs.filter((t) => t !== tab),
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Button
                className="w-full mt-4"
                onClick={handleSubmitOperator}
                disabled={isSavingOperators}
              >
                {isSavingOperators
                  ? "Saving..."
                  : editingOperatorIndex !== null
                    ? "Update Operator"
                    : "Add Operator"}
              </Button>
            </DialogContent>
          </Dialog>
          </ModuleGate>
        </TabsContent>

        <TabsContent value="branding">
          <BlurWrapper>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  {i18nT("Store Branding")}
                </CardTitle>
                <CardDescription>
                  {i18nT("Customize your store's appearance and colors")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>{i18nT("Primary Color")}</Label>
                    <Input
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) =>
                        setBranding((prev) => ({
                          ...prev,
                          primaryColor: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>{i18nT("Secondary Color")}</Label>
                    <Input
                      type="color"
                      value={branding.secondaryColor}
                      onChange={(e) =>
                        setBranding((prev) => ({
                          ...prev,
                          secondaryColor: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </BlurWrapper>
        </TabsContent>

        <TabsContent value="products">
          <BlurWrapper>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {i18nT("Product Settings")}
                </CardTitle>
                <CardDescription>
                  {i18nT("Configure product management options")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>{i18nT("Default Currency")}</Label>
                    <Select
                      value={productSettings.defaultCurrency}
                      onValueChange={(value) =>
                        setProductSettings((prev) => ({
                          ...prev,
                          defaultCurrency: value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="INR">INR ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{i18nT("Tax Rate (%)")}</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={productSettings.taxRate}
                      onChange={(e) =>
                        setProductSettings((prev) => ({
                          ...prev,
                          taxRate: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </BlurWrapper>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          {/* STATIC QR TOGGLE */}
          <LockedSection
            locked={!!isModuleEnabled && !isModuleEnabled("staticQR")}
            label="Static QR — not in your plan"
            onUpgrade={openChangePlan}
          ><>
          <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted transition bg-card">
            <div className="flex items-center gap-3">
              <QrCode className="w-5 h-5 text-blue-600" />
              <div>
                <Label className="font-semibold text-foreground">
                  {i18nT("Static QR Code")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Upload a UPI/PayNow QR for offline scan payments
                </p>
              </div>
            </div>
            <Switch
              checked={paymentMethods.staticQR}
              onCheckedChange={(checked) =>
                setPaymentMethods((prev) => ({
                  ...prev,
                  staticQR: checked,
                  // dynamicQR: checked ? false : prev.dynamicQR,
                }))
              }
            />
          </div>

          {/* STATIC QR SECTION - APPEARS RIGHT BELOW TOGGLE */}
          {paymentMethods.staticQR && (
            <Card className="border-blue-200 bg-blue-50 animate-in slide-in-from-top">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <QrCode className="w-5 h-5" />
                  {i18nT("Upload Static QR")}
                </CardTitle>
                <CardDescription>
                  {i18nT("PNG or JPG format, recommended 512×512px")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col md:flex-row gap-6 items-start">
                  {/* QR PREVIEW */}
                  <div className="w-48 h-48 rounded-lg border-2 border-blue-300 flex items-center justify-center overflow-hidden bg-card flex-shrink-0">
                    {paymentQrPreview ? (
                      <img
                        src={paymentQrPreview}
                        alt="Payment QR preview"
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    ) : shopProfile?.paymentURL ? (
                      <img
                        src={apiURL + shopProfile.paymentURL}
                        alt="Payment QR"
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div className="text-center">
                        <Upload className="w-8 h-8 text-blue-300 mx-auto mb-2" />
                        <span className="text-xs text-muted-foreground">
                          {i18nT("No QR uploaded")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* UPLOAD SECTION */}
                  <div className="flex-1 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="staticQrUpload" className="font-semibold">
                        {i18nT("Choose QR Image")}
                      </Label>
                      <Input
                        id="staticQrUpload"
                        type="file"
                        accept="image/*"
                        onChange={onPaymentQrChange}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground">
                        {i18nT("Max 5MB. PNG or JPG recommended.")}
                      </p>
                    </div>

                    {shopProfile?.paymentURL && (
                      <div className="space-y-2 p-3 bg-card rounded-lg border border-blue-200">
                        <p className="text-xs font-semibold text-foreground">
                          {i18nT("Public URL (Read-only)")}
                        </p>
                        <Input
                          value={`${apiURL}${shopProfile.paymentURL}`}
                          readOnly
                          className="text-xs font-mono"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `${apiURL}${shopProfile.paymentURL}`,
                            );
                            toast({ duration: 5000, title: "✅ URL copied" });
                          }}
                        >
                          {i18nT("Copy URL")}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          </></LockedSection>

          {/* DYNAMIC QR TOGGLE */}
          <LockedSection
            locked={!!isModuleEnabled && !isModuleEnabled("dynamicQR")}
            label="Dynamic QR — not in your plan"
            onUpgrade={openChangePlan}
          ><>
          <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted transition bg-card">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-amber-600" />
              <div>
                <Label className="font-semibold text-foreground">
                  {i18nT("Dynamic QR Code")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {i18nT("Auto-generate QR with exact amount at checkout")}
                </p>
              </div>
            </div>
            <Switch
              checked={shopProfile.dynamicQR}
              onCheckedChange={(checked) =>
                setShopProfile((prev) => ({
                  ...prev,
                  dynamicQR: checked,
                  // staticQR: checked ? false : prev.staticQR,
                }))
              }
            />
          </div>

          {/* DYNAMIC QR SECTION - APPEARS RIGHT BELOW TOGGLE */}
          {shopProfile.dynamicQR && (
            <Card className="border-amber-200 bg-amber-50 animate-in slide-in-from-top">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900">
                  <Zap className="w-5 h-5" />
                  {i18nT("Dynamic QR Configuration")}
                </CardTitle>
                <CardDescription>
                  QR codes auto-generate at checkout with exact order amount. To
                  get started just upload the PaymentQR image at the Static QR
                  Code Section
                </CardDescription>
                <CardDescription>
                  <p className="text-amber-900 font-semibold">
                    Please Check Your Store Order a Small Product and Verify the
                    Dynamic QR code *.
                  </p>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* HOW IT WORKS */}
                <div className="bg-card border border-amber-200 rounded-lg p-4">
                  <div className="flex gap-3">
                    <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-900 space-y-2">
                      <p className="font-semibold">{i18nT("How Dynamic QR works:")}</p>
                      <ul className="list-disc list-inside text-xs space-y-1">
                        <li>
                          When customer checks out, unique QR generates with
                          exact amount
                        </li>
                        <li>
                          {i18nT("Customer scans to pay precise amount (no manual entry)")}
                        </li>
                        <li>{i18nT("Works with UPI (Google Pay, PhonePe, Paytm)")}</li>
                        {/* <li>{i18nT("Also works with PayNow (Singapore)")}</li> */}
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          </></LockedSection>

          {/* CARD PAYMENTS TOGGLE */}
          {/* <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted transition bg-card">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              <div>
                <Label className="font-semibold text-foreground">
                  {i18nT("Card Payments")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {i18nT("Accept Visa, Mastercard, Amex via Stripe")}
                </p>
              </div>
            </div>
            <Switch
              checked={paymentMethods.razorpayCards}
              onCheckedChange={(checked) =>
                setPaymentMethods((prev) => ({
                  ...prev,
                  razorpayCards: checked,
                }))
              }
            />
          </div> */}

          {/* CARD PAYMENTS SECTION - APPEARS RIGHT BELOW TOGGLE */}
          <LockedSection
            locked={!!isModuleEnabled && !isModuleEnabled("razorpay")}
            label="Card Payments — not in your plan"
            onUpgrade={openChangePlan}
          ><>
          {/* 🔘 RAZORPAY CARD PAYMENTS TOGGLE — controls customer visibility.
              When configured, persists immediately to backend via PATCH. */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted transition bg-card">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              <div>
                <Label className="font-semibold text-foreground flex items-center gap-2">
                  Credit Cards Payments
                  {razorpayConfigured && paymentMethods.razorpayCards && (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border border-green-200 text-[10px] uppercase tracking-wide">
                      {i18nT("Live")}
                    </Badge>
                  )}
                  {razorpayConfigured && !paymentMethods.razorpayCards && (
                    <Badge className="bg-muted text-foreground hover:bg-muted border border-border text-[10px] uppercase tracking-wide">
                      {i18nT("Configured · Off")}
                    </Badge>
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {razorpayConfigured
                    ? paymentMethods.razorpayCards
                      ? "Customers see the Razorpay card on checkout. Toggle off to hide it without removing your keys."
                      : "Keys are saved but customers won't see the Razorpay option. Toggle on to re-enable."
                    : "Accept cards, UPI, netbanking via Razorpay"}
                </p>
              </div>
            </div>
            <Switch
              checked={paymentMethods.razorpayCards}
              disabled={razorpayToggleSaving}
              onCheckedChange={(checked) => {
                setPaymentMethods((prev) => ({
                  ...prev,
                  razorpayCards: checked,
                }));
                // Reading from a ref instead of closure-state — `razorpayConfigured`
                // closure can be stale if the user clicks before status fetch lands.
                if (razorpayConfiguredRef.current) {
                  persistRazorpayToggle(checked);
                }
              }}
            />
          </div>

          {/* Razorpay setup card. Always visible when keys are already saved
              (so the shopkeeper can update / inspect them) OR when the toggle
              is ON (so they can enter keys for the first time). Route flow
              hidden until Partner enrollment. */}
          {(paymentMethods.razorpayCards || razorpayConfigured) && (
            <Card className="border-indigo-200 animate-in slide-in-from-top">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <CreditCard className="w-5 h-5" />
                  {i18nT("Razorpay Payments")}
                </CardTitle>
                <CardDescription>
                  Accept cards, UPI and netbanking with your own Razorpay
                  account. Payments settle directly to your bank — KiosCart
                  never holds your money.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RazorpayDirectSetup
                  onStatusChange={(enabled) => {
                    setRazorpayConfigured(enabled);
                    razorpayConfiguredRef.current = enabled;
                    if (enabled) {
                      setPaymentMethods((prev) => ({
                        ...prev,
                        razorpayCards: true,
                      }));
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Legacy razorpay setup block (kept for reference; remove once
              the new onboarding flow above is verified end-to-end). */}
          {false && paymentMethods.razorpayCards && (
            <Card className="border-indigo-200 bg-indigo-50 animate-in slide-in-from-top">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <CreditCard className="w-5 h-5" />
                  {i18nT("Razorpay Payment Setup (legacy)")}
                </CardTitle>
                <CardDescription>
                  Configure Razorpay to accept cards, UPI and netbanking from
                  your customers
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* CONNECTION STATUS */}
                {razorpaySettings?.isConnected ? (
                  <div className="bg-card border border-indigo-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-indigo-900">
                          ✅ Razorpay Account Connected
                        </p>
                        <p className="text-xs text-indigo-700 mt-1">
                          Account ID: {razorpaySettings.razorpayAccountId}
                        </p>
                        <p className="text-xs text-indigo-600 mt-2">
                          Your shop can now accept card, UPI and netbanking
                          payments.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-card border border-indigo-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-semibold text-indigo-900">
                          {i18nT("Setup Card Payments for this shop")}
                        </p>
                        <p className="text-xs text-indigo-700 mt-1 mb-4">
                          Enter your business and bank details below. Your
                          Razorpay account will be created and submitted for KYC
                          review.
                        </p>

                        {/* RAZORPAY SETUP FORM */}
                        <div className="space-y-3 p-3 bg-indigo-50 border border-indigo-200 rounded">
                          {/* BUSINESS INFO */}
                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpBusinessName"
                              className="text-xs font-semibold"
                            >
                              {i18nT("Business Name")}
                            </Label>
                            <Input
                              id="rzpBusinessName"
                              placeholder={i18nT("Registered business name")}
                              value={razorpaySettings.businessName || ""}
                              onChange={(e) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  businessName: e.target.value,
                                }))
                              }
                              className="text-sm"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpBusinessType"
                              className="text-xs font-semibold"
                            >
                              {i18nT("Business Type")}
                            </Label>
                            <Select
                              value={razorpaySettings.businessType || "sole"}
                              onValueChange={(value) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  businessType: value,
                                }))
                              }
                            >
                              <SelectTrigger
                                id="rzpBusinessType"
                                className="text-sm"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="proprietorship">
                                  {i18nT("Sole Proprietor")}
                                </SelectItem>
                                <SelectItem value="partnership">
                                  {i18nT("Partnership")}
                                </SelectItem>
                                <SelectItem value="private_limited">
                                  {i18nT("Private Limited")}
                                </SelectItem>
                                <SelectItem value="llp">{i18nT("LLP")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* COUNTRY-SPECIFIC KYC */}
                          {shopProfile?.country === "IN" ? (
                            <>
                              <div className="space-y-1">
                                <Label
                                  htmlFor="rzpPan"
                                  className="text-xs font-semibold"
                                >
                                  {i18nT("PAN Number")}
                                </Label>
                                <Input
                                  id="rzpPan"
                                  placeholder={i18nT("AAABP5055K")}
                                  value={razorpaySettings.panNumber || ""}
                                  onChange={(e) =>
                                    setRazorpaySettings((prev) => ({
                                      ...prev,
                                      panNumber: e.target.value
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9]/g, ""),
                                    }))
                                  }
                                  maxLength={10}
                                  className="text-sm font-mono uppercase"
                                />
                                <p className="text-xs text-muted-foreground">
                                  10 characters: 5 letters, 4 numbers, 1 letter
                                </p>
                              </div>

                              <div className="space-y-1">
                                <Label
                                  htmlFor="rzpGst"
                                  className="text-xs font-semibold"
                                >
                                  {i18nT("GST Number (Optional)")}
                                </Label>
                                <Input
                                  id="rzpGst"
                                  placeholder="27AAPFU0055F1Z5"
                                  value={razorpaySettings.gstNumber || ""}
                                  onChange={(e) =>
                                    setRazorpaySettings((prev) => ({
                                      ...prev,
                                      gstNumber: e.target.value
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9]/g, ""),
                                    }))
                                  }
                                  maxLength={15}
                                  className="text-sm font-mono uppercase"
                                />
                              </div>
                            </>
                          ) : (
                            <div className="space-y-1">
                              <Label
                                htmlFor="rzpUen"
                                className="text-xs font-semibold"
                              >
                                {i18nT("UEN Number")}
                              </Label>
                              <Input
                                id="rzpUen"
                                placeholder="123456789A"
                                value={razorpaySettings.uenNumber || ""}
                                onChange={(e) =>
                                  setRazorpaySettings((prev) => ({
                                    ...prev,
                                    uenNumber: e.target.value
                                      .toUpperCase()
                                      .replace(/[^A-Z0-9]/g, ""),
                                  }))
                                }
                                maxLength={10}
                                className="text-sm font-mono uppercase"
                              />
                              <p className="text-xs text-muted-foreground">
                                9–10 characters: UEN
                              </p>
                            </div>
                          )}

                          {/* CONTACT */}
                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpEmail"
                              className="text-xs font-semibold"
                            >
                              {i18nT("Business Email")}
                            </Label>
                            <Input
                              id="rzpEmail"
                              type="email"
                              placeholder={i18nT("billing@yourbusiness.com")}
                              value={razorpaySettings.businessEmail || ""}
                              onChange={(e) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  businessEmail: e.target.value,
                                }))
                              }
                              className="text-sm"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpPhone"
                              className="text-xs font-semibold"
                            >
                              {i18nT("Business Phone")}
                            </Label>
                            <Input
                              id="rzpPhone"
                              placeholder="+91 98xxxxxx"
                              value={razorpaySettings.businessPhone || ""}
                              onChange={(e) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  businessPhone: e.target.value,
                                }))
                              }
                              className="text-sm"
                            />
                          </div>

                          {/* BANK DETAILS */}
                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpAccountHolder"
                              className="text-xs font-semibold"
                            >
                              {i18nT("Account Holder Name")}
                            </Label>
                            <Input
                              id="rzpAccountHolder"
                              placeholder={i18nT("Name on bank account")}
                              value={razorpaySettings.accountHolderName || ""}
                              onChange={(e) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  accountHolderName: e.target.value,
                                }))
                              }
                              className="text-sm"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpBankName"
                              className="text-xs font-semibold"
                            >
                              {i18nT("Bank Name")}
                            </Label>
                            <Select
                              value={razorpaySettings.bankName || ""}
                              onValueChange={(value) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  bankName: value,
                                }))
                              }
                            >
                              <SelectTrigger
                                id="rzpBankName"
                                className="text-sm"
                              >
                                <SelectValue placeholder={i18nT("Select bank")} />
                              </SelectTrigger>
                              <SelectContent>
                                {shopProfile?.country === "IN" ? (
                                  <>
                                    <SelectItem value="HDFC">
                                      {i18nT("HDFC Bank")}
                                    </SelectItem>
                                    <SelectItem value="ICICI">
                                      {i18nT("ICICI Bank")}
                                    </SelectItem>
                                    <SelectItem value="SBI">
                                      {i18nT("State Bank of India")}
                                    </SelectItem>
                                    <SelectItem value="AXIS">
                                      {i18nT("Axis Bank")}
                                    </SelectItem>
                                    <SelectItem value="KOTAK">
                                      {i18nT("Kotak Mahindra")}
                                    </SelectItem>
                                  </>
                                ) : (
                                  <>
                                    <SelectItem value="DBS">
                                      {i18nT("DBS Bank")}
                                    </SelectItem>
                                    <SelectItem value="OCBC">
                                      {i18nT("OCBC Bank")}
                                    </SelectItem>
                                    <SelectItem value="UOB">
                                      {i18nT("UOB Bank")}
                                    </SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpAccountNumber"
                              className="text-xs font-semibold"
                            >
                              {i18nT("Account Number")}
                            </Label>
                            <Input
                              id="rzpAccountNumber"
                              type="password"
                              placeholder={i18nT("Your bank account number")}
                              value={razorpaySettings.bankAccountNumber || ""}
                              onChange={(e) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  bankAccountNumber: e.target.value,
                                }))
                              }
                              className="text-sm font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                              {i18nT("Encrypted and never shared")}
                            </p>
                          </div>

                          <div className="space-y-1">
                            <Label
                              htmlFor="rzpIfsc"
                              className="text-xs font-semibold"
                            >
                              {shopProfile?.country === "IN"
                                ? "IFSC Code"
                                : "Swift Code"}
                            </Label>
                            <Input
                              id="rzpIfsc"
                              placeholder={
                                shopProfile?.country === "IN"
                                  ? "HDFC0001234"
                                  : "DBSASGSG"
                              }
                              value={razorpaySettings.ifscCode || ""}
                              onChange={(e) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  ifscCode: e.target.value
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9]/g, ""),
                                }))
                              }
                              maxLength={11}
                              className="text-sm font-mono uppercase"
                            />
                          </div>

                          {/* CONSENT */}
                          <div className="flex items-start gap-2 mt-2">
                            <input
                              id="rzpConsent"
                              type="checkbox"
                              checked={razorpaySettings.consent || false}
                              onChange={(e) =>
                                setRazorpaySettings((prev) => ({
                                  ...prev,
                                  consent: e.target.checked,
                                }))
                              }
                              className="mt-0.5"
                            />
                            <label
                              htmlFor="rzpConsent"
                              className="text-[11px] text-muted-foreground"
                            >
                              I agree to Razorpay’s Terms & Conditions and
                              authorize KiosCart to submit my KYC and bank
                              details to Razorpay for payment gateway setup.
                            </label>
                          </div>

                          {/* CONNECT BUTTON */}
                          <Button
                            // onClick={handleConnectRazorpay}
                            disabled={
                              isConnectingRazorpay ||
                              !razorpaySettings.businessName ||
                              !razorpaySettings.accountHolderName ||
                              !razorpaySettings.bankAccountNumber ||
                              !razorpaySettings.ifscCode ||
                              !razorpaySettings.businessEmail ||
                              !razorpaySettings.businessPhone ||
                              (shopProfile?.country === "IN"
                                ? !razorpaySettings.panNumber
                                : !razorpaySettings.uenNumber) ||
                              !razorpaySettings.consent
                            }
                            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700"
                          >
                            {isConnectingRazorpay ? (
                              <>
                                <Loader className="w-4 h-4 animate-spin mr-2" />
                                {i18nT("Submitting details to Verify...")}
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="w-4 h-4 mr-2" />
                                {i18nT("Setup Card Payments")}
                              </>
                            )}
                          </Button>

                          <p className="text-xs text-muted-foreground text-center mt-1">
                            Your details are encrypted and sent securely to
                            Razorpay. Activation usually takes 1–3 business
                            days.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* OPTIONAL SETTINGS AFTER CONNECT (similar to Stripe card settings) */}
                {razorpaySettings?.isConnected && (
                  <div className="space-y-4 p-4 bg-card border border-indigo-200 rounded-lg">
                    <h4 className="font-semibold text-foreground">
                      {i18nT("Payment Options")}
                    </h4>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">
                        {i18nT("Enable payment methods")}
                      </Label>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={razorpaySettings.enableCards ?? true}
                            onChange={(e) =>
                              setRazorpaySettings((prev) => ({
                                ...prev,
                                enableCards: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded"
                          />
                          {i18nT("Cards (Visa, Mastercard, RuPay, Amex)")}
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={razorpaySettings.enableUpi ?? true}
                            onChange={(e) =>
                              setRazorpaySettings((prev) => ({
                                ...prev,
                                enableUpi: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded"
                          />
                          UPI
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={razorpaySettings.enableNetbanking ?? true}
                            onChange={(e) =>
                              setRazorpaySettings((prev) => ({
                                ...prev,
                                enableNetbanking: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded"
                          />
                          {i18nT("Netbanking")}
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={razorpaySettings.enableWallets ?? false}
                            onChange={(e) =>
                              setRazorpaySettings((prev) => ({
                                ...prev,
                                enableWallets: e.target.checked,
                              }))
                            }
                            className="w-4 h-4 rounded"
                          />
                          {i18nT("Wallets")}
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          </></LockedSection>

          {/* 💾 SAVE BUTTON - BOTTOM */}
          {/* <Button
            onClick={handleSavePaymentSettings}
            disabled={
              isLoading ||
              (!paymentMethods.staticQR &&
                !paymentMethods.dynamicQR &&
                !paymentMethods.cardPayments)
            }
            className="w-full bg-blue-600 hover:bg-blue-700 font-semibold text-base"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader className="w-4 h-4 animate-spin mr-2" />
                {i18nT("Saving Payment Settings...")}
              </>
            ) : (
              "Save All Payment Methods"
            )}
          </Button> */}

          {/* Gmail Payment Email Tracking */}
          <LockedSection
            locked={!!isModuleEnabled && !isModuleEnabled("paymentTracking")}
            label="Payment Tracking — not in your plan"
            onUpgrade={openChangePlan}
          >
            <GmailPaymentSection />
          </LockedSection>
        </TabsContent>

        <TabsContent value="shipping">
          <BlurWrapper>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  {i18nT("Shipping Settings")}
                </CardTitle>
                <CardDescription>
                  {i18nT("Configure shipping options and rates")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>{i18nT("Free Shipping Threshold")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={shippingSettings.freeShippingThreshold}
                      onChange={(e) =>
                        setShippingSettings((prev) => ({
                          ...prev,
                          freeShippingThreshold:
                            parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>{i18nT("Default Shipping Cost")}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={shippingSettings.defaultShippingCost}
                      onChange={(e) =>
                        setShippingSettings((prev) => ({
                          ...prev,
                          defaultShippingCost: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </BlurWrapper>
        </TabsContent>

        <TabsContent value="receipts">
          <ModuleGate moduleKey="receipts" fallbackText="Upgrade your plan to access Receipt Settings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptTextIcon className="w-5 h-5" />
                {i18nT("Receipt Settings")}
              </CardTitle>
              <CardDescription>
                {i18nT("Customize your order receipt appearance and details")}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* RECEIPT TYPE */}
              <div className="space-y-4 border-t pt-4">
                <div>
                  <Label className="text-sm font-medium">{i18nT("Receipt Type")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {i18nT("Choose receipt paper size for printing")}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {/* 58MM */}
                  <label
                    className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition
      ${
        shopProfile.receiptType === "58MM"
          ? "border-blue-600 bg-blue-50"
          : "border-border hover:bg-muted"
      }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">58 mm</span>
                      <span className="text-xs text-muted-foreground">
                        {i18nT("Thermal receipt printer")}
                      </span>
                    </div>

                    <input
                      type="radio"
                      name="receiptType"
                      className="accent-blue-600"
                      checked={shopProfile.receiptType === "58MM"}
                      onChange={() =>
                        setShopProfile((prev) => ({
                          ...prev,
                          receiptType: "58MM",
                        }))
                      }
                    />
                  </label>

                  {/* A4 */}
                  <label
                    className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition
      ${
        shopProfile.receiptType === "A4"
          ? "border-blue-600 bg-blue-50"
          : "border-border hover:bg-muted"
      }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">A4</span>
                      <span className="text-xs text-muted-foreground">
                        {i18nT("Full page printer")}
                      </span>
                    </div>

                    <input
                      type="radio"
                      name="receiptType"
                      className="accent-blue-600"
                      checked={shopProfile.receiptType === "A4"}
                      onChange={() =>
                        setShopProfile((prev) => ({
                          ...prev,
                          receiptType: "A4",
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              {/* QR CODE SETTINGS */}
              <div className="space-y-4 border-t pt-4">
                {/* WhatsApp QR */}
                {isModuleEnabled("whatsappQR") && (
                <div className="space-y-4">
                  {/* TOGGLE */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">
                        {i18nT("Print Contact QR")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {i18nT("Prints WhatsApp QR on receipt")}
                      </p>
                    </div>

                    <Switch
                      checked={shopProfile.whatsAppQR}
                      onCheckedChange={(checked) =>
                        setShopProfile((prev) => ({
                          ...prev,
                          whatsAppQR: checked,
                          // Auto-select default number when enabled
                          whatsAppQRNumber: checked
                            ? prev.whatsappNumber || prev.phone
                            : "",
                        }))
                      }
                    />
                  </div>

                  {/* NUMBER SELECTION */}
                  {shopProfile.whatsAppQR && (
                    <div className="pl-4 space-y-3">
                      <Label className="text-xs text-muted-foreground">
                        {i18nT("Select WhatsApp number to print on receipt")}
                      </Label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {/* WhatsApp Number */}
                        {shopProfile.whatsappNumber && (
                          <label
                            className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition
            ${
              shopProfile.whatsAppQRNumber === shopProfile.whatsappNumber
                ? "border-blue-600 bg-blue-50"
                : "border-border hover:bg-muted"
            }`}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">
                                {i18nT("WhatsApp")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {shopProfile.whatsappNumber}
                              </span>
                            </div>

                            <input
                              type="radio"
                              name="whatsappQRNumber"
                              className="accent-blue-600"
                              checked={
                                shopProfile.whatsAppQRNumber ===
                                shopProfile.whatsappNumber
                              }
                              onChange={() =>
                                setShopProfile((prev) => ({
                                  ...prev,
                                  whatsAppQRNumber: prev.whatsappNumber,
                                }))
                              }
                            />
                          </label>
                        )}

                        {/* Phone Number */}
                        {shopProfile.phone && (
                          <label
                            className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition
            ${
              shopProfile.whatsAppQRNumber === shopProfile.phone
                ? "border-blue-600 bg-blue-50"
                : "border-border hover:bg-muted"
            }`}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{i18nT("Phone")}</span>
                              <span className="text-xs text-muted-foreground">
                                {shopProfile.phone}
                              </span>
                            </div>

                            <input
                              type="radio"
                              name="whatsappQRNumber"
                              className="accent-blue-600"
                              checked={
                                shopProfile.whatsAppQRNumber ===
                                shopProfile.phone
                              }
                              onChange={() =>
                                setShopProfile((prev) => ({
                                  ...prev,
                                  whatsAppQRNumber: prev.phone,
                                }))
                              }
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* Instagram QR */}
                <div className="flex items-center justify-between mt-4">
                  <div>
                    <Label className="text-sm font-medium">
                      {i18nT("Print Instagram QR")}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {i18nT("Prints Instagram QR on receipt")}
                    </p>
                  </div>
                  <Switch
                    checked={shopProfile.instagramQR}
                    onCheckedChange={(checked) =>
                      setShopProfile((prev) => ({
                        ...prev,
                        instagramQR: checked,
                      }))
                    }
                  />
                </div>

                {shopProfile.instagramQR && (
                  <div className="pl-4 space-y-1">
                    <Label htmlFor="instagramHandle" className="text-xs">
                      {i18nT("Instagram Handle")}
                    </Label>
                    <Input
                      id="instagramHandle"
                      placeholder="https://instagram.com/yourhandle"
                      value={shopProfile.instagramHandle}
                      onChange={(e) =>
                        setShopProfile((prev) => ({
                          ...prev,
                          instagramHandle: e.target.value.replace("@", ""),
                        }))
                      }
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          </ModuleGate>
        </TabsContent>

        <TabsContent value="coupons">
          <ModuleGate moduleKey="coupons" fallbackText="Upgrade your plan to access Coupons">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptTextIcon className="w-5 h-5" />
                {i18nT("Coupon Settings")}
              </CardTitle>
              <CardDescription>
                {i18nT("Create and Manage your Coupons here")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">{i18nT("Coupons")}</h3>

                <Button onClick={handleAddCoupon}>+ Add Coupon</Button>
              </div>

              {coupons.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {i18nT("No Coupons Found")}
                </div>
              ) : (
                <div className="space-y-3">
                  {coupons.map((c) => (
                    <Card key={c._id}>
                      <CardContent className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-semibold">{c.code}</p>
                          <p className="text-sm text-muted-foreground">
                            {c.discountType === "PERCENTAGE"
                              ? `${c.discountPercentage}% off`
                              : `₹${c.flatDiscountAmount} off`}
                          </p>
                          <p className="text-xs">
                            Expires: {new Date(c.expiryDate).toDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* ACTIVE */}
                          <Switch
                            checked={c.isActive}
                            onCheckedChange={() => {
                              handleToggleActiveCoupon(c._id, !c.isActive);
                            }}
                          />

                          {/* EDIT */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCoupon(c)}
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>

                          {/* DELETE */}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setCouponToDelete(c._id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </ModuleGate>
        </TabsContent>

        <Dialog open={openCouponDialog} onOpenChange={setOpenCouponDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {isEditMode ? "Update Coupon" : "Create Coupon"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {/* COUPON CODE */}
              <div className="flex flex-col-2 gap-4">
                <div className="space-y-1 flex-1">
                  <Label>{i18nT("Coupon Code")}</Label>
                  <Input
                    placeholder={i18nT("SAVE20")}
                    value={coupon.code}
                    onChange={(e) =>
                      handleChange("code", e.target.value.toUpperCase())
                    }
                    disabled={isEditMode} // don't allow code change on update
                  />
                </div>

                {/* DISCOUNT TYPE */}
                <div className="space-y-1 flex-1">
                  <Label>{i18nT("Discount Type")}</Label>
                  <Select
                    value={coupon.discountType}
                    onValueChange={(value) =>
                      handleChange("discountType", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={i18nT("Select discount type")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">{i18nT("Percentage")}</SelectItem>
                      <SelectItem value="FLAT">{i18nT("Flat Amount")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* DISCOUNT VALUE */}
              {coupon.discountType === "PERCENTAGE" && (
                <div className="space-y-1">
                  <Label>{i18nT("Discount Percentage (%) *")}</Label>
                  <Input
                    type="number"
                    placeholder="10"
                    min={0}
                    value={coupon.discountPercentage}
                    onChange={(e) =>
                      handleChange("discountPercentage", e.target.value)
                    }
                  />
                </div>
              )}

              {coupon.discountType === "FLAT" && (
                <div className="space-y-1">
                  <Label>{i18nT("Flat Discount Amount *")}</Label>
                  <Input
                    type="number"
                    placeholder="100"
                    min={0}
                    value={coupon.flatDiscountAmount}
                    onChange={(e) =>
                      handleChange("flatDiscountAmount", e.target.value)
                    }
                  />
                </div>
              )}

              {/* MIN ORDER */}
              <div className="space-y-1">
                <Label>{i18nT("Minimum Order Amount *")}</Label>
                <Input
                  type="number"
                  placeholder="500"
                  min={0}
                  value={coupon.minOrderAmount}
                  onChange={(e) =>
                    handleChange("minOrderAmount", e.target.value)
                  }
                />
              </div>

              <div className="flex flex-col-2 gap-4">
                <div className="space-y-1 flex-1">
                  <Label>{i18nT("Maximum Usage")}</Label>
                  <Input
                    type="number"
                    placeholder="50"
                    min={0}
                    value={coupon.maxUsage}
                    onChange={(e) => handleChange("maxUsage", e.target.value)}
                  />
                </div>

                {/* EXPIRY DATE */}
                <div className="space-y-1 flex-1">
                  <Label>{i18nT("Expiry Date")}</Label>

                  <div className="relative">
                    <Input
                      type="date"
                      min={today}
                      value={coupon.expiryDate}
                      onChange={(e) =>
                        handleChange("expiryDate", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
              {/* MAX USAGE */}
            </div>

            <Button className="w-full mt-4" onClick={handleSubmitCoupon}>
              {isEditMode ? "Update Coupon" : "Create Coupon"}
            </Button>
          </DialogContent>
        </Dialog>

        {/* <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                {i18nT("Notification Settings")}
              </CardTitle>
              <CardDescription>
                {i18nT("Choose which notifications you want to receive")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {Object.entries(notifications).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>
                        {key
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (str) => str.toUpperCase())}
                      </Label>
                    </div>
                    <Switch
                      checked={value}
                      onCheckedChange={(checked) =>
                        setNotifications((prev) => ({
                          ...prev,
                          [key]: checked,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent> */}
      </Tabs>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{i18nT("Delete Coupon")}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this coupon? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setCouponToDelete(null);
              }}
            >
              {i18nT("Cancel")}
            </Button>

            <Button
              variant="destructive"
              onClick={() => {
                if (couponToDelete) {
                  handleDeleteCoupon(couponToDelete);
                }
                setDeleteDialogOpen(false);
                setCouponToDelete(null);
              }}
            >
              {i18nT("Yes, Delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{i18nT("Choose a Plan")}</DialogTitle>
            <DialogDescription>
              {i18nT("Select a plan to upgrade or switch your subscription")}
            </DialogDescription>
          </DialogHeader>
          {loadingPlans ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          ) : availablePlans.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{i18nT("No plans available.")}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              {availablePlans.map((plan) => {
                const isCurrent = subscription?.planId === plan._id;
                const enabledModuleCount = plan.modules
                  ? Object.values(plan.modules).filter((m: any) => m?.enabled).length
                  : 0;
                return (
                  <div
                    key={plan._id}
                    className={`rounded-lg border p-4 space-y-3 ${
                      isCurrent ? "border-indigo-400 bg-indigo-50" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-lg">{plan.planName}</h3>
                        <p className="text-2xl font-bold text-indigo-600 mt-1">
                          ${plan.price}
                          <span className="text-sm font-normal text-muted-foreground">
                            {" "}/ {plan.validityInDays} days
                          </span>
                        </p>
                      </div>
                      {isCurrent && (
                        <Badge className="bg-indigo-600">{i18nT("Current")}</Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {enabledModuleCount} modules included
                    </Badge>
                    {plan.features && plan.features.length > 0 && (
                      <ul className="text-sm space-y-1">
                        {plan.features.slice(0, 5).map((f: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                            <span>{f}</span>
                          </li>
                        ))}
                        {plan.features.length > 5 && (
                          <li className="text-xs text-muted-foreground pl-6">
                            +{plan.features.length - 5} more
                          </li>
                        )}
                      </ul>
                    )}
                    <Button
                      disabled={isCurrent || switchingPlanId === plan._id}
                      onClick={() => switchToPlan(plan._id)}
                      className={`w-full ${isCurrent ? "" : "bg-indigo-600 hover:bg-indigo-700"}`}
                      variant={isCurrent ? "outline" : "default"}
                    >
                      {switchingPlanId === plan._id && (
                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {isCurrent ? "Current Plan" : "Switch to this Plan"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
