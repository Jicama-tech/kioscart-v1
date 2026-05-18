import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  RefreshCw,
  Wallet,
  IndianRupee,
  Users,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "./AdminLayout";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface PayoutSummaryRow {
  shopkeeperId: string;
  shopName?: string;
  name?: string;
  whatsappNumber?: string;
  totalOwed: number;
  count: number;
  oldest: string;
  newest: string;
  currency: string;
}

interface PendingPayment {
  _id: string;
  amount: number;
  netAmount: number;
  commissionAmount: number;
  currency: string;
  capturedAt: string;
  orderId?: { orderId: string; totalAmount: number; customerName?: string };
  shopkeeperId?: { name?: string; shopName?: string };
}

function authHeaders() {
  const token = sessionStorage.getItem("token") || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatCurrency(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface PendingPayoutsPageProps {
  onLogout: () => void;
}

export default function PendingPayoutsPage({ onLogout }: PendingPayoutsPageProps) {
  const [summary, setSummary] = useState<PayoutSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<PendingPayment[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [payoutDialog, setPayoutDialog] = useState<PayoutSummaryRow | null>(null);
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await fetch(
        `${apiURL}/admin/payments/pending-payouts/summary`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(shopkeeperId: string) {
    setDetailsLoading(true);
    setExpanded(shopkeeperId);
    try {
      const res = await fetch(
        `${apiURL}/admin/payments/pending-payouts?shopkeeperId=${shopkeeperId}&limit=200`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDetails(data.items || []);
    } catch (err: any) {
      toast.error(`Failed to load details: ${err.message}`);
    } finally {
      setDetailsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const totals = useMemo(() => {
    return summary.reduce(
      (acc, r) => ({
        totalOwed: acc.totalOwed + (r.totalOwed || 0),
        totalCount: acc.totalCount + (r.count || 0),
      }),
      { totalOwed: 0, totalCount: 0 },
    );
  }, [summary]);

  const oldestDate = useMemo(() => {
    if (!summary.length) return null;
    return summary.reduce(
      (oldest, r) => (oldest && oldest < r.oldest ? oldest : r.oldest),
      summary[0].oldest,
    );
  }, [summary]);

  async function confirmBulkPayout() {
    if (!payoutDialog) return;
    setSubmitting(true);
    try {
      // Fetch the latest detail rows for this shopkeeper so we have the
      // exact paymentIds — guards against the page being stale.
      const detailRes = await fetch(
        `${apiURL}/admin/payments/pending-payouts?shopkeeperId=${payoutDialog.shopkeeperId}&limit=500`,
        { headers: authHeaders() },
      );
      const detailData = await detailRes.json();
      const paymentIds = (detailData.items || []).map((p: PendingPayment) => p._id);
      if (!paymentIds.length) throw new Error("No pending payments");

      const res = await fetch(`${apiURL}/admin/payments/bulk-mark-paid-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          paymentIds,
          reference: payoutRef.trim() || undefined,
          note: payoutNote.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Bulk payout failed");
      }
      const result = await res.json();
      toast.success(
        `Marked ${result.ok}/${result.total} payments paid out for ${payoutDialog.shopName || "shop"}`,
      );
      setPayoutDialog(null);
      setPayoutRef("");
      setPayoutNote("");
      setExpanded(null);
      await loadSummary();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminLayout onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Pending Payouts</h2>
            <p className="text-sm text-muted-foreground">
              Platform-mode payments collected by KiosCart that haven't been
              disbursed to shopkeepers yet. Mark them paid out after each bank
              transfer.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadSummary}
            disabled={loading}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm text-muted-foreground">
                Total Owed
              </CardTitle>
              <IndianRupee className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(totals.totalOwed)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm text-muted-foreground">
                Shopkeepers
              </CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.length}</div>
              <p className="text-xs text-muted-foreground">
                {totals.totalCount} payments awaiting disbursement
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm text-muted-foreground">
                Oldest Payment
              </CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatDate(oldestDate)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Per-shopkeeper table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading…</p>
              </div>
            ) : summary.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500" />
                <p className="text-sm font-medium">All caught up</p>
                <p className="text-sm text-muted-foreground">
                  No shopkeepers have pending payouts right now.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shopkeeper</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right"># Orders</TableHead>
                    <TableHead className="text-right">Amount Owed</TableHead>
                    <TableHead>Oldest</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((row) => (
                    <>
                      <TableRow key={row.shopkeeperId}>
                        <TableCell className="font-medium">
                          <div>{row.shopName || row.name || "—"}</div>
                          {row.name && row.shopName && (
                            <div className="text-xs text-muted-foreground">
                              {row.name}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.whatsappNumber || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{row.count}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(row.totalOwed, row.currency)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(row.oldest)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                expanded === row.shopkeeperId
                                  ? setExpanded(null)
                                  : loadDetails(row.shopkeeperId)
                              }
                            >
                              {expanded === row.shopkeeperId
                                ? "Hide"
                                : "Details"}
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => setPayoutDialog(row)}
                            >
                              <Wallet className="w-3.5 h-3.5 mr-1" />
                              Mark Paid Out
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {expanded === row.shopkeeperId && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-slate-50 p-4">
                            {detailsLoading ? (
                              <div className="py-4 text-center text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                                Loading order details…
                              </div>
                            ) : details.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No details available.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                                  Individual payments ({details.length})
                                </p>
                                {details.map((p) => (
                                  <div
                                    key={p._id}
                                    className="flex items-center justify-between text-sm bg-white rounded px-3 py-2 border"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="font-mono text-xs truncate">
                                        {p.orderId?.orderId || p._id}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {formatDate(p.capturedAt)} ·{" "}
                                        {p.orderId?.customerName || "Guest"}
                                      </div>
                                    </div>
                                    <div className="text-right ml-4">
                                      <div className="font-semibold">
                                        {formatCurrency(
                                          p.netAmount,
                                          p.currency,
                                        )}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground">
                                        gross{" "}
                                        {formatCurrency(p.amount, p.currency)} −
                                        commission{" "}
                                        {formatCurrency(
                                          p.commissionAmount,
                                          p.currency,
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mark Paid Out dialog */}
      <Dialog
        open={!!payoutDialog}
        onOpenChange={(o) => !o && setPayoutDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Payout to {payoutDialog?.shopName || payoutDialog?.name}</DialogTitle>
            <DialogDescription>
              Record that you've manually transferred{" "}
              <strong>
                {payoutDialog
                  ? formatCurrency(payoutDialog.totalOwed, payoutDialog.currency)
                  : ""}
              </strong>{" "}
              across {payoutDialog?.count || 0} payments. All listed payments
              will be marked released.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="payout-ref">Transfer Reference</Label>
              <Input
                id="payout-ref"
                placeholder="e.g. NEFT UTR or UPI ref"
                value={payoutRef}
                onChange={(e) => setPayoutRef(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional but recommended — helps you reconcile against your
                bank statement.
              </p>
            </div>
            <div>
              <Label htmlFor="payout-note">Note</Label>
              <Input
                id="payout-note"
                placeholder="Internal note (optional)"
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayoutDialog(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBulkPayout}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Payout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
