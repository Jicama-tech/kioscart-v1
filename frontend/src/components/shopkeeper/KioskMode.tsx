import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Monitor } from "lucide-react";
import { useKioskCarts } from "@/hooks/useKioskCarts";
import { KioskProductBrowser } from "./KioskProductBrowser";
import { KioskCartPanel } from "./KioskCartPanel";
import { KioskParkedCarts } from "./KioskParkedCarts";
import { KioskCheckoutDialog } from "./KioskCheckoutDialog";

interface KioskModeProps {
  shopkeeperId: string;
}

export function KioskMode({ shopkeeperId }: KioskModeProps) {
  const {
    activeCart,
    activeCartId,
    parkedCarts,
    createCart,
    parkCart,
    resumeCart,
    deleteCart,
    addItem,
    removeItem,
    updateItemQuantity,
    getCartTotal,
    getCartItemCount,
  } = useKioskCarts(shopkeeperId);

  const [newCartDialogOpen, setNewCartDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  function handleCreateCart() {
    createCart(customerName);
    setCustomerName("");
    setNewCartDialogOpen(false);
  }

  function handleParkActiveCart() {
    if (activeCartId) {
      parkCart(activeCartId);
    }
  }

  function handleCheckout() {
    setCheckoutOpen(true);
  }

  function handleOrderPlaced() {
    if (activeCartId) {
      deleteCart(activeCartId);
    }
    setCheckoutOpen(false);
  }

  const activeTotal = activeCartId ? getCartTotal(activeCartId) : 0;
  const activeItemCount = activeCartId ? getCartItemCount(activeCartId) : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-slate-600" />
          <h2 className="text-xl font-bold text-slate-800">Kiosk Mode</h2>
        </div>
        <Button
          onClick={() => setNewCartDialogOpen(true)}
          className="h-9"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Cart
        </Button>
      </div>

      {/* Parked Carts Row */}
      <KioskParkedCarts
        carts={parkedCarts}
        getCartTotal={getCartTotal}
        getCartItemCount={getCartItemCount}
        onResume={(id) => {
          // Park current active cart first if exists
          if (activeCartId) parkCart(activeCartId);
          resumeCart(id);
        }}
        onDelete={deleteCart}
      />

      {/* Main Split Layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Product Browser */}
        <div className="flex-1 min-w-0 border rounded-lg p-3 bg-white overflow-hidden flex flex-col">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">
            Products
          </h3>
          <div className="flex-1 overflow-hidden">
            <KioskProductBrowser
              onAddItem={addItem}
              activeCartId={activeCartId}
            />
          </div>
        </div>

        {/* Right: Active Cart */}
        <div className="w-80 flex-shrink-0 border rounded-lg p-3 bg-white flex flex-col">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">
            {activeCart ? `Cart — ${activeCart.customerName}` : "Cart"}
          </h3>
          <div className="flex-1 overflow-hidden">
            <KioskCartPanel
              cart={activeCart}
              total={activeTotal}
              itemCount={activeItemCount}
              onUpdateQuantity={updateItemQuantity}
              onRemoveItem={removeItem}
              onPark={handleParkActiveCart}
              onCheckout={handleCheckout}
            />
          </div>
        </div>
      </div>

      {/* New Cart Dialog */}
      <Dialog open={newCartDialogOpen} onOpenChange={setNewCartDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Kiosk Cart</DialogTitle>
            <DialogDescription>
              Enter customer name or leave blank for walk-in
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-slate-500">Customer Name</Label>
            <Input
              placeholder="e.g., Vansh Sharma"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="mt-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCart();
              }}
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setNewCartDialogOpen(false);
                setCustomerName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateCart}>
              <Plus className="h-4 w-4 mr-1" />
              Create Cart
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      {activeCart && (
        <KioskCheckoutDialog
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          cart={activeCart}
          total={activeTotal}
          shopkeeperId={shopkeeperId}
          onOrderPlaced={handleOrderPlaced}
        />
      )}
    </div>
  );
}
