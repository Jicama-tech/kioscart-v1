import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, FileText, CheckCircle2, XCircle, Clock, Receipt, ArrowLeft, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { jwtDecode } from "jwt-decode";

const apiURL = __API_URL__;

const CATEGORIES = [
  "Rent",
  "Salaries",
  "Utilities",
  "Purchases/COGS",
  "Marketing",
  "Logistics",
  "Other",
];

interface Actor {
  id: string;
  role: string;
  name?: string;
}

interface Expense {
  _id: string;
  category: string;
  partyName: string;
  amount: number;
  description?: string;
  expenseDate: string;
  invoiceUrl?: string;
  addedBy: Actor;
  status: "pending" | "approved" | "rejected";
  approvedBy?: Actor;
  approvedAt?: string;
  rejectionReason?: string;
}

const STATUS_BADGE: Record<Expense["status"], { label: string; className: string; icon: any }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-700", icon: Clock },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700", icon: XCircle },
};

export function ExpenseManagement() {
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOperator, setIsOperator] = useState(false);
  // "list" = the expenses table; "form" = the full-screen Add Expense view
  // (replaces the old Dialog — entity create forms get their own screen).
  const [view, setView] = useState<"list" | "form">("list");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    category: "",
    partyName: "",
    amount: "",
    description: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    invoice: null as File | null,
  });

  const token = sessionStorage.getItem("token") || "";

  useEffect(() => {
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setIsOperator(!!decoded.operatorId);
      } catch {
        setIsOperator(false);
      }
    }
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiURL}/expenses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load expenses");
      const data = await res.json();
      setExpenses(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () =>
    setForm({
      category: "",
      partyName: "",
      amount: "",
      description: "",
      expenseDate: new Date().toISOString().slice(0, 10),
      invoice: null,
    });

  const handleSubmit = async () => {
    if (!form.category || !form.partyName || !form.amount || !form.expenseDate) {
      toast({ title: "Missing fields", description: "Category, party, amount and date are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append(
        "expense",
        JSON.stringify({
          category: form.category,
          partyName: form.partyName,
          amount: Number(form.amount),
          description: form.description,
          expenseDate: form.expenseDate,
        }),
      );
      if (form.invoice) formData.append("invoice", form.invoice);

      const res = await fetch(`${apiURL}/expenses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to add expense");

      toast({
        title: "Expense added",
        description: isOperator
          ? "Sent to the store owner for approval."
          : "Expense recorded and auto-approved.",
      });
      setView("list");
      resetForm();
      fetchExpenses();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (id: string) => {
    try {
      const res = await fetch(`${apiURL}/expenses/${id}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to approve");
      toast({ title: "Expense approved" });
      fetchExpenses();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const reject = async () => {
    if (!rejectingId || !rejectReason.trim()) return;
    try {
      const res = await fetch(`${apiURL}/expenses/${rejectingId}/reject`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error((await res.json()).message || "Failed to reject");
      toast({ title: "Expense rejected" });
      setRejectingId(null);
      setRejectReason("");
      fetchExpenses();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const totalApproved = expenses
    .filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + e.amount, 0);
  const pendingCount = expenses.filter((e) => e.status === "pending").length;

  // Full-screen Add Expense view — replaces the list entirely while active,
  // matching the singadvisor convention: entity create/edit forms get their
  // own screen, not a Dialog.
  if (view === "form") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Expenses
          </Button>
          <div>
            <h2 className="text-lg font-semibold">Add Expense</h2>
            <p className="text-sm text-muted-foreground">
              Record a business expense to feed into your P&amp;L report.
            </p>
          </div>
        </div>

        <Card className="max-w-2xl">
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Party name</Label>
              <Input
                value={form.partyName}
                onChange={(e) => setForm((f) => ({ ...f, partyName: e.target.value }))}
                placeholder="Vendor / supplier / payee name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.expenseDate}
                  onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <Label>Invoice (PDF/JPG/PNG)</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setForm((f) => ({ ...f, invoice: e.target.files?.[0] || null }))}
              />
            </div>
            {isOperator && (
              <p className="text-xs text-muted-foreground">
                This expense will be sent to the store owner for approval before it counts in the P&amp;L.
              </p>
            )}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Save Expense
              </Button>
              <Button variant="outline" onClick={() => setView("list")}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Expenses
          </h2>
          <p className="text-sm text-muted-foreground">
            Track business expenses feeding into your P&amp;L report.
          </p>
        </div>
        <Button onClick={() => setView("form")}>
          <Plus className="h-4 w-4 mr-2" /> Add Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved expenses</CardDescription>
            <CardTitle className="text-2xl">₹{totalApproved.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending approval</CardDescription>
            <CardTitle className="text-2xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No expenses recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Party</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Invoice</th>
                    <th className="p-3">Added by</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Approved by</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => {
                    const badge = STATUS_BADGE[e.status];
                    const BadgeIcon = badge.icon;
                    return (
                      <tr key={e._id} className="border-b last:border-0">
                        <td className="p-3 whitespace-nowrap">{new Date(e.expenseDate).toLocaleDateString()}</td>
                        <td className="p-3">{e.category}</td>
                        <td className="p-3">{e.partyName}</td>
                        <td className="p-3 whitespace-nowrap">₹{e.amount.toLocaleString()}</td>
                        <td className="p-3">
                          {e.invoiceUrl ? (
                            <a
                              href={`${apiURL}${e.invoiceUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              <FileText className="h-4 w-4" /> View
                            </a>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {e.addedBy?.name || "—"}
                          <span className="text-muted-foreground"> ({e.addedBy?.role})</span>
                        </td>
                        <td className="p-3">
                          <Badge className={badge.className}>
                            <BadgeIcon className="h-3 w-3 mr-1" /> {badge.label}
                          </Badge>
                          {e.status === "rejected" && e.rejectionReason && (
                            <div className="text-xs text-muted-foreground mt-1">{e.rejectionReason}</div>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {e.approvedBy?.name ? `${e.approvedBy.name} (${e.approvedBy.role})` : "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {e.status === "pending" && !isOperator && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => approve(e._id)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRejectingId(e._id)}>
                                Reject
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={reject} disabled={!rejectReason.trim()}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
