import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bug,
  CheckCircle2,
  CircleDot,
  Clock,
  HelpCircle,
  HelpingHand,
  Lightbulb,
  LifeBuoy,
  Loader2,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Category = "bug" | "feature_request" | "general" | "billing" | "other";
type Status = "open" | "in_progress" | "resolved";

interface TicketRow {
  _id: string;
  subject: string;
  category: Category;
  status: Status;
  comment: string;
  attachments: string[];
  userId: string;
  shopkeeper: { name: string; shopName: string; email: string } | null;
  createdAt: string;
}

const CATEGORY_META: Record<Category, { label: string; icon: any }> = {
  bug: { label: "Bug report", icon: Bug },
  feature_request: { label: "Feature request", icon: Lightbulb },
  general: { label: "General help", icon: HelpCircle },
  billing: { label: "Billing", icon: Receipt },
  other: { label: "Other", icon: HelpingHand },
};

const STATUS_META: Record<Status, { label: string; cls: string; icon: any }> = {
  open: {
    label: "Open",
    cls: "bg-amber-100 text-amber-800 border-amber-200",
    icon: CircleDot,
  },
  in_progress: {
    label: "In progress",
    cls: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Clock,
  },
  resolved: {
    label: "Resolved",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
};

function authHeaders() {
  const token = sessionStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function absUrl(p: string) {
  if (!p) return p;
  if (/^https?:\/\//i.test(p)) return p;
  return `${apiURL}${p}`;
}

export default function SupportTicketsPage() {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | Category>("all");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${apiURL}/app-feedback/support/admin`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data?.items) ? data.items : []);
    } catch (err: any) {
      toast.error(`Failed to load support tickets: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function changeStatus(row: TicketRow, next: Status) {
    if (next === row.status) return;
    const prev = row.status;
    setBusyId(row._id);
    // Optimistic update — revert on failure.
    setRows((rs) =>
      rs.map((r) => (r._id === row._id ? { ...r, status: next } : r)),
    );
    try {
      const res = await fetch(
        `${apiURL}/app-feedback/support/admin/${row._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: next }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(`Marked as "${STATUS_META[next].label}"`);
    } catch (err: any) {
      setRows((rs) =>
        rs.map((r) => (r._id === row._id ? { ...r, status: prev } : r)),
      );
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    return {
      total: rows.length,
      open: rows.filter((r) => r.status === "open").length,
      in_progress: rows.filter((r) => r.status === "in_progress").length,
      resolved: rows.filter((r) => r.status === "resolved").length,
      bugs: rows.filter((r) => r.category === "bug").length,
    };
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (categoryFilter === "all" || r.category === categoryFilter),
      ),
    [rows, statusFilter, categoryFilter],
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <LifeBuoy className="w-6 h-6 text-indigo-600" />
              Support &amp; Bug Reports
            </h2>
            <p className="text-sm text-muted-foreground">
              Tickets submitted by shopkeepers from the Support tab. Update the
              status as you work through them.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{counts.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {counts.bugs} bug report{counts.bugs === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Open
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {counts.open}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {counts.in_progress}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Resolved
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {counts.resolved}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as any)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as any)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(CATEGORY_META).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading tickets…
                </p>
              </div>
            ) : visible.length === 0 ? (
              <div className="p-12 text-center">
                <LifeBuoy className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {rows.length === 0
                    ? "No tickets yet. Shopkeeper submissions will appear here."
                    : "No tickets match the current filters."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Category</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="w-48">Shopkeeper</TableHead>
                    <TableHead className="w-28">Attachments</TableHead>
                    <TableHead className="w-36">Submitted</TableHead>
                    <TableHead className="w-44">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => {
                    const cat = CATEGORY_META[row.category] ?? CATEGORY_META.other;
                    const CatIcon = cat.icon;
                    const st = STATUS_META[row.status] ?? STATUS_META.open;
                    const StIcon = st.icon;
                    return (
                      <TableRow key={row._id} className="align-top">
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="flex w-fit items-center gap-1 font-normal"
                          >
                            <CatIcon className="h-3.5 w-3.5" />
                            {cat.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="font-medium">{row.subject}</p>
                          <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap mt-0.5">
                            {row.comment}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.shopkeeper ? (
                            <>
                              <p className="font-medium">
                                {row.shopkeeper.shopName || row.shopkeeper.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {row.shopkeeper.name}
                              </p>
                              <p className="text-xs text-muted-foreground break-all">
                                {row.shopkeeper.email}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground break-all">
                              {row.userId}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.attachments && row.attachments.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {row.attachments.map((a, i) => (
                                <a
                                  key={i}
                                  href={absUrl(a)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-10 w-10 rounded border overflow-hidden bg-muted block"
                                  title="Open attachment"
                                >
                                  <img
                                    src={absUrl(a)}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                    }}
                                  />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs flex items-center gap-1 ${st.cls}`}
                            >
                              <StIcon className="h-3 w-3" />
                              {st.label}
                            </Badge>
                            <Select
                              value={row.status}
                              onValueChange={(v) =>
                                changeStatus(row, v as Status)
                              }
                              disabled={busyId === row._id}
                            >
                              <SelectTrigger className="h-8 w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">
                                  In progress
                                </SelectItem>
                                <SelectItem value="resolved">
                                  Resolved
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
