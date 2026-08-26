import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const apiURL = __API_URL__;

interface PnLData {
  currencySymbol: string;
  period: string;
  startDate: string;
  endDate: string;
  revenue: number;
  totalExpenses: number;
  expensesByCategory: { category: string; amount: number }[];
  netProfit: number;
  marginPct: number;
}

export function PnLReport({ shopkeeperId, period }: { shopkeeperId: string; period: string }) {
  const { toast } = useToast();
  const [data, setData] = useState<PnLData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const token = sessionStorage.getItem("token") || "";

  useEffect(() => {
    if (!shopkeeperId || !period) return;
    fetchPnL();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopkeeperId, period]);

  const fetchPnL = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiURL}/shopkeeper/analytics/${shopkeeperId}/pnl/${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load P&L report");
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    setDownloading(true);
    try {
      const res = await fetch(
        `${apiURL}/shopkeeper/analytics/${shopkeeperId}/pnl/export/pdf/${period}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pnl_${period}_${shopkeeperId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Profit &amp; Loss</CardTitle>
          <CardDescription>Revenue minus approved expenses for the selected period</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={downloadPdf} disabled={downloading || !data}>
          {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download size={16} className="mr-2" />}
          PDF
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !data ? (
          <div className="text-center text-muted-foreground py-8">No data available.</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Revenue</CardDescription>
                  <CardTitle className="text-xl">
                    {data.currencySymbol}
                    {data.revenue.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Expenses (approved)</CardDescription>
                  <CardTitle className="text-xl">
                    {data.currencySymbol}
                    {data.totalExpenses.toLocaleString()}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Net Profit</CardDescription>
                  <CardTitle
                    className={`text-xl flex items-center gap-1 ${
                      data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {data.netProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    {data.currencySymbol}
                    {data.netProfit.toLocaleString()}
                    <span className="text-sm text-muted-foreground font-normal ml-1">
                      ({data.marginPct.toFixed(1)}%)
                    </span>
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Expenses by category</h4>
              {data.expensesByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved expenses in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr className="text-left">
                        <th className="p-2">Category</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2 text-right">% of expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expensesByCategory.map((row) => (
                        <tr key={row.category} className="border-b last:border-0">
                          <td className="p-2">{row.category}</td>
                          <td className="p-2 text-right">
                            {data.currencySymbol}
                            {row.amount.toLocaleString()}
                          </td>
                          <td className="p-2 text-right">
                            {data.totalExpenses > 0 ? ((row.amount / data.totalExpenses) * 100).toFixed(1) : "0.0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
