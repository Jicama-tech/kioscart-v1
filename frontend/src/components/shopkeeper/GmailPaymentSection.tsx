import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Mail,
  CheckCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";

const apiURL = __API_URL__;

interface GmailConnection {
  email: string;
  isActive: boolean;
  lastPolledAt: string | null;
}

export function GmailPaymentSection() {
  const [connection, setConnection] = useState<GmailConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);

  const token = sessionStorage.getItem("token");

  useEffect(() => {
    fetchStatus();
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
    } catch (err) {
      console.error("Poll failed:", err);
    } finally {
      setPolling(false);
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

            {/* Payment transactions are now in Orders & Payments tab */}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
