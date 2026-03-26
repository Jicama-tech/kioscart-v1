import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Globe,
  Mail,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";

const COUNTRIES = [
  {
    code: "IN",
    name: "India",
    countryCode: "+91",
    docType: "GST",
    transactionLimit: "₹1000",
    contactEmail: "info@kioscart.com",
    contactPhone: "+91-8401201831",
  },
  {
    code: "SG",
    name: "Singapore",
    countryCode: "+65",
    docType: "UEN",
    transactionLimit: "$100",
    contactEmail: "info@kioscart.com",
    contactPhone: "+65-90037950",
  },
];

const BUSINESS_CATEGORIES = [
  "Technology",
  "Music",
  "Food",
  "Sports",
  "Arts",
  "Fashion",
  "Electronics",
  "Other",
];

export function ShopKeeperRegister() {
  const apiURL = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();
  const location = useLocation();
  const { name: initialName = "", email: initialEmail = "" } =
    location.state || {};
  const { toast } = useToast();

  // Country selection
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const currentCountry = selectedCountry
    ? COUNTRIES.find((c) => c.code === selectedCountry)
    : null;

  // GST/UEN verification states
  const [gstDetails, setGstDetails] = useState(null);
  const [gstValid, setGstValid] = useState<boolean | null>(null);
  const [ueValid, setUeValid] = useState<boolean | null>(null);

  // Profile state
  const [profile, setProfile] = useState({
    ownerName: initialName,
    shopName: "",
    email: initialEmail,
    businessEmail: "",
    password: "",
    GSTNumber: "",
    UENNumber: "",
    isGSTVerified: false,
    isUENVerified: false,
    phone: "",
    address: "",
    description: "",
    whatsappNumber: "",
    businessCategory: "",
    country: "",
    hasDocVerification: false,
  });

  // Email OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // WhatsApp OTP state
  const [waOtpSent, setWaOtpSent] = useState(false);
  const [waOtp, setWaOtp] = useState("");
  const [waVerified, setWaVerified] = useState(false);
  const [waOtpError, setWaOtpError] = useState("");
  const [sendingWaOtp, setSendingWaOtp] = useState(false);
  const [verifyingWaOtp, setVerifyingWaOtp] = useState(false);

  // Skip verification dialog
  const [showSkipDialog, setShowSkipDialog] = useState(false);

  // General loading
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const APPYFLOW_KEY = import.meta.env.VITE_APPYFLOW_KEY_SECRET;

  const handleCountryChange = (code: string) => {
    // Update states (no await needed)
    setSelectedCountry(code);
    setProfile((prev) => ({
      ...prev,
      country: code,
      GSTNumber: "",
      UENNumber: "",
      whatsappNumber: "",
      phone: code === "SG" ? "+65" : "+91",
      hasDocVerification: false,
    }));
    setGstValid(null);
    setUeValid(null);
  };

  // Add useEffect to DEBUG and confirm update

  const handleChange = (field: string, value: any) => {
    if (field === "businessEmail") {
      setEmailVerified(false);
      setOtpSent(false);
      setOtp("");
      setOtpError("");
    }

    if (field === "whatsappNumber") {
      setWaVerified(false);
      setWaOtpSent(false);
      setWaOtp("");
      setWaOtpError("");
    }

    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  // GST verification
  const handleVerifyGST = async (GSTnumber: string) => {
    try {
      setLoading(true);

      const gstin = GSTnumber?.trim().toUpperCase();
      if (!gstin) {
        toast({
          duration: 5000,
          title: "Error",
          description: "GST Number is required",
        });
        return;
      }

      if (!APPYFLOW_KEY) {
        toast({
          duration: 5000,
          title: "Config error",
          description: "AppyFlow API key not configured",
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
          title: "Verification failed",
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
          title: "GST Verified",
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

        setProfile((prev) => ({
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
          title: "Invalid GST",
          description: "GST number is not valid or inactive",
        });
      }
    } catch (error) {
      console.error("GST verify error", error);
      toast({
        duration: 5000,
        title: "Error",
        description: "Something went wrong while verifying GST",
      });
    } finally {
      setLoading(false);
    }
  };

  // UEN verification
  const handleVerifyUEN = async (UENnumber: string) => {
    try {
      setLoading(true);

      const uen = UENnumber?.trim().toUpperCase();
      if (!uen) {
        toast({
          duration: 5000,
          title: "Error",
          description: "UEN Number is required",
        });
        return;
      }

      const response = await fetch(
        `${apiURL}/uen/verify?uen=${encodeURIComponent(uen)}`,
      );

      if (!response.ok) {
        toast({
          duration: 5000,
          title: "Verification failed",
          description: "Invalid or inactive UEN",
        });
        setUeValid(false);
        return;
      }

      const data = await response.json();

      if (data?.is_uen_valid === true) {
        setUeValid(true);

        // Auto-fill address from UEN data
        const fullAddress = [
          data?.address?.street,
          data?.address?.city,
          data?.address?.postal,
        ]
          .filter(Boolean)
          .join(", ");

        setProfile((prev) => ({
          ...prev,
          address: fullAddress || prev.address,
          isUENVerified: true,
          hasDocVerification: true,
        }));

        toast({
          duration: 5000,
          title: "UEN Verified",
          description: `${data.entityName || uen}`,
        });
      } else {
        setUeValid(false);
        toast({
          duration: 5000,
          title: "Invalid UEN",
          description: "UEN number is not valid or inactive",
        });
      }
    } catch (error) {
      console.error("UEN verify error", error);
      toast({
        duration: 5000,
        title: "Error",
        description: "Something went wrong while verifying UEN",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle skip verification
  const handleSkipVerification = () => {
    setProfile((prev) => ({
      ...prev,
      hasDocVerification: true,
      isGSTVerified: false,
      isUENVerified: false,
    }));
    setShowSkipDialog(false);
    toast({
      duration: 5000,
      title: "Limited Access",
      description: `Transactions above ${currentCountry?.transactionLimit} are restricted. Contact support for verification.`,
    });
  };

  // Email OTP handlers
  const sendOtpToBusinessEmail = async () => {
    if (!profile.businessEmail) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Business email is required",
      });
      return;
    }

    try {
      setSendingOtp(true);
      const token = sessionStorage.getItem("token");
      const response = await fetch(`${apiURL}/otp/send-business-email-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ businessEmail: profile.businessEmail }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to send OTP");
      }

      setOtpSent(true);
      setOtpError("");
      toast({
        duration: 5000,
        title: "OTP Sent",
        description: "OTP sent to your business email",
      });
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Failed to send OTP",
        description: error.message || "Failed to send OTP",
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtpForBusinessEmail = async () => {
    if (!otp || otp.length < 4) {
      setOtpError("Please enter a valid OTP");
      return;
    }

    try {
      setVerifyingOtp(true);
      const token = sessionStorage.getItem("token");
      const response = await fetch(`${apiURL}/otp/verify-business-email-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ businessEmail: profile.businessEmail, otp }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Invalid OTP");
      }

      setEmailVerified(true);
      setOtpError("");
      toast({
        duration: 5000,
        title: "Verified",
        description: "Business email verified",
      });
    } catch (error: any) {
      setOtpError(error.message);
      toast({
        duration: 5000,
        title: "Error",
        description: error.message || "Invalid OTP",
      });
    } finally {
      setVerifyingOtp(false);
    }
  };

  // WhatsApp OTP handlers
  const sendOtpToWhatsApp = async () => {
    if (!profile.whatsappNumber || profile.whatsappNumber.length < 8) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Please enter a valid WhatsApp number with country code.",
      });
      return;
    }

    try {
      setSendingWaOtp(true);
      const token = sessionStorage.getItem("token");
      const response = await fetch(`${apiURL}/otp/send-whatsapp-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ whatsappNumber: profile.whatsappNumber }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to send WhatsApp OTP");
      }

      setWaOtpSent(true);
      setWaOtpError("");
      toast({
        duration: 5000,
        title: "OTP Sent",
        description: "OTP sent to WhatsApp",
      });
    } catch (error: any) {
      toast({
        duration: 5000,
        title: "Failed to send OTP",
        description: error.message || "Failed to send WhatsApp OTP",
      });
    } finally {
      setSendingWaOtp(false);
    }
  };

  const verifyOtpForWhatsApp = async () => {
    if (!waOtp || waOtp.length < 4) {
      setWaOtpError("Please enter a valid OTP");
      return;
    }

    try {
      setVerifyingWaOtp(true);
      const token = sessionStorage.getItem("token");
      const response = await fetch(`${apiURL}/otp/verify-whatsapp-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          whatsappNumber: profile.whatsappNumber,
          otp: waOtp,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Invalid WhatsApp OTP");
      }

      setWaVerified(true);
      setWaOtpError("");
      toast({
        duration: 5000,
        title: "Verified",
        description: "WhatsApp number verified",
      });
    } catch (error: any) {
      setWaOtpError(error.message);
      toast({
        duration: 5000,
        title: "Error",
        description: error.message || "Invalid OTP",
      });
    } finally {
      setVerifyingWaOtp(false);
    }
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emailVerified) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Please verify your business email",
      });
      return;
    }

    if (!waVerified) {
      toast({
        duration: 5000,
        title: "Error",
        description: "Please verify your WhatsApp number",
      });
      return;
    }

    // if (!profile.hasDocVerification) {
    //   toast({
    //     duration: 5000,
    //     title: "Error",
    //     description:
    //       "Please verify your document or proceed without verification",
    //   });
    //   return;
    // }

    setIsSubmitting(true);
    // const token = sessionStorage.getItem("token");

    // if (!token) {
    //   toast({ duration: 5000, title: "Error", description: "Please login to continue" });
    //   navigate("/login");
    //   setIsSubmitting(false);
    //   return;
    // }

    try {
      const response = await fetch(`${apiURL}/shopkeepers/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: profile.ownerName,
          shopName: profile.shopName,
          email: profile.email,
          businessEmail: profile.businessEmail,
          password: profile.password,
          phone: profile.phone,
          address: profile.address,
          description: profile.description,
          hasDocVerification: profile.hasDocVerification,
          whatsappNumber: `+${profile.whatsappNumber}`,
          businessCategory: profile.businessCategory,
          country: profile.country,
          GSTNumber: profile.GSTNumber,
          UENNumber: profile.UENNumber,
          isGSTVerified: profile.isGSTVerified,
          isUENVerified: profile.isUENVerified,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Registration failed");
      }

      toast({
        duration: 5000,
        title: "Registration Success",
        description:
          "Registration complete! we’ll notify you as soon as your account is approved so you can start using KiosCart.",
      });
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Registration failed",
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine if form is blurred
  const isFormBlurred = !selectedCountry;
  const shouldDisableFollowingFields = !emailVerified && !waVerified;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Vendor Registration</CardTitle>
          <CardDescription>Register for your Kiosk and Cart.</CardDescription>
        </CardHeader>

        <CardContent>
          <div
            className={`grid gap-2 mb-3 ${
              profile.hasDocVerification ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <Label htmlFor="country" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Country <span className="text-red-600">*</span>
            </Label>
            <Select
              value={selectedCountry || ""}
              onValueChange={handleCountryChange}
              disabled={profile.hasDocVerification} // Also disable Select
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select a country" />
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

          {/* GST/UEN Verification Section */}
          {/* {selectedCountry && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 space-y-4 mb-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-3">
                    {currentCountry?.docType} Verification Required
                  </h3>
                  <p className="text-sm text-blue-800 mb-4">
                    Please verify your {currentCountry?.docType} number to
                    proceed with registration.
                  </p>

                  {selectedCountry === "IN" && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={profile.GSTNumber}
                          onChange={(e) =>
                            handleChange(
                              "GSTNumber",
                              e.target.value.toUpperCase(),
                            )
                          }
                          placeholder="Enter GSTIN (15 characters)"
                          maxLength={15}
                          className="uppercase"
                        />
                        <Button
                          type="button"
                          onClick={() => handleVerifyGST(profile.GSTNumber)}
                          disabled={loading || !profile.GSTNumber}
                          className="whitespace-nowrap"
                        >
                          {loading
                            ? "Verifying..."
                            : gstValid
                              ? "Verified ✓"
                              : "Verify GST"}
                        </Button>
                      </div>
                      {gstValid === false && (
                        <p className="text-sm text-red-600">
                          Invalid or inactive GST number
                        </p>
                      )}
                      {gstValid === true && (
                        <p className="text-sm text-green-600">
                          ✓ GST verified successfully
                        </p>
                      )}
                    </div>
                  )}

                  {selectedCountry === "SG" && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={profile.UENNumber}
                          onChange={(e) =>
                            handleChange(
                              "UENNumber",
                              e.target.value.toUpperCase(),
                            )
                          }
                          placeholder="Enter UEN (9-10 characters)"
                          maxLength={10}
                          className="uppercase"
                        />
                        <Button
                          type="button"
                          onClick={() => handleVerifyUEN(profile.UENNumber)}
                          disabled={loading || !profile.UENNumber}
                          className="whitespace-nowrap"
                        >
                          {loading
                            ? "Verifying..."
                            : ueValid
                              ? "Verified ✓"
                              : "Verify UEN"}
                        </Button>
                      </div>
                      {ueValid === false && (
                        <p className="text-sm text-red-600">
                          Invalid or inactive UEN number
                        </p>
                      )}
                      {ueValid === true && (
                        <p className="text-sm text-green-600">
                          ✓ UEN verified successfully
                        </p>
                      )}
                    </div>
                  )}

                  {!profile.hasDocVerification && (
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full text-sm"
                        onClick={() => setShowSkipDialog(true)}
                      >
                        Proceed Without {currentCountry?.docType} Verification
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )} */}
          <form
            onSubmit={handleSubmit}
            className={`space-y-6 ${
              isFormBlurred ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {/* Business Email with OTP */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="businessEmail"
                  className="flex items-center gap-2"
                >
                  <Mail className="w-4 h-4 text-gray-600" />
                  Business Email <span className="text-red-600">*</span>
                </Label>
                {emailVerified && (
                  <Badge className="bg-green-600">
                    <CheckCircle className="w-4 h-4 mr-1" /> Verified
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  id="businessEmail"
                  type="email"
                  value={profile.businessEmail}
                  onChange={(e) =>
                    handleChange("businessEmail", e.target.value)
                  }
                  placeholder="business@example.com"
                />
                <Button
                  type="button"
                  onClick={sendOtpToBusinessEmail}
                  disabled={
                    sendingOtp || !profile.businessEmail || emailVerified
                  }
                >
                  {sendingOtp
                    ? "Sending..."
                    : emailVerified
                      ? "Verified"
                      : "Send OTP"}
                </Button>
              </div>
              {otpSent && !emailVerified && (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="Enter OTP"
                  />
                  <Button
                    type="button"
                    onClick={verifyOtpForBusinessEmail}
                    disabled={verifyingOtp}
                  >
                    {verifyingOtp ? "Verifying..." : "Verify"}
                  </Button>
                </div>
              )}
              {otpError && <p className="text-sm text-red-600">{otpError}</p>}
            </div>

            {/* WhatsApp Number with OTP */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="whatsappNumber"
                  className="flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 text-green-600" />
                  WhatsApp Number ({currentCountry?.countryCode}){" "}
                  <span className="text-red-600">*</span>
                  <p className="text-s">
                    (This will be needed at the time of login in to the
                    dashboard).
                  </p>
                </Label>
                {waVerified && (
                  <Badge className="bg-green-600">
                    <CheckCircle className="w-4 h-4 mr-1" /> Verified
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <PhoneInput
                  country={selectedCountry?.toLowerCase() || "in"}
                  value={profile.whatsappNumber}
                  onChange={(value) => handleChange("whatsappNumber", value)}
                  disabled={waVerified || !emailVerified}
                  // This locks the dropdown to ONLY the selected country
                  onlyCountries={
                    selectedCountry
                      ? [selectedCountry.toLowerCase()]
                      : ["in", "sg"]
                  }
                  // Optional: Prevents the user from deleting the country code manually
                  countryCodeEditable={false}
                  inputStyle={{ width: "100%" }}
                  dropdownStyle={{ zIndex: 100 }}
                />
                <Button
                  type="button"
                  onClick={sendOtpToWhatsApp}
                  disabled={
                    sendingWaOtp || !profile.whatsappNumber || waVerified
                  }
                >
                  {sendingWaOtp
                    ? "Sending..."
                    : waVerified
                      ? "Verified"
                      : "Send OTP"}
                </Button>
              </div>
              {waOtpSent && !waVerified && (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={waOtp}
                    onChange={(e) => setWaOtp(e.target.value)}
                    placeholder="Enter WhatsApp OTP"
                  />
                  <Button
                    type="button"
                    onClick={verifyOtpForWhatsApp}
                    disabled={verifyingWaOtp}
                  >
                    {verifyingWaOtp ? "Verifying..." : "Verify"}
                  </Button>
                </div>
              )}
              {waOtpError && (
                <p className="text-sm text-red-600">{waOtpError}</p>
              )}
            </div>

            {/* Owner Name */}
            <div className="grid gap-2">
              <Label htmlFor="ownerName">
                Owner Name <span className="text-red-600">*</span>
              </Label>
              <Input
                id="ownerName"
                value={profile.ownerName}
                onChange={(e) => handleChange("ownerName", e.target.value)}
                placeholder="John Doe"
                disabled={shouldDisableFollowingFields}
              />
            </div>

            {/* Shop Name */}
            <div className="grid gap-2">
              <Label htmlFor="shopName">
                Shop Name <span className="text-red-600">*</span>
              </Label>
              <Input
                id="shopName"
                value={profile.shopName}
                onChange={(e) => handleChange("shopName", e.target.value)}
                placeholder="My Awesome Store"
                disabled={shouldDisableFollowingFields}
              />
            </div>

            {/* Business Category */}
            <div className="grid gap-2">
              <Label htmlFor="businessCategory">
                Business Category <span className="text-red-600">*</span>
              </Label>
              <Select
                value={profile.businessCategory}
                onValueChange={(val) => handleChange("businessCategory", val)}
                disabled={shouldDisableFollowingFields}
              >
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Primary Email */}
            <div className="grid gap-2">
              <Label htmlFor="email">Primary Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="owner@example.com"
                disabled={shouldDisableFollowingFields}
              />
            </div>

            {/* Phone */}
            <div className="grid gap-2">
              <Label htmlFor="phone">
                Phone ({currentCountry?.countryCode})
              </Label>
              <PhoneInput
                country={selectedCountry?.toLowerCase() || "in"}
                value={profile.phone}
                onChange={(value) => handleChange("phone", value)}
                // This prevents the user from picking other countries
                onlyCountries={
                  selectedCountry
                    ? [selectedCountry.toLowerCase()]
                    : ["in", "sg"]
                }
                countryCodeEditable={false}
                disabled={shouldDisableFollowingFields}
                inputStyle={{ width: "100%" }}
                dropdownStyle={{ zIndex: 100 }}
              />
            </div>

            {/* Address */}
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={profile.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Full address"
                disabled={shouldDisableFollowingFields}
              />
            </div>

            {/* Description */}
            {/* <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={profile.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="About your shop and services"
                disabled={shouldDisableFollowingFields}
              />
            </div> */}

            <p className="align-center text-xl">
              Post Review! You will be Notified via Email...
            </p>

            <CardFooter className="flex justify-end gap-3 p-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !profile.businessEmail ||
                  !emailVerified ||
                  !profile.whatsappNumber ||
                  !waVerified ||
                  !profile.businessCategory
                }
              >
                {isSubmitting ? "Registration in Progress..." : "Register"}
              </Button>
            </CardFooter>
          </form>
        </CardContent>
      </Card>

      {/* Skip Verification Dialog */}
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Limited Transaction Access
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription className="space-y-3">
            <p>
              You are proceeding{" "}
              <strong>without {currentCountry?.docType} verification</strong>.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">
                Restrictions:
              </p>
              <ul className="text-sm text-amber-900 space-y-1 list-disc list-inside">
                <li>
                  Maximum transaction limit:{" "}
                  <strong>{currentCountry?.transactionLimit}</strong>
                </li>
                <li>Higher transactions require manual verification</li>
                <li>
                  You may need to contact our support team for payment
                  processing
                </li>
              </ul>
            </div>
            <p className="text-sm">
              <strong>Contact Support for Verification:</strong>
              <br />
              Email: {currentCountry?.contactEmail}
              <br />
              Phone: {currentCountry?.contactPhone}
            </p>
          </AlertDialogDescription>
          <div className="flex justify-end gap-2 pt-4">
            <AlertDialogCancel>Go Back & Verify</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSkipVerification}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Proceed Without Verification
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
