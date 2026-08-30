import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Info, Loader2, Sparkles } from "lucide-react";

import { t as i18nT } from "@/i18n/t";
const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface RazorpayPlatformSetupProps {
  onStatusChange?: (enabled: boolean) => void;
}

interface PlatformStatus {
  mode: string | null;
  enabled: boolean;
  hasLegacyDirectKeys: boolean;
}

export function RazorpayPlatformSetup({
  onStatusChange,
}: RazorpayPlatformSetupProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [status, setStatus] = useState<PlatformStatus | null>(null);

  function authHeaders() {
    const token = sessionStorage.getItem("token") || localStorage.getItem("token") || "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${apiURL}/shopkeepers/razorpay/platform-status`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PlatformStatus = await res.json();
      setStatus(data);
      onStatusChange?.(data.enabled);
    } catch (err: any) {
      toast({
        title: i18nT("Couldn't load Razorpay status"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function enablePlatform() {
    setEnabling(true);
    try {
      const res = await fetch(
        `${apiURL}/shopkeepers/razorpay/enable-platform`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to enable Razorpay");
      }
      toast({
        title: i18nT("Razorpay payments enabled"),
        description: i18nT("Customers can now pay via KiosCart's secure checkout. Your earnings will be released by KiosCart admin."),
      });
      await load();
    } catch (err: any) {
      toast({
        title: i18nT("Couldn't enable Razorpay"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setEnabling(false);
    }
  }

  if (loading) {
    return (
      <div className="py-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground mt-2">
          {i18nT("Checking Razorpay status…")}
        </p>
      </div>
    );
  }

  const isEnabled = status?.enabled === true;

  return (
    <div className="space-y-4">
      {isEnabled ? (
        // ----- ENABLED state -----
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-emerald-900">
                  {i18nT("Razorpay Payments Active")}
                </h4>
                <Badge className="bg-emerald-600 hover:bg-emerald-700">
                  {i18nT("Live")}
                </Badge>
              </div>
              <p className="text-sm text-emerald-800 mt-1">
                Customers can pay with card / UPI / netbanking at checkout.
                Payments are collected by KiosCart on your behalf.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-emerald-700">
                <li className="flex items-start gap-1.5">
                  <span className="font-bold">•</span>
                  <span>
                    {i18nT("KiosCart's commission is deducted automatically per order.")}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="font-bold">•</span>
                  <span>
                    Your remaining balance is released to your registered bank
                    account by KiosCart admin (typically weekly).
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="font-bold">•</span>
                  <span>
                    No setup needed on your side — no Razorpay account, no
                    KYC paperwork.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        // ----- DISABLED state -----
        <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-indigo-900">
                {i18nT("Enable Razorpay Payments")}
              </h4>
              <p className="text-sm text-indigo-800 mt-1">
                One click. No setup. No paperwork. KiosCart collects payments
                on your behalf and releases your share to your bank.
              </p>
              <Button
                onClick={enablePlatform}
                disabled={enabling}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {enabling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {i18nT("Enabling…")}
                  </>
                ) : (
                  <>{i18nT("Enable Razorpay Payments")}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Legacy Direct-mode note — for shops that had pasted their own keys
          before the platform mode existed. They keep working, but a heads-up
          is useful. */}
      {status?.hasLegacyDirectKeys && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <span className="font-semibold">{i18nT("Legacy direct keys detected.")}</span>{" "}
            Your shop has its own Razorpay keys from an earlier setup. They
            still work, but the platform model handles payouts more reliably.
            Switching is safe — your existing keys are kept for reference.
          </div>
        </div>
      )}
    </div>
  );
}
