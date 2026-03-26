import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FaGoogle, FaInstagram } from "react-icons/fa";
import {
  Calendar,
  ShoppingBag,
  Sparkles,
  Users,
  TrendingUp,
  Gift,
  Star,
  Zap,
  Heart,
  Crown,
  Loader2,
  MonitorSmartphone,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function EShopLogin() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const apiURL = __API_URL__;
  const [isLoading, setIsLoading] = useState({
    google: false,
    instagram: false,
  });
  const [isChecking, setIsChecking] = useState(false); // ← ADD THIS
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const email = searchParams.get("email");
    const name = searchParams.get("name") || "";

    // If no token/email in URL, show normal login UI
    if (!token || !email) {
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    sessionStorage.setItem("token", token);

    (async () => {
      try {
        const res = await fetch(`${apiURL}/auth/check-role`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            email,
            name,
            role: "shopkeeper",
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to check role");
        }

        const data = await res.json();

        console.log(data, "Data");

        // CASE 1: Shopkeeper found, OTP sent
        if (data.found && data.data?.role === "shopkeeper") {
          toast({
            duration: 5000,
            title: "Shopkeeper Found",
            description: data.message,
          });
          navigate("/login", {
            replace: true,
            state: { email },
          });
          return;
        }

        // CASE 2: Shopkeeper found but OTP failed
        if (data.found && data.data?.role === "shopkeeper") {
          toast({
            duration: 5000,
            title: "New Shopkeeper",
            description: data.message,
          });
          setIsChecking(false);
          return;
        }

        // CASE 3: No shopkeeper yet -> go to registration
        if (!data.found) {
          toast({
            duration: 5000,
            title: "Complete Registration",
            description: data.message,
          });
          navigate("/register", {
            replace: true,
            state: { email, name },
          });
        }
      } catch (error: any) {
        console.error("Check role error:", error);
        toast({
          duration: 5000,
          title: "Error",
          description: "Could not verify shopkeeper availability.",
          variant: "destructive",
        });
        setIsChecking(false);
      }
    })();
  }, [searchParams, apiURL, navigate, toast]);

  const handleGoogleLogin = async () => {
    setIsLoading({ ...isLoading, google: true });
    try {
      // ✅ USE SHOPKEEPER-SPECIFIC GOOGLE FLOW
      const API = `${apiURL}/auth/google-shopkeeper`;

      window.location.href = `${apiURL}/auth/google-shopkeeper`;
    } catch (error) {
      toast({
        duration: 5000,
        title: "Login Error",
        description: "Failed to connect with Google",
        variant: "destructive",
      });
      setIsLoading({ ...isLoading, google: false });
    }
  };

  const handleInstagramLogin = async () => {
    setIsLoading({ ...isLoading, instagram: true });
    try {
      window.location.href = `${apiURL}/auth/instagram`;
    } catch (error) {
      toast({
        duration: 5000,
        title: "Login Error",
        description: "Failed to connect with Instagram",
        variant: "destructive",
      });
      setIsLoading({ ...isLoading, instagram: false });
    }
  };

  // Show loading while checking role
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-teal-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-teal-600" />
          <p className="text-teal-900 font-medium">
            Verifying your shopkeeper profile...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-teal-950 via-teal-900 to-emerald-900">
      {/* Animated Background Elements */}
      <div className="absolute inset-0">
        {/* Floating Icons - Adjusted opacity for better visibility on teal */}
        <div className="absolute top-20 left-10 animate-bounce delay-1000">
          <Calendar className="h-8 w-8 text-white/10" />
        </div>
        <div className="absolute top-32 right-16 animate-pulse delay-2000">
          <ShoppingBag className="h-10 w-10 text-white/10" />
        </div>
        <div className="absolute bottom-40 left-20 animate-bounce delay-500">
          <Gift className="h-6 w-6 text-white/10" />
        </div>
        <div className="absolute top-1/2 right-10 animate-pulse delay-3000">
          <Users className="h-8 w-8 text-white/10" />
        </div>
        <div className="absolute bottom-20 right-32 animate-bounce delay-1500">
          <Star className="h-6 w-6 text-white/10" />
        </div>
        <div className="absolute top-16 left-1/2 animate-pulse delay-4000">
          <Crown className="h-7 w-7 text-white/10" />
        </div>

        {/* CHANGED: Animated Gradient Orbs to Teal/Cyan/White */}
        <div className="absolute top-0 left-0 w-72 h-72 bg-teal-400/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-300/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-20 w-72 h-72 bg-cyan-400/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.2'%3E%3Ccircle cx='30' cy='30' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-4xl align-center gap-12 items-center">
          <div className="flex justify-center items-center">
            <Card className="w-full max-w-md bg-white/95 backdrop-blur-lg border-gray-200 shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-105 animate-fade-in-up">
              <CardHeader className="text-center pb-6">
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <Zap className="h-12 w-12 text-black animate-pulse" />
                    <div className="absolute -top-2 -right-2 h-6 w-6 bg-gradient-to-r from-gray-600 to-gray-800 rounded-full flex items-center justify-center animate-bounce">
                      <Sparkles className="h-3 w-3 text-white" />
                    </div>
                  </div>
                </div>
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-black to-gray-700 bg-clip-text text-transparent">
                  Lets Get Started!
                </CardTitle>
                <CardDescription className="text-lg text-gray-600 mt-2 leading-relaxed">
                  Sign in to access your Kiosk and Cart.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <Button
                    variant="buttonOutline"
                    onClick={handleGoogleLogin}
                    disabled={isLoading.google}
                    className="w-full h-14 text-lg font-semibold border-2 border-gray-300 hover:border-gray-600 hover:bg-gray-50 transition-all duration-300 group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-600 to-black opacity-0 group-hover:opacity-5 transition-opacity duration-300" />
                    {isLoading.google ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600" />
                    ) : (
                      <>
                        <FaGoogle className="mr-3 h-5 w-5 text-gray-700 group-hover:scale-110 transition-transform" />
                        Continue with Google
                      </>
                    )}
                  </Button>

                  {/* <Button
                    variant="buttonOutline"
                    onClick={handleInstagramLogin}
                    disabled={isLoading.instagram}
                    className="w-full h-14 text-lg font-semibold border-2 border-gray-300 hover:border-gray-600 hover:bg-gray-50 transition-all duration-300 group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-black to-gray-700 opacity-0 group-hover:opacity-5 transition-opacity duration-300" />
                    {isLoading.instagram ? (
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600" />
                    ) : (
                      <>
                        <FaInstagram className="mr-3 h-5 w-5 text-gray-700 group-hover:scale-110 transition-transform" />
                        Continue with Instagram
                      </>
                    )}
                  </Button> */}
                </div>

                {/* Trust Indicators */}
                <div className="flex items-center justify-center space-x-6 pt-4 border-t border-gray-200">
                  <div className="flex items-center space-x-2">
                    <div className="h-2 w-2 bg-gray-600 rounded-full animate-pulse" />
                    <span className="text-sm text-gray-500">Secure Login</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Star className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-500">
                      Trusted Platform
                    </span>
                  </div>
                </div>

                {/* Footer Links */}
                {/* <div className="text-center pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    New to KiosCart?{" "}
                    <Link
                      to="/register"
                      className="font-semibold text-black hover:text-gray-700 transition-colors hover:underline"
                    >
                      Create Account
                    </Link>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    By continuing, you agree to our{" "}
                    <Link to="/terms" className="underline hover:text-gray-700">
                      Terms & Services
                    </Link>
                  </p>
                </div> */}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
