import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Trash2, Clock, ShoppingBag } from "lucide-react";
import { KioskCart } from "@/hooks/useKioskCarts";

interface KioskParkedCartsProps {
  carts: KioskCart[];
  getCartTotal: (cartId: string) => number;
  getCartItemCount: (cartId: string) => number;
  onResume: (cartId: string) => void;
  onDelete: (cartId: string) => void;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function KioskParkedCarts({
  carts,
  getCartTotal,
  getCartItemCount,
  onResume,
  onDelete,
}: KioskParkedCartsProps) {
  if (carts.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Parked Carts
        </h3>
        <Badge variant="secondary" className="text-[10px] h-4">
          {carts.length}
        </Badge>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {carts.map((cart) => {
          const total = getCartTotal(cart.id);
          const count = getCartItemCount(cart.id);

          return (
            <div
              key={cart.id}
              className="flex-shrink-0 w-44 border rounded-lg p-2.5 bg-amber-50 border-amber-200 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between mb-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {cart.customerName}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgo(cart.updatedAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-slate-400 hover:text-red-500"
                  onClick={() => onDelete(cart.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-2">
                <ShoppingBag className="h-3 w-3" />
                <span>
                  {count} item{count !== 1 ? "s" : ""}
                </span>
                <span className="font-semibold text-slate-700 ml-auto">
                  ${total.toFixed(2)}
                </span>
              </div>

              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => onResume(cart.id)}
              >
                <Play className="h-3 w-3 mr-1" />
                Resume
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
