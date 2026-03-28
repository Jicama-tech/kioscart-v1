import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, Trash2, PauseCircle, CreditCard, ShoppingBag } from "lucide-react";
import { KioskCart } from "@/hooks/useKioskCarts";

const apiURL = __API_URL__;

interface KioskCartPanelProps {
  cart: KioskCart | null;
  total: number;
  itemCount: number;
  formatPrice: (amount: number) => string;
  onUpdateQuantity: (
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
    quantity: number,
  ) => void;
  onRemoveItem: (
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
  ) => void;
  onPark: () => void;
  onCheckout: () => void;
}

export function KioskCartPanel({
  cart,
  total,
  itemCount,
  formatPrice,
  onUpdateQuantity,
  onRemoveItem,
  onPark,
  onCheckout,
}: KioskCartPanelProps) {
  if (!cart) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 p-6">
        <ShoppingBag className="h-12 w-12 mb-3" />
        <p className="text-sm font-medium">No active cart</p>
        <p className="text-xs mt-1">Create a new cart or resume a parked one</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cart Header */}
      <div className="flex items-center justify-between pb-3 border-b mb-3">
        <div>
          <h3 className="font-semibold text-sm text-slate-800">
            {cart.customerName}
          </h3>
          <p className="text-xs text-slate-400">
            {itemCount} item{itemCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Active
        </Badge>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {cart.items.length === 0 ? (
          <div className="text-center text-slate-400 text-xs py-8">
            Add products from the left panel
          </div>
        ) : (
          cart.items.map((item, idx) => (
            <div
              key={`${item.productId}-${item.subcategoryIndex}-${item.variantIndex}`}
              className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border"
            >
              {/* Image */}
              {item.image && (
                <img
                  src={
                    item.image.startsWith("http")
                      ? item.image
                      : `${apiURL}${item.image}`
                  }
                  alt={item.productName}
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
              )}

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 truncate">
                  {item.productName}
                </p>
                {(item.subcategoryName !== "Default" ||
                  item.variantTitle !== "Default") && (
                  <p className="text-[10px] text-slate-400 truncate">
                    {item.subcategoryName !== "Default"
                      ? item.subcategoryName
                      : ""}
                    {item.subcategoryName !== "Default" &&
                    item.variantTitle !== "Default"
                      ? " - "
                      : ""}
                    {item.variantTitle !== "Default" ? item.variantTitle : ""}
                  </p>
                )}

                <div className="flex items-center justify-between mt-1.5">
                  {/* Quantity Controls */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        onUpdateQuantity(
                          item.productId,
                          item.subcategoryIndex,
                          item.variantIndex,
                          item.quantity - 1,
                        )
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-xs font-medium w-6 text-center">
                      {item.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() =>
                        onUpdateQuantity(
                          item.productId,
                          item.subcategoryIndex,
                          item.variantIndex,
                          item.quantity + 1,
                        )
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Price */}
                  <span className="text-xs font-semibold">
                    {formatPrice(
                      (item.isDiscounted && item.discountedPrice
                        ? item.discountedPrice
                        : item.price) * item.quantity
                    )}
                  </span>

                  {/* Remove */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                    onClick={() =>
                      onRemoveItem(
                        item.productId,
                        item.subcategoryIndex,
                        item.variantIndex,
                      )
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer: Total + Actions */}
      <div className="border-t pt-3 mt-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-slate-600">Total</span>
          <span className="text-lg font-bold text-slate-900">
            {formatPrice(total)}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-9"
            onClick={onPark}
            disabled={cart.items.length === 0}
          >
            <PauseCircle className="h-4 w-4 mr-1.5" />
            Park Cart
          </Button>
          <Button
            className="flex-1 h-9"
            onClick={onCheckout}
            disabled={cart.items.length === 0}
          >
            <CreditCard className="h-4 w-4 mr-1.5" />
            Checkout
          </Button>
        </div>
      </div>
    </div>
  );
}
