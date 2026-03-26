import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ArrowLeft, Shield, Mail, Store, Loader2 } from "lucide-react";
import { useCountryCodes } from "@/hooks/useCountryCodes";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type LoginStep = "number" | "otp" | "selection";

export function ShopkeeperLogin() {
  const [whatsappNumber, setWhatsAppNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+65");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  const [step, setStep] = useState<LoginStep>("number");
  const [shops, setShops] = useState<
    { id: string; shopName: string; approved: boolean }[]
  >([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");

  const [isLoading, setIsLoading] = useState(false);
  const { countryCodes, loading: loadingCountryCodes } = useCountryCodes();

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { login } = useAuth(); // We use this to update global auth state
  const { toast } = useToast();
  const navigate = useNavigate();
  const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000"; // Ensure this env var exists

  // --- OTP Input Handlers (Keep as is) ---
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const fullNumber = countryCode + whatsappNumber;

  // --- Step 1: Send OTP ---
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappNumber || whatsappNumber.length < 6) return;

    setIsLoading(true);
    try {
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

      toast({ title: "OTP Sent", description: `Code sent to ${fullNumber}` });
      setStep("otp");
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 2: Verify OTP (Initial Check) ---
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);

    try {
      const otpString = otp.join("");

      // NOTE: We do NOT send shopId here yet
      const response = await fetch(`${apiURL}/otp/verify-chat-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappNumber: fullNumber,
          otp: otpString,
          role: "shopkeeper",
        }),
      });

      const result = await response.json();

      if (!response.ok)
        throw new Error(result.message || "Verification failed");

      // CASE A: Multiple Shops Found -> Go to Selection Step
      if (result.requiresSelection && result.shops) {
        setShops(result.shops);
        setStep("selection");
        toast({
          title: "Multiple Accounts",
          description: "Please select a store to proceed.",
        });
        return;
      }

      // CASE B: Single Shop / Success -> Login Immediately
      if (result.data) {
        await performLogin(result.data);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Invalid OTP",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 3: Confirm Shop Selection ---
  const handleShopSelection = async () => {
    if (!selectedShopId) return;
    setIsLoading(true);

    try {
      const otpString = otp.join(""); // We must resend the OTP for validation

      const response = await fetch(`${apiURL}/otp/verify-chat-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappNumber: fullNumber,
          otp: otpString,
          role: "shopkeeper",
          shopId: selectedShopId, // We send the selected ID now
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Selection failed");

      if (result.data) {
        await performLogin(result.data);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: error.message,
      });
      // If OTP expired during selection, might need to go back
      if (error.message.includes("expired")) {
        setStep("number");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to handle token storage and navigation
  const performLogin = async (token: string) => {
    try {
      // 1. Save to LocalStorage (Persists across tabs/refreshes)
      localStorage.setItem("token", token);

      // 2. Update Auth Context (if your hook supports it)
      if (login) {
        await login(token);
      }

      toast({
        title: "Login Successful",
        description: "Redirecting to dashboard...",
      });

      // 3. Navigate (Use replace to prevent back-button loops)
      navigate("/estore-dashboard", { replace: true });
    } catch (e) {
      console.error("Login context error", e);
      // Fallback if login hook fails
      window.location.href = "/estore-dashboard";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="w-full max-w-md shadow-xl border-slate-100">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mb-2">
            {step === "number" && <Shield className="h-8 w-8 text-slate-600" />}
            {step === "otp" && <Mail className="h-8 w-8 text-slate-600" />}
            {step === "selection" && (
              <Store className="h-8 w-8 text-slate-600" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900">
            {step === "number"
              ? "E-Store Login"
              : step === "otp"
                ? "Verify Code"
                : "Select Store"}
          </CardTitle>
          <CardDescription>
            {step === "number" &&
              "Enter your WhatsApp number to receive a code"}
            {step === "otp" && `Enter the 6-digit code sent to ${fullNumber}`}
            {step === "selection" &&
              "Multiple stores found linked to this number"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {step === "number" && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="flex gap-2">
                <select
                  className="w-36 border rounded p-2"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  disabled={isLoading || loadingCountryCodes}
                  required
                >
                  <option value="">Select Country</option>
                  {countryCodes.map((cc) => (
                    <option key={cc.dial_code + cc.name} value={cc.dial_code}>
                      {cc.name} ({cc.dial_code})
                    </option>
                  ))}
                </select>
                <Input
                  type="tel"
                  placeholder="WhatsApp number"
                  value={whatsappNumber}
                  onChange={(e) =>
                    setWhatsAppNumber(e.target.value.replace(/\D/g, ""))
                  }
                  className="flex-1"
                  maxLength={15}
                  disabled={isLoading}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || whatsappNumber.length < 6}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Verification Code
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="flex justify-between gap-1">
                {otp.map((digit, index) => (
                  <Input
                    key={index}
                    value={digit}
                    ref={(el) => (inputRefs.current[index] = el)}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-12 text-center text-xl font-bold"
                    maxLength={1}
                  />
                ))}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || otp.join("").length !== 6}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify & Login
              </Button>
              <Button
                variant="link"
                type="button"
                className="w-full"
                onClick={() => setStep("number")}
              >
                Change Number
              </Button>
            </form>
          )}

          {step === "selection" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Store to Manage</Label>
                <Select
                  onValueChange={setSelectedShopId}
                  value={selectedShopId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a shop..." />
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map((shop) => (
                      <SelectItem
                        key={shop.id}
                        value={shop.id}
                        disabled={!shop.approved} // This prevents selection and greys it out
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          <span
                            className={
                              !shop.approved ? "text-muted-foreground" : ""
                            }
                          >
                            {shop.shopName}
                          </span>
                          {!shop.approved && (
                            <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                              Pending Approval
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleShopSelection}
                className="w-full"
                disabled={isLoading || !selectedShopId}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enter Dashboard
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setStep("otp")}
              >
                Back
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
