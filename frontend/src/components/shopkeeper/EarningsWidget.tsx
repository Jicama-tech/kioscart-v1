import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Clock, CheckCircle2 } from "lucide-react";

const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface CurrencyTotals {
  held: number;
  released: number;
  pendingCapture: number;
  count: number;
}

function fmt(amount: number, currency: string) {
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

export function EarningsWidget({ shopkeeperId }: { shopkeeperId: string }) {
  const [data, setData] = useState<Record<string, CurrencyTotals>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopkeeperId) return;
    const token = localStorage.getItem("token") || "";
    fetch(`${apiURL}/payments/earnings/${shopkeeperId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setData(d || {}))
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [shopkeeperId]);

  const currencies = Object.keys(data);
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading earnings…
        </CardContent>
      </Card>
    );
  }
  if (!currencies.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Earnings</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No payments through KiosCart yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {currencies.map((cur) => {
        const t = data[cur];
        return (
          <Card key={cur}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Earnings ({cur})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Held (awaiting release)</span>
                </div>
                <div className="font-semibold">{fmt(t.held, cur)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Lifetime released</span>
                </div>
                <div className="font-semibold">{fmt(t.released, cur)}</div>
              </div>
              <div className="text-xs text-muted-foreground pt-1 border-t">
                {t.count} payment{t.count === 1 ? "" : "s"} total
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default EarningsWidget;
