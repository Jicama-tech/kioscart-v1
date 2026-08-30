import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, Clock, CheckCircle2 } from "lucide-react";

import { t as i18nT } from "@/i18n/t";
const apiURL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface CurrencyTotals {
  held: number;
  released: number;
  pendingCapture: number;
  count: number;
}

function fmt(amount: number, currency: string) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Bogus currency code (e.g. if the API returned an error body) — fall
    // back to a plain string instead of throwing.
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function EarningsWidget({ shopkeeperId }: { shopkeeperId: string }) {
  const [data, setData] = useState<Record<string, CurrencyTotals>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopkeeperId) return;
    // Token lives in sessionStorage (see useAuth) — reading localStorage here
    // sent an empty Bearer token, which 401'd this endpoint.
    const token =
      sessionStorage.getItem("token") || localStorage.getItem("token") || "";
    fetch(`${apiURL}/payments/earnings/${shopkeeperId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      // Only treat a 2xx body as earnings data. On 401/500 the body is an
      // error object ({message, statusCode, …}) — storing that would make
      // Object.keys() yield "message"/"statusCode" as fake "currencies" and
      // crash fmt() on the bogus currency + undefined amount.
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) =>
        setData(d && typeof d === "object" && !Array.isArray(d) ? d : {}),
      )
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, [shopkeeperId]);

  const currencies = Object.keys(data);
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {i18nT("Loading earnings…")}
        </CardContent>
      </Card>
    );
  }
  if (!currencies.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{i18nT("Earnings")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {i18nT("No payments through KiosCart yet.")}
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
                  <span>{i18nT("Lifetime released")}</span>
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
