import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, KeyRound, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { t as i18nT } from "@/i18n/t";
const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Status {
  mode: "route" | "direct";
  configured: boolean;
  keyId: string | null;
  verifiedAt: string | null;
}

interface Props {
  /** Fired whenever the configured-state may have changed (after save).
   * Parent uses this to lock the Card Payments toggle immediately. */
  onStatusChange?: (configured: boolean) => void;
}

export function RazorpayDirectSetup({ onStatusChange }: Props = {}) {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("token") || localStorage.getItem("token") || ""
      : "";

  async function loadStatus() {
    try {
      const res = await fetch(`${apiURL}/shopkeepers/razorpay/direct/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        onStatusChange?.(!!data?.configured && data?.mode === "direct");
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function handleSave() {
    if (!keyId || !keySecret) {
      toast.error("Please paste both Key ID and Secret.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiURL}/shopkeepers/razorpay/direct/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ keyId, keySecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");
      toast.success("Keys verified and saved. You can now accept payments.");
      setKeyId("");
      setKeySecret("");
      loadStatus();
    } catch (err: any) {
      toast.error(err.message || "Could not save keys");
    } finally {
      setSubmitting(false);
    }
  }

  const isLive = keyId.startsWith("rzp_live_");
  const isTest = keyId.startsWith("rzp_test_");

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {status?.configured && status.mode === "direct" && (
        <div className="rounded-lg border-2 border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-900">
              {i18nT("Razorpay Direct is active")}
            </p>
            <p className="text-sm text-green-700 mt-1">
              Key:{" "}
              <span className="font-mono text-xs bg-card px-1.5 py-0.5 rounded border">
                {status.keyId}
              </span>
            </p>
            {status.verifiedAt && (
              <p className="text-xs text-green-600 mt-1">
                Verified {new Date(status.verifiedAt).toLocaleString()}
              </p>
            )}
            <p className="text-xs text-green-700 mt-2">
              Customer payments now go directly to your Razorpay account. Money
              lands in your bank on T+2.
            </p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2 text-sm">
        <p className="font-semibold text-foreground">
          {i18nT("How to get your Razorpay keys")}
        </p>
        <ol className="list-decimal list-inside space-y-1 text-foreground">
          <li>
            Go to{" "}
            <a
              href="https://dashboard.razorpay.com/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline inline-flex items-center gap-0.5"
            >
              dashboard.razorpay.com <ExternalLink className="w-3 h-3" />
            </a>{" "}
            and sign up (free).
          </li>
          <li>
            Complete activation: PAN, GST (if applicable), bank details. Razorpay
            reviews within 24-72 hours.
          </li>
          <li>
            Once activated, switch to <strong>{i18nT("Live Mode")}</strong>, then go to{" "}
            <em>Account &amp; Settings → API Keys → Generate Live Key</em>.
          </li>
          <li>{i18nT("Copy the Key ID and Secret, then paste them below.")}</li>
        </ol>
        <p className="text-xs text-muted-foreground pt-1">
          Both test keys (<code>rzp_test_*</code>) and live keys (
          <code>rzp_live_*</code>) work here. Live keys move real money — only
          paste them after your KiosCart shop is live.
        </p>
      </div>

      {/* Form */}
      <div className="space-y-3">
        <div>
          <Label htmlFor="rzp-key-id" className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5" />
            Razorpay Key ID
            {keyId && (
              <Badge
                variant="outline"
                className={
                  isLive
                    ? "bg-red-50 text-red-700 border-red-200 text-[10px]"
                    : isTest
                      ? "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                      : "bg-muted/50 text-muted-foreground text-[10px]"
                }
              >
                {isLive ? "LIVE" : isTest ? "TEST" : "?"}
              </Badge>
            )}
          </Label>
          <Input
            id="rzp-key-id"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value.trim())}
            placeholder="rzp_live_XXXXXXXXXXXX"
            disabled={submitting}
            className="font-mono text-sm"
          />
        </div>
        <div>
          <Label htmlFor="rzp-key-secret">{i18nT("Razorpay Key Secret")}</Label>
          <Input
            id="rzp-key-secret"
            type="password"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value.trim())}
            placeholder={i18nT("Paste the secret shown when you generated the key")}
            disabled={submitting}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {i18nT("Stored encrypted at rest. Never displayed back to you after save.")}
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={submitting || !keyId || !keySecret}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {i18nT("Verifying with Razorpay…")}
            </>
          ) : status?.configured ? (
            "Update keys"
          ) : (
            "Save & Verify"
          )}
        </Button>
      </div>
    </div>
  );
}

export default RazorpayDirectSetup;
