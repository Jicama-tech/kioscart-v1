import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "./AdminLayout";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface FeedbackRow {
  _id: string;
  name: string;
  emailId: string;
  description: string;
  image: string;
  showOnMainPage: boolean;
  status: string;
  createdAt: string;
}

interface AppFeedbackPageProps {
  onLogout: () => void;
}

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

export default function AppFeedbackPage({ onLogout }: AppFeedbackPageProps) {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeedbackRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${apiURL}/app-feedback/admin`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(`Failed to load feedback: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleShow(row: FeedbackRow, next: boolean) {
    setBusyId(row._id);
    // Optimistic update — flip back on failure.
    setRows((prev) =>
      prev.map((r) => (r._id === row._id ? { ...r, showOnMainPage: next } : r)),
    );
    try {
      const res = await fetch(`${apiURL}/app-feedback/admin/${row._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ showOnMainPage: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(next ? "Published to landing page" : "Hidden from landing page");
    } catch (err: any) {
      setRows((prev) =>
        prev.map((r) =>
          r._id === row._id ? { ...r, showOnMainPage: !next } : r,
        ),
      );
      toast.error(`Update failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete._id;
    setBusyId(id);
    try {
      const res = await fetch(`${apiURL}/app-feedback/admin/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((prev) => prev.filter((r) => r._id !== id));
      toast.success("Feedback deleted");
      setPendingDelete(null);
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const publishedCount = rows.filter((r) => r.showOnMainPage).length;

  return (
    <AdminLayout onLogout={onLogout}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">App Feedback</h2>
            <p className="text-sm text-muted-foreground">
              Submissions from the Kioscart landing page. Tick "Show on Main Page" to publish.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rows.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Live on Landing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{publishedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Awaiting Review</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {rows.length - publishedCount}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading feedback…</p>
              </div>
            ) : rows.length === 0 ? (
              <div className="p-12 text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No feedback yet. Submissions from the landing page will appear here.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Feedback</TableHead>
                    <TableHead className="w-36">Submitted</TableHead>
                    <TableHead className="w-36 text-center">Show on Main Page</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const src = row.image.startsWith("http")
                      ? row.image
                      : `${apiURL}${row.image}`;
                    return (
                      <TableRow key={row._id}>
                        <TableCell>
                          <a
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img
                              src={src}
                              alt={row.name}
                              className="w-12 h-12 object-cover rounded border"
                              loading="lazy"
                            />
                          </a>
                        </TableCell>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.emailId}
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="text-sm line-clamp-2">{row.description}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(row.createdAt)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Checkbox
                              checked={row.showOnMainPage}
                              onCheckedChange={(v) => toggleShow(row, v === true)}
                              disabled={busyId === row._id}
                            />
                            {row.showOnMainPage && (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-700"
                              >
                                Live
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setPendingDelete(row)}
                            disabled={busyId === row._id}
                            className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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

      <Dialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this feedback?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the feedback from <strong>{pendingDelete?.name}</strong> and deletes the uploaded image.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={!!busyId}
            >
              {busyId && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
