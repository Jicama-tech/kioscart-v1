import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CartAuthReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const userToken = searchParams.get("userToken");
    const error = searchParams.get("error");
    const returnTo = sessionStorage.getItem("cartReturnUrl") || "/";
    sessionStorage.removeItem("cartReturnUrl");

    if (error || !userToken) {
      toast({
        title: "Sign in failed",
        description: "Please try again.",
        variant: "destructive",
      });
      navigate(returnTo, { replace: true });
      return;
    }

    // Store token and return to cart
    sessionStorage.setItem("userToken", userToken);
    sessionStorage.removeItem("token"); // clear shopkeeper token if lingering
    navigate(returnTo, { replace: true });
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-slate-600" />
        <p className="text-slate-600 font-medium">Completing sign in...</p>
      </div>
    </div>
  );
}
