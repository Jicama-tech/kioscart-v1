import { useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, Copy, Loader2, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { kioskPayments, type KioskPayment } from "@/lib/kioskPayments";
import { KioskPaymentQr } from "./KioskPaymentQr";
import { t as i18nT } from "@/i18n/t";

const POLL_MS = 15000;

/**
 * Kiosk sales waiting for a QR payment ("Payment pending"). The order is placed when the customer presses "I have
 * paid" on the payment link, or here with "Paid"; a sale paid on the link drops off this list by itself.
 */
export function KioskPendingPayments({
  formatPrice,
  refreshKey,
  shopName,
}: {
  formatPrice: (amount: number) => string;
  refreshKey: number;
  shopName: string;
}) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<KioskPayment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showing, setShowing] = useState<KioskPayment | null>(null);
  const known = useRef<Map<string, KioskPayment["status"]>>(new Map());

  const load = async () => {
    try {
      const { payments: list } = await kioskPayments.list();
      // a sale the customer has just paid on the link: say so once
      for (const p of list) {
        const before = known.current.get(p.id);
        if (before === "pending" && p.status === "paid" && p.paidBy === "customer") {
          toast({ title: i18nT("Payment confirmed"), description: `${p.customerName || i18nT("The customer")} paid ${formatPrice(p.amount)} — order placed.` });
        }
        known.current.set(p.id, p.status);
      }
      setPayments(list.filter((p) => p.status === "pending" || p.status === "expired"));
    } catch {
      // the list just stays as it was; the next poll tries again
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const act = async (p: KioskPayment, action: "paid" | "cancel") => {
    setBusy(p.id + action);
    try {
      if (action === "paid") {
        await kioskPayments.markPaid(p.id);
        toast({ title: i18nT("Order Placed"), description: `${p.customerName || ""} — ${formatPrice(p.amount)}` });
      } else {
        await kioskPayments.cancel(p.id);
      }
      setShowing(null);
      await load();
    } catch (e: any) {
      toast({ title: i18nT("Error"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copy = (p: KioskPayment) => {
    navigator.clipboard?.writeText(p.payUrl);
    toast({ title: i18nT("Link copied"), duration: 2000 });
  };

  if (payments.length === 0) return null;

  return (
    <div className="mb-4 border rounded-lg p-3 bg-amber-50/60 border-amber-200">
      <div className="flex items-center gap-2 mb-2">
        <Clock className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">{i18nT("Payment pending")}</h3>
        <Badge variant="secondary">{payments.length}</Badge>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {payments.map((p) => (
          <div key={p.id} className="min-w-[230px] bg-card border rounded-md p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{p.customerName || i18nT("Walk-in")}</p>
                <p className="text-xs text-muted-foreground">{formatPrice(p.amount)}</p>
              </div>
              <Badge variant={p.status === "expired" ? "destructive" : "outline"} className="shrink-0">
                {p.status === "expired" ? i18nT("Link expired") : i18nT("Waiting")}
              </Badge>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setShowing(p)} title={i18nT("Show QR")}>
                <QrCode className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => copy(p)} title={i18nT("Copy link")}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-8 flex-1" disabled={!!busy} onClick={() => act(p, "paid")}>
                {busy === p.id + "paid" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                {i18nT("Paid")}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" disabled={!!busy} onClick={() => act(p, "cancel")} title={i18nT("Cancel")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!showing} onOpenChange={(open) => !open && setShowing(null)}>
        <DialogContent className="sm:max-w-sm">
          {showing && (
            <>
              <DialogHeader>
                <DialogTitle>{i18nT("Payment pending")}</DialogTitle>
                <DialogDescription>
                  {showing.customerName || i18nT("Walk-in")} — {formatPrice(showing.amount)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white p-3 rounded-lg border">
                  <KioskPaymentQr qr={showing.qr} amount={showing.amount} payee={shopName} reference={showing.orderRef} />
                </div>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1" onClick={() => copy(showing)}>
                    <Copy className="h-4 w-4 mr-2" />{i18nT("Copy link")}
                  </Button>
                  <Button className="flex-1" disabled={!!busy} onClick={() => act(showing, "paid")}>
                    <CheckCircle className="h-4 w-4 mr-2" />{i18nT("Payment received")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
