import { useState, useEffect } from "react";
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
import { useCurrency } from "@/hooks/useCurrencyhook";
import { KioskProductBrowser } from "./KioskProductBrowser";
import { KioskCartPanel } from "./KioskCartPanel";
import { KioskParkedCarts } from "./KioskParkedCarts";
import { KioskCheckoutDialog } from "./KioskCheckoutDialog";
import { KioskPendingPayments } from "./KioskPendingPayments";

import { t as i18nT } from "@/i18n/t";
import { FeatureGate } from "@/components/ui/FeatureGate";
import { useFeature } from "@/hooks/useFeature";
import { kioskPayments, type KioskPayment } from "@/lib/kioskPayments";
const apiURL = __API_URL__;

interface KioskModeProps {
  shopkeeperId: string;
}

export function KioskMode({ shopkeeperId }: KioskModeProps) {
  const {
    carts,
    activeCart,
    activeCartId,
    parkedCarts,
    createCart,
    parkCart,
    resumeCart,
    deleteCart,
    setCartPayment,
    addItem,
    removeItem,
    updateItemQuantity,
    getCartTotal,
    getCartItemCount,
  } = useKioskCarts(shopkeeperId);

  const [newCartDialogOpen, setNewCartDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [shopkeeperCountry, setShopkeeperCountry] = useState("IN");
  const [shopName, setShopName] = useState("");
  // bumped after a checkout, so a sale just put on "Payment pending" shows at once
  const [pendingRefresh, setPendingRefresh] = useState(0);
  const [showPaymentId, setShowPaymentId] = useState<string | null>(null);
  // carts waiting for a QR payment stay in the parked carts row (when the plan has it; otherwise they are listed
  // under "Payment pending")
  const parkedEnabled = useFeature("kioskParkedCarts");
  const parkedPaymentIds = parkedEnabled ? carts.filter((c) => c.payment).map((c) => c.payment!.id) : [];

  // a parked cart follows its payment: paid (the order is placed) it goes, cancelled it is an ordinary parked cart
  function handlePaymentChange(p: KioskPayment) {
    const cart = carts.find((c) => c.payment?.id === p.id);
    if (!cart) return;
    if (p.status === "paid") deleteCart(cart.id);
    else if (p.status === "cancelled") setCartPayment(cart.id, null);
    else if (p.status !== cart.payment!.status) setCartPayment(cart.id, { ...cart.payment!, status: p.status });
  }

  // deleting a cart whose payment link is out cancels the link too
  async function handleDeleteCart(cartId: string) {
    const cart = carts.find((c) => c.id === cartId);
    if (cart?.payment) {
      try {
        await kioskPayments.cancel(cart.payment.id);
      } catch {
        // the link just expires on its own
      }
    }
    deleteCart(cartId);
  }

  function handlePaymentPending(payment: KioskPayment) {
    if (activeCartId) {
      setCartPayment(activeCartId, { id: payment.id, amount: payment.amount, payUrl: payment.payUrl, status: "pending" });
    }
    setCheckoutOpen(false);
    setPendingRefresh((n) => n + 1);
  }

  // Fetch shopkeeper info for currency
  useEffect(() => {
    async function fetchShopkeeper() {
      try {
        const token = sessionStorage.getItem("token");
        const res = await fetch(
          `${apiURL}/shopkeepers/Shopkeeper-detail/${shopkeeperId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const { data } = await res.json();
          if (data?.country) setShopkeeperCountry(data.country);
          if (data?.shopName) setShopName(data.shopName);
        }
      } catch {}
    }
    if (shopkeeperId) fetchShopkeeper();
  }, [shopkeeperId]);

  const { formatPrice } = useCurrency(shopkeeperCountry);

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
    const cartToDelete = activeCartId;
    setCheckoutOpen(false);
    setPendingRefresh((n) => n + 1);
    // Delete cart after dialog closes to avoid unmounting mid-callback
    setTimeout(() => {
      if (cartToDelete) {
        deleteCart(cartToDelete);
      }
    }, 100);
  }

  const activeTotal = activeCartId ? getCartTotal(activeCartId) : 0;
  const activeItemCount = activeCartId ? getCartItemCount(activeCartId) : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-bold text-foreground">{i18nT("Kiosk Mode")}</h2>
        </div>
        <Button
          onClick={() => setNewCartDialogOpen(true)}
          className="h-9"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          {i18nT("New Cart")}
        </Button>
      </div>

      {/* Parked Carts Row */}
      <FeatureGate feature="kioskParkedCarts">
      <KioskParkedCarts
        carts={parkedCarts}
        getCartTotal={getCartTotal}
        getCartItemCount={getCartItemCount}
        formatPrice={formatPrice}
        onResume={(id) => {
          if (activeCartId) parkCart(activeCartId);
          resumeCart(id);
        }}
        onDelete={handleDeleteCart}
        onShowPayment={(id) => {
          const cart = carts.find((c) => c.id === id);
          if (cart?.payment) setShowPaymentId(cart.payment.id);
        }}
      />
      </FeatureGate>

      {/* QR payments waiting for the customer: placed as orders once paid */}
      <KioskPendingPayments
        formatPrice={formatPrice}
        refreshKey={pendingRefresh}
        shopName={shopName}
        parkedIds={parkedPaymentIds}
        showId={showPaymentId}
        onShown={() => setShowPaymentId(null)}
        onPaymentChange={handlePaymentChange}
      />

      {/* Main Split Layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Product Browser */}
        <div className="flex-1 min-w-0 border rounded-lg p-3 bg-card overflow-hidden flex flex-col">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {i18nT("Products")}
          </h3>
          <div className="flex-1 overflow-hidden">
            <FeatureGate feature="kioskProductBrowser">
              <KioskProductBrowser
                onAddItem={addItem}
                activeCartId={activeCartId}
                formatPrice={formatPrice}
              />
            </FeatureGate>
          </div>
        </div>

        {/* Right: Active Cart */}
        <div className="w-80 flex-shrink-0 border rounded-lg p-3 bg-card flex flex-col">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {activeCart ? `Cart — ${activeCart.customerName}` : "Cart"}
          </h3>
          <div className="flex-1 overflow-hidden">
            <KioskCartPanel
              cart={activeCart}
              total={activeTotal}
              itemCount={activeItemCount}
              formatPrice={formatPrice}
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
            <DialogTitle>{i18nT("New Kiosk Cart")}</DialogTitle>
            <DialogDescription>
              {i18nT("Enter customer name or leave blank for walk-in")}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">{i18nT("Customer Name")}</Label>
            <Input
              placeholder={i18nT("e.g., Vansh Sharma")}
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
              {i18nT("Cancel")}
            </Button>
            <Button onClick={handleCreateCart}>
              <Plus className="h-4 w-4 mr-1" />
              {i18nT("Create Cart")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Checkout Dialog */}
      <FeatureGate feature="kioskCheckout">
      {activeCart && (
        <KioskCheckoutDialog
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          cart={activeCart}
          total={activeTotal}
          shopkeeperId={shopkeeperId}
          formatPrice={formatPrice}
          onOrderPlaced={handleOrderPlaced}
          onPaymentPending={handlePaymentPending}
        />
      )}
      </FeatureGate>
    </div>
  );
}
