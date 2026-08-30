import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import { t as i18nT } from "@/i18n/t";
const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Country = "IN" | "SG";

type LinkedAccountStatus =
  | "pending_kyc"
  | "under_review"
  | "active"
  | "rejected"
  | "suspended";

type DocSlot = "panFront" | "addressProof" | "cancelledCheque" | "gstCert";

interface ShopProfile {
  id: string;
  country?: string;
  razorpay?: {
    accountId?: string;
    status?: LinkedAccountStatus;
    stakeholderId?: string;
    documents?: Partial<Record<DocSlot, string>>;
    kycRejectionReason?: string;
  };
}

interface Props {
  shopProfile: ShopProfile;
  onUpdated?: (next: ShopProfile["razorpay"]) => void;
}

const DOC_LABELS: Record<DocSlot, string> = {
  panFront: "PAN card (front)",
  addressProof: "Address proof (Aadhaar / utility bill)",
  cancelledCheque: "Cancelled cheque or bank passbook",
  gstCert: "GST certificate (optional)",
};

export function RazorpayOnboarding({ shopProfile, onUpdated }: Props) {
  const supportedCountry = (shopProfile.country || "IN").toUpperCase() as Country;
  const isSupported = supportedCountry === "IN";

  const [account, setAccount] = useState<ShopProfile["razorpay"]>(
    shopProfile.razorpay,
  );
  const [submitting, setSubmitting] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<DocSlot | null>(null);

  const [form, setForm] = useState({
    businessName: "",
    businessType: "proprietorship" as const,
    businessEmail: "",
    businessPhone: "",
    panNumber: "",
    gstNumber: "",
    uenNumber: "",
    accountHolderName: "",
    bankName: "",
    bankAccountNumber: "",
    ifscCode: "",
    address: "",
    city: "",
    state: "",
    zipcode: "",
    country: supportedCountry,
    consent: false,
  });

  const [stakeholder, setStakeholder] = useState({
    name: "",
    email: "",
    phone: "",
    pan: "",
    addressLine1: "",
    city: "",
    state: "",
    postalCode: "",
    country: supportedCountry,
  });

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";

  function authHeaders(extra?: Record<string, string>) {
    return {
      Authorization: `Bearer ${token}`,
      ...(extra || {}),
    };
  }

  async function pollAccountStatus() {
    if (!account?.accountId) return;
    try {
      const res = await fetch(
        `${apiURL}/shopkeepers/razorpay/status/${account.accountId}`,
        { headers: authHeaders() },
      );
      if (res.ok) {
        const data = await res.json();
        setAccount((prev) => ({ ...(prev || {}), status: data.status }));
        onUpdated?.({ ...(account || {}), status: data.status });
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (
      account?.accountId &&
      (account.status === "under_review" || account.status === "pending_kyc")
    ) {
      const t = setInterval(pollAccountStatus, 30000);
      return () => clearInterval(t);
    }
  }, [account?.accountId, account?.status]);

  async function handleCreateAccount() {
    if (!form.consent) {
      toast.error("Please confirm consent before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${apiURL}/shopkeepers/razorpay/setup`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Setup failed");
      setAccount({
        accountId: data.accountId,
        status: data.status,
        documents: {},
      });
      onUpdated?.({ accountId: data.accountId, status: data.status });
      toast.success("Linked account created. Add stakeholder + KYC documents next.");
    } catch (err: any) {
      toast.error(err.message || "Failed to create linked account");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateStakeholder() {
    setSubmitting(true);
    try {
      const res = await fetch(`${apiURL}/shopkeepers/razorpay/stakeholder`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(stakeholder),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Stakeholder failed");
      setAccount((prev) => ({
        ...(prev || {}),
        stakeholderId: data.stakeholderId,
      }));
      toast.success("Stakeholder added.");
    } catch (err: any) {
      toast.error(err.message || "Failed to add stakeholder");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(slot: DocSlot, file: File) {
    setUploadingSlot(slot);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(
        `${apiURL}/shopkeepers/razorpay/documents/${slot}`,
        { method: "POST", headers: authHeaders(), body: fd },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload failed");
      setAccount((prev) => ({
        ...(prev || {}),
        documents: { ...(prev?.documents || {}), [slot]: data.documentId },
      }));
      toast.success(`${DOC_LABELS[slot]} uploaded.`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleSubmitForReview() {
    setSubmitting(true);
    try {
      const res = await fetch(
        `${apiURL}/shopkeepers/razorpay/submit-for-review`,
        { method: "POST", headers: authHeaders() },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submit failed");
      setAccount((prev) => ({ ...(prev || {}), status: "under_review" }));
      toast.success("Submitted to Razorpay. KYC review takes 1-3 business days.");
    } catch (err: any) {
      toast.error(err.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Render ----

  if (!isSupported) {
    return (
      <div className="p-4 border rounded-lg bg-amber-50 border-amber-200">
        <h3 className="font-semibold flex items-center gap-2 text-amber-900">
          <AlertCircle className="w-4 h-4" />
          Auto-settlement coming soon for {supportedCountry}
        </h3>
        <p className="text-sm text-amber-800 mt-1">
          Use your existing manual payment QR for now. We'll enable
          auto-settlement here once the {supportedCountry} adapter is live.
        </p>
      </div>
    );
  }

  const status = account?.status;
  const docs = account?.documents || {};
  const hasAccount = !!account?.accountId;
  const docsReady = !!docs.panFront && !!docs.cancelledCheque;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{i18nT("Razorpay Route Onboarding")}</h3>
          <p className="text-sm text-muted-foreground">
            Customers pay through KiosCart. Funds are held in our partner account
            until the admin releases them to your bank.
          </p>
        </div>
        {status && <StatusBadge status={status} />}
      </div>

      {status === "rejected" && account?.kycRejectionReason && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
          KYC was rejected: {account.kycRejectionReason}
        </div>
      )}

      {!hasAccount && (
        <section className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium">{i18nT("Step 1 — Business details")}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Legal business name" value={form.businessName}
              onChange={(v) => setForm({ ...form, businessName: v })} />
            <div>
              <Label className="text-xs">{i18nT("Business type")}</Label>
              <Select
                value={form.businessType}
                onValueChange={(v) => setForm({ ...form, businessType: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="proprietorship">{i18nT("Proprietorship")}</SelectItem>
                  <SelectItem value="partnership">{i18nT("Partnership")}</SelectItem>
                  <SelectItem value="private_limited">{i18nT("Private Limited")}</SelectItem>
                  <SelectItem value="llp">{i18nT("LLP")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Business email" type="email" value={form.businessEmail}
              onChange={(v) => setForm({ ...form, businessEmail: v })} />
            <Field label="Business phone" value={form.businessPhone}
              onChange={(v) => setForm({ ...form, businessPhone: v })} />
            <Field label="PAN number" value={form.panNumber}
              onChange={(v) => setForm({ ...form, panNumber: v.toUpperCase() })} />
            <Field label="GST number (optional)" value={form.gstNumber}
              onChange={(v) => setForm({ ...form, gstNumber: v.toUpperCase() })} />
            <Field label="Account holder name" value={form.accountHolderName}
              onChange={(v) => setForm({ ...form, accountHolderName: v })} />
            <Field label="Bank name" value={form.bankName}
              onChange={(v) => setForm({ ...form, bankName: v })} />
            <Field label="Bank account number" value={form.bankAccountNumber}
              onChange={(v) => setForm({ ...form, bankAccountNumber: v })} />
            <Field label="IFSC code" value={form.ifscCode}
              onChange={(v) => setForm({ ...form, ifscCode: v.toUpperCase() })} />
            <Field label="Address" value={form.address}
              onChange={(v) => setForm({ ...form, address: v })} />
            <Field label="City" value={form.city}
              onChange={(v) => setForm({ ...form, city: v })} />
            <Field label="State" value={form.state}
              onChange={(v) => setForm({ ...form, state: v })} />
            <Field label="Zipcode" value={form.zipcode}
              onChange={(v) => setForm({ ...form, zipcode: v })} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              I confirm the above details are accurate and authorize KiosCart
              to create a Razorpay Route linked account on my behalf.
            </span>
          </label>
          <Button onClick={handleCreateAccount} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create linked account
          </Button>
        </section>
      )}

      {hasAccount && !account?.stakeholderId && (
        <section className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium">{i18nT("Step 2 — Add stakeholder")}</h4>
          <p className="text-sm text-muted-foreground">
            The person legally responsible for the business (usually the
            proprietor or a director).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Full name" value={stakeholder.name}
              onChange={(v) => setStakeholder({ ...stakeholder, name: v })} />
            <Field label="Email" type="email" value={stakeholder.email}
              onChange={(v) => setStakeholder({ ...stakeholder, email: v })} />
            <Field label="Phone" value={stakeholder.phone}
              onChange={(v) => setStakeholder({ ...stakeholder, phone: v })} />
            <Field label="PAN (personal)" value={stakeholder.pan}
              onChange={(v) => setStakeholder({ ...stakeholder, pan: v.toUpperCase() })} />
            <Field label="Address" value={stakeholder.addressLine1}
              onChange={(v) => setStakeholder({ ...stakeholder, addressLine1: v })} />
            <Field label="City" value={stakeholder.city}
              onChange={(v) => setStakeholder({ ...stakeholder, city: v })} />
            <Field label="State" value={stakeholder.state}
              onChange={(v) => setStakeholder({ ...stakeholder, state: v })} />
            <Field label="Postal code" value={stakeholder.postalCode}
              onChange={(v) => setStakeholder({ ...stakeholder, postalCode: v })} />
          </div>
          <Button onClick={handleCreateStakeholder} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add stakeholder
          </Button>
        </section>
      )}

      {hasAccount && account?.stakeholderId && status !== "active" && (
        <section className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium">{i18nT("Step 3 — Upload KYC documents")}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(Object.keys(DOC_LABELS) as DocSlot[]).map((slot) => (
              <DocUpload
                key={slot}
                label={DOC_LABELS[slot]}
                slot={slot}
                uploaded={!!docs[slot]}
                uploading={uploadingSlot === slot}
                onSelect={(file) => handleUpload(slot, file)}
              />
            ))}
          </div>

          <Button
            onClick={handleSubmitForReview}
            disabled={submitting || !docsReady || status === "under_review"}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {status === "under_review"
              ? "Submitted — awaiting Razorpay review"
              : "Submit for KYC review"}
          </Button>
          {!docsReady && (
            <p className="text-xs text-muted-foreground">
              {i18nT("PAN and cancelled cheque are required to submit.")}
            </p>
          )}
        </section>
      )}

      {status === "active" && (
        <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <div>
            <div className="font-medium">{i18nT("KYC active — accepting payments")}</div>
            <div className="text-sm">
              Customers can pay through KiosCart. Funds settle to your bank
              after KiosCart admin releases each payment.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: LinkedAccountStatus }) {
  const tone: Record<LinkedAccountStatus, string> = {
    pending_kyc: "bg-muted text-foreground",
    under_review: "bg-amber-100 text-amber-800",
    active: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    suspended: "bg-red-100 text-red-800",
  };
  const labels: Record<LinkedAccountStatus, string> = {
    pending_kyc: "Pending KYC",
    under_review: "Under review",
    active: "Active",
    rejected: "Rejected",
    suspended: "Suspended",
  };
  return <Badge className={tone[status]}>{labels[status]}</Badge>;
}

function DocUpload({
  label,
  slot,
  uploaded,
  uploading,
  onSelect,
}: {
  label: string;
  slot: DocSlot;
  uploaded: boolean;
  uploading: boolean;
  onSelect: (file: File) => void;
}) {
  return (
    <label
      className={`border rounded-md p-3 flex items-center justify-between cursor-pointer hover:bg-muted transition ${
        uploaded ? "border-emerald-300 bg-emerald-50" : "border-dashed"
      }`}
    >
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">
          {uploaded
            ? "Uploaded"
            : uploading
              ? "Uploading..."
              : "Click to upload (PNG/JPG/PDF, max 5MB)"}
        </div>
      </div>
      {uploaded ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
      ) : uploading ? (
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      ) : (
        <Upload className="w-5 h-5 text-muted-foreground" />
      )}
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

export default RazorpayOnboarding;
