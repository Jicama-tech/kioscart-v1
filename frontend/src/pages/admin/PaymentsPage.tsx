import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, IndianRupee } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "./AdminLayout";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Tab = "pending" | "released" | "refunded";

interface PaymentRow {
  _id: string;
  amount: number;
  commissionAmount: number;
  netAmount: number;
  currency: string;
  country: string;
  status: string;
  transferStatus: string;
  heldAt?: string;
  releasedAt?: string;
  refundedAt?: string;
  createdAt: string;
  shopkeeperId: { _id: string; name?: string; shopName?: string; country?: string } | null;
  orderId: { _id: string; orderId?: string; totalAmount?: number; customerName?: string } | null;
}

interface Totals {
  _id: string; // currency
  grossAmount: number;
  commission: number;
  netAmount: number;
  count: number;
}

function fmtCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

interface PaymentsPageProps {
  onLogout: () => void;
}

export default function PaymentsPage({ onLogout }: PaymentsPageProps) {
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [totals, setTotals] = useState<Totals[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [refundFor, setRefundFor] = useState<PaymentRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  async function load() {
    setLoading(true);
    setSelected(new Set());
    try {
      const path =
        tab === "pending"
          ? "pending-releases"
          : tab === "released"
            ? "released"
            : "refunded";
      const res = await fetch(`${apiURL}/admin/payments/${path}?limit=100`, {
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load");
      setItems(data.items || []);
      setTotals(data.totalsByCurrency || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab]);

  async function releaseOne(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`${apiURL}/admin/payments/${id}/release`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Release failed");
      toast.success("Payment released to shopkeeper");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Release failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkRelease() {
    if (!selected.size) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiURL}/admin/payments/bulk-release`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Bulk release failed");
      toast.success(
        `Released ${data.succeeded}/${data.total}${
          data.failed ? ` — ${data.failed} failed` : ""
        }`,
      );
      await load();
    } catch (err: any) {
      toast.error(err.message || "Bulk release failed");
    } finally {
      setBusy(false);
    }
  }

  async function refundOne() {
    if (!refundFor) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${apiURL}/admin/payments/${refundFor._id}/refund`,
        {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ reason: refundReason || "admin_refund" }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Refund failed");
      toast.success("Refund initiated");
      setRefundFor(null);
      setRefundReason("");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i._id)));
  }
  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  return (
    <AdminLayout onLogout={onLogout}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Payments</h1>
            <p className="text-sm text-muted-foreground">
              Review payments held in KiosCart's account and release them to
              shopkeepers' linked Razorpay accounts.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        {tab === "pending" && totals.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {totals.map((t) => (
              <Card key={t._id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs uppercase text-muted-foreground">
                    On hold ({t._id})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-4 w-4 text-slate-500" />
                    <span className="text-2xl font-semibold">
                      {fmtCurrency(t.netAmount, t._id)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {t.count} payment{t.count === 1 ? "" : "s"} · gross{" "}
                    {fmtCurrency(t.grossAmount, t._id)} · commission{" "}
                    {fmtCurrency(t.commission, t._id)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="pending">Pending releases</TabsTrigger>
            <TabsTrigger value="released">Released</TabsTrigger>
            <TabsTrigger value="refunded">Refunded</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-3">
            {tab === "pending" && (
              <div className="flex items-center gap-2 mb-3">
                <Button
                  size="sm"
                  disabled={!selected.size || busy}
                  onClick={bulkRelease}
                >
                  {busy && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Release selected ({selected.size})
                </Button>
              </div>
            )}

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      {tab === "pending" && (
                        <th className="p-2 w-8">
                          <input
                            type="checkbox"
                            checked={
                              items.length > 0 &&
                              selected.size === items.length
                            }
                            onChange={toggleAll}
                          />
                        </th>
                      )}
                      <th className="p-2">Order</th>
                      <th className="p-2">Shopkeeper</th>
                      <th className="p-2 text-right">Gross</th>
                      <th className="p-2 text-right">Commission</th>
                      <th className="p-2 text-right">Net</th>
                      <th className="p-2">Country</th>
                      <th className="p-2">
                        {tab === "pending"
                          ? "Held since"
                          : tab === "released"
                            ? "Released"
                            : "Refunded"}
                      </th>
                      <th className="p-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={9} className="p-6 text-center">
                          <Loader2 className="inline h-4 w-4 animate-spin" />
                        </td>
                      </tr>
                    )}
                    {!loading && items.length === 0 && (
                      <tr>
                        <td
                          colSpan={9}
                          className="p-8 text-center text-muted-foreground"
                        >
                          No payments in this tab.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      items.map((p) => (
                        <tr key={p._id} className="border-t hover:bg-slate-50">
                          {tab === "pending" && (
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={selected.has(p._id)}
                                onChange={() => toggleOne(p._id)}
                              />
                            </td>
                          )}
                          <td className="p-2">
                            <div className="font-medium">
                              {p.orderId?.orderId || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {p.orderId?.customerName || "—"}
                            </div>
                          </td>
                          <td className="p-2">
                            <div>{p.shopkeeperId?.shopName || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.shopkeeperId?.name || ""}
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            {fmtCurrency(p.amount, p.currency)}
                          </td>
                          <td className="p-2 text-right text-amber-700">
                            {fmtCurrency(p.commissionAmount, p.currency)}
                          </td>
                          <td className="p-2 text-right font-semibold">
                            {fmtCurrency(p.netAmount, p.currency)}
                          </td>
                          <td className="p-2">
                            <Badge variant="outline">{p.country}</Badge>
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {p.heldAt || p.releasedAt || p.refundedAt || "—"
                              ? new Date(
                                  p.heldAt ||
                                    p.releasedAt ||
                                    p.refundedAt ||
                                    p.createdAt,
                                ).toLocaleString()
                              : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {tab === "pending" && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => releaseOne(p._id)}
                                >
                                  Release
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => setRefundFor(p)}
                                >
                                  Refund
                                </Button>
                              </div>
                            )}
                            {tab === "released" && (
                              <Badge className="bg-emerald-100 text-emerald-800">
                                Released
                              </Badge>
                            )}
                            {tab === "refunded" && (
                              <Badge className="bg-red-100 text-red-800">
                                Refunded
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={!!refundFor}
          onOpenChange={(o) => !o && setRefundFor(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refund payment</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm">
                This will refund{" "}
                <strong>
                  {refundFor &&
                    fmtCurrency(refundFor.amount, refundFor.currency)}
                </strong>{" "}
                to the customer. If funds are still on hold, the transfer is
                reversed first.
              </p>
              <Input
                placeholder="Reason (optional)"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRefundFor(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={refundOne}
                disabled={busy}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm refund
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
