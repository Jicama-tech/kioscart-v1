import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Mail,
  CheckCircle,
  XCircle,
  RefreshCw,
  Trash2,
  ExternalLink,
} from "lucide-react";

const apiURL = __API_URL__;

interface GmailConnection {
  email: string;
  isActive: boolean;
  lastPolledAt: string | null;
}

interface PaymentEmailRecord {
  _id: string;
  from: string;
  subject: string;
  amount: number;
  currency: string;
  senderName: string;
  referenceId: string;
  bankOrProvider: string;
  receivedAt: string;
  matchedOrderId: string;
  status: string;
}

export function GmailPaymentSection() {
  const [connection, setConnection] = useState<GmailConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [emails, setEmails] = useState<PaymentEmailRecord[]>([]);

  const token = sessionStorage.getItem("token");

  useEffect(() => {
    fetchStatus();
    fetchEmails();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch(`${apiURL}/payment-emails/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
        setConnection(data.connection);
      }
    } catch (err) {
      console.error("Failed to fetch Gmail status:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchEmails() {
    try {
      const res = await fetch(`${apiURL}/payment-emails/emails`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch (err) {
      console.error("Failed to fetch payment emails:", err);
    }
  }

  function handleConnect() {
    const decoded: any = token ? JSON.parse(atob(token.split(".")[1])) : null;
    const shopkeeperId = decoded?.sub;
    if (!shopkeeperId) return;
    window.location.href = `${apiURL}/payment-emails/connect?shopkeeperId=${shopkeeperId}`;
  }

  async function handleDisconnect() {
    try {
      await fetch(`${apiURL}/payment-emails/disconnect`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setConnected(false);
      setConnection(null);
      setEmails([]);
    } catch (err) {
      console.error("Failed to disconnect:", err);
    }
  }

  async function handleToggle(active: boolean) {
    try {
      const res = await fetch(
        `${apiURL}/payment-emails/toggle?active=${active}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        setConnection((prev) => (prev ? { ...prev, isActive: active } : null));
      }
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  }

  async function handleManualPoll() {
    setPolling(true);
    try {
      await fetch(`${apiURL}/payment-emails/poll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchEmails();
    } catch (err) {
      console.error("Poll failed:", err);
    } finally {
      setPolling(false);
    }
  }

  async function handleEmailAction(id: string, status: "confirmed" | "ignored") {
    try {
      await fetch(`${apiURL}/payment-emails/emails/${id}?status=${status}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmails((prev) =>
        prev.map((e) => (e._id === id ? { ...e, status } : e)),
      );
    } catch (err) {
      console.error("Failed to update email:", err);
    }
  }

  if (loading) {
    return (
      <Card className="mt-4">
        <CardContent className="py-6 text-center text-muted-foreground">
          Loading Gmail connection...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-5 w-5" />
          Payment Email Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect your Gmail to automatically detect payment emails (bank
          alerts, UPI, PayNow) and match them to pending orders.
        </p>

        {!connected ? (
          <Button onClick={handleConnect} variant="buttonOutline">
            <Mail className="h-4 w-4 mr-2" />
            Connect Gmail
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Connection Status */}
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium">{connection?.email}</p>
                  {connection?.lastPolledAt && (
                    <p className="text-xs text-muted-foreground">
                      Last checked:{" "}
                      {new Date(connection.lastPolledAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Active</Label>
                  <Switch
                    checked={connection?.isActive ?? false}
                    onCheckedChange={handleToggle}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleManualPoll}
                  disabled={polling}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${polling ? "animate-spin" : ""}`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnect}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Detected Payment Emails */}
            {emails.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  Detected Payments ({emails.length})
                </h4>
                {emails.map((email) => (
                  <div
                    key={email._id}
                    className="p-3 border rounded-lg text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-green-600">
                          {email.currency} {email.amount}
                        </span>
                        {email.bankOrProvider && (
                          <Badge variant="secondary" className="text-xs">
                            {email.bankOrProvider}
                          </Badge>
                        )}
                        <Badge
                          variant={
                            email.status === "matched"
                              ? "default"
                              : email.status === "confirmed"
                                ? "default"
                                : email.status === "ignored"
                                  ? "secondary"
                                  : "destructive"
                          }
                          className="text-xs"
                        >
                          {email.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(email.receivedAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {email.senderName || email.from}
                      {email.referenceId && ` · Ref: ${email.referenceId}`}
                    </p>
                    {email.matchedOrderId && (
                      <p className="text-xs text-blue-600">
                        Matched: Order #{email.matchedOrderId}
                      </p>
                    )}
                    {email.status !== "confirmed" &&
                      email.status !== "ignored" && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() =>
                              handleEmailAction(email._id, "confirmed")
                            }
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() =>
                              handleEmailAction(email._id, "ignored")
                            }
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Ignore
                          </Button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
