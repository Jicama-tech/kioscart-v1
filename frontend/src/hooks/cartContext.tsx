import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  CONTACT_EVENT,
  type PendingAdd,
  cartKeyFor,
  getCartContact,
  rememberSignedInCustomer,
  saveCart,
  setCartContact,
  setCartKey,
  startGoogleSignIn,
  takePendingAdd,
} from "@/lib/cartRecovery";
import { CartGateDialog } from "@/components/storefront/CartGateDialog";

export interface CartItem {
  measurement?: string;
  inventory: number;
  productId: string;
  productName: string;
  price: number;
  discountedPrice?: number;
  isDiscounted?: boolean;
  trackQuantity: boolean;
  quantity: number;
  subcategoryIndex: number;
  subcategoryName: string;
  variantTitle: string;
  variantIndex: number;
  image?: string;
  shopkeeperName?: string;
  sku?: string;
  category?: string;
  optionTitle?: string;
  optionPrice?: number;
}

function cartItemKey(item: {
  productId: string;
  subcategoryIndex?: number;
  variantIndex?: number;
  optionTitle?: string;
}): string {
  return `${item.productId}::${item.optionTitle || ""}::${item.subcategoryIndex ?? 0}::${item.variantIndex ?? 0}`;
}

function matchCartItem(
  a: { productId: string; subcategoryIndex?: number; variantIndex?: number; optionTitle?: string },
  b: { productId: string; subcategoryIndex?: number; variantIndex?: number; optionTitle?: string },
): boolean {
  return cartItemKey(a) === cartItemKey(b);
}

interface CartItemIdentifier {
  productId: string;
  subcategoryIndex: number;
  variantIndex: number;
  optionTitle?: string;
}

interface CartContextType {
  cartItems: { [shopkeeperId: string]: CartItem[] };
  cartCount: (shopkeeperId: string) => number;
  cartTotal: (shopkeeperId: string) => number;
  /**
   * Adds to the cart. A shopper we cannot reach yet is first asked to continue with Google or give a WhatsApp number
   * (so the cart can be saved and followed up); returns false when the item waits for that.
   */
  addToCart: (
    shopkeeperId: string,
    item: Omit<CartItem, "quantity">,
    quantity?: number,
  ) => boolean;
  removeFromCart: (shopkeeperId: string, id: CartItemIdentifier) => void;
  updateQuantity: (
    shopkeeperId: string,
    id: CartItemIdentifier,
    quantity: number,
  ) => void;
  clearCart: (shopkeeperId: string) => void;
  /** Puts back a cart saved on the server (the "restore my cart" link in a reminder). */
  replaceCart: (shopkeeperId: string, items: CartItem[]) => void;
  isInCart: (shopkeeperId: string, id: CartItemIdentifier) => boolean;
  getCartItemQuantity: (
    shopkeeperId: string,
    id: CartItemIdentifier,
  ) => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const [cartItems, setCartItems] = useState<{
    [shopkeeperId: string]: CartItem[];
  }>({});
  const { toast } = useToast();
  // The browser's saved cart has been read; until then the empty state must not be sent to the server
  const [loaded, setLoaded] = useState(false);
  const [contact, setContact] = useState(getCartContact);
  // What was last sent per shop, so an unchanged cart is not sent again
  const lastSent = useRef<Record<string, string>>({});
  // The item waiting while the shopper is asked how to reach them
  const [gate, setGate] = useState<PendingAdd | null>(null);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem("cart");
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart);
        setCartItems(
          typeof parsedCart === "object" && parsedCart !== null
            ? parsedCart
            : {},
        );
      }
    } catch (error) {
      console.error("Error loading cart from localStorage:", error);
      setCartItems({});
    }
    setLoaded(true);
  }, []);

  // A logged-in customer (Google sign-in) can already be reached, by WhatsApp number or email, so their cart is saved
  useEffect(() => {
    if (!getCartContact()) rememberSignedInCustomer();
    const refresh = () => setContact(getCartContact());
    window.addEventListener(CONTACT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CONTACT_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // Once we know how to reach the shopper, each shop's cart is kept on the server, so a cart left behind can be
  // followed up (abandoned carts) and opened again from the reminder. An emptied cart is removed and the next one
  // gets a new key.
  useEffect(() => {
    if (!loaded || !contact) return;
    const timer = setTimeout(() => {
      const shops = new Set([...Object.keys(cartItems), ...Object.keys(lastSent.current)]);
      shops.forEach((shopId) => {
        const items = cartItems[shopId] || [];
        const payload = JSON.stringify([items, contact]);
        if (lastSent.current[shopId] === payload) return;
        if (!items.length) {
          const key = cartKeyFor(shopId, false);
          if (key) saveCart(shopId, key, [], contact).catch(() => {});
          setCartKey(shopId, null);
          delete lastSent.current[shopId];
          return;
        }
        lastSent.current[shopId] = payload;
        saveCart(shopId, cartKeyFor(shopId)!, items, contact).catch(() => {
          delete lastSent.current[shopId]; // try again on the next change
        });
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [cartItems, contact, loaded]);

  // Back from Google sign-in: the item they were adding goes into the cart
  useEffect(() => {
    if (!loaded || !contact) return;
    const pending = takePendingAdd();
    if (pending) putInCart(pending.shopkeeperId, pending.item, pending.quantity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, contact]);

  // Save cart to localStorage whenever cartItems changes
  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cartItems));
    } catch (error) {
      console.error("Error saving cart to localStorage:", error);
    }
  }, [cartItems]);

  // The shop's own staff (logged in to the dashboard) are not asked
  const isShopStaff = () => {
    try {
      return !!sessionStorage.getItem("token");
    } catch {
      return false;
    }
  };

  const addToCart = (
    shopkeeperId: string,
    newItem: Omit<CartItem, "quantity">,
    quantity: number = 1,
  ): boolean => {
    if (!getCartContact() && !isShopStaff()) {
      setGate({ shopkeeperId, item: newItem, quantity });
      return false;
    }
    putInCart(shopkeeperId, newItem, quantity);
    return true;
  };

  const putInCart = (
    shopkeeperId: string,
    newItem: Omit<CartItem, "quantity">,
    quantity: number = 1,
  ) => {
    setCartItems((prev) => {
      const shopCart = prev[shopkeeperId] || [];

      const existingIndex = shopCart.findIndex((item) =>
        matchCartItem(item, newItem),
      );

      if (existingIndex >= 0) {
        const updatedShopCart = [...shopCart];
        updatedShopCart[existingIndex] = {
          ...updatedShopCart[existingIndex],
          quantity: updatedShopCart[existingIndex].quantity + quantity,
        };

        toast({
          duration: 5000,
          title: "Cart Updated",
          description: `${newItem.productName} quantity updated in cart`,
        });

        return {
          ...prev,
          [shopkeeperId]: updatedShopCart,
        };
      } else {
        const cartItem: CartItem = { ...newItem, quantity };

        toast({
          duration: 5000,
          title: "Added to Cart",
          description: `${newItem.productName} added to your cart`,
        });

        return {
          ...prev,
          [shopkeeperId]: [...shopCart, cartItem],
        };
      }
    });
  };

  const removeFromCart = (shopkeeperId: string, id: CartItemIdentifier) => {
    setCartItems((prev) => {
      const shopCart = prev[shopkeeperId] || [];
      const itemToRemove = shopCart.find((item) => matchCartItem(item, id));

      if (itemToRemove) {
        toast({
          duration: 5000,
          title: "Removed from Cart",
          description: `${itemToRemove.productName} removed from cart`,
        });
      }

      const updatedShopCart = shopCart.filter(
        (item) => !matchCartItem(item, id),
      );
      return { ...prev, [shopkeeperId]: updatedShopCart };
    });
  };

  const updateQuantity = (
    shopkeeperId: string,
    id: CartItemIdentifier,
    quantity: number,
  ) => {
    if (quantity <= 0) {
      removeFromCart(shopkeeperId, id);
      return;
    }

    setCartItems((prev) => {
      const shopCart = prev[shopkeeperId] || [];
      const updatedShopCart = shopCart.map((item) => {
        if (matchCartItem(item, id)) {
          return { ...item, quantity };
        }
        return item;
      });

      toast({
        duration: 5000,
        title: "Quantity Updated",
        description: `Cart quantity updated to ${quantity}`,
      });

      return { ...prev, [shopkeeperId]: updatedShopCart };
    });
  };

  const clearCart = (shopkeeperId: string) => {
    setCartItems((prev) => {
      const newCart = { ...prev };
      delete newCart[shopkeeperId];
      return newCart;
    });
    toast({
      duration: 5000,
      title: "Cart Cleared",
      description: "All items removed from cart for this shopkeeper",
    });
  };

  const replaceCart = (shopkeeperId: string, items: CartItem[]) => {
    setCartItems((prev) => ({ ...prev, [shopkeeperId]: items }));
  };

  const isInCart = (shopkeeperId: string, id: CartItemIdentifier): boolean => {
    const shopCart = cartItems[shopkeeperId] || [];
    return shopCart.some((item) => matchCartItem(item, id));
  };

  const getCartItemQuantity = (
    shopkeeperId: string,
    id: CartItemIdentifier,
  ): number => {
    const shopCart = cartItems[shopkeeperId] || [];
    const found = shopCart.find((item) => matchCartItem(item, id));
    return found ? found.quantity : 0;
  };

  const cartCount = (shopkeeperId: string) => {
    const shopCart = cartItems[shopkeeperId] || [];
    return shopCart.reduce((total, item) => total + item.quantity, 0);
  };

  const cartTotal = (shopkeeperId: string) => {
    const shopCart = cartItems[shopkeeperId] || [];
    return shopCart.reduce(
      (total, item) =>
        total +
        (item.isDiscounted
          ? item.discountedPrice * item.quantity
          : item.price * item.quantity),
      0,
    );
  };

  const contextValue: CartContextType = useMemo(
    () => ({
      cartItems,
      cartCount,
      cartTotal,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      replaceCart,
      isInCart,
      getCartItemQuantity,
    }),
    [cartItems],
  );

  return (
    <CartContext.Provider value={contextValue}>
      {children}
      {gate && (
        <CartGateDialog
          productName={gate.item.productName}
          onClose={() => setGate(null)}
          onGoogle={() => startGoogleSignIn(gate)}
          onWhatsApp={(whatsapp, name) => {
            setCartContact({ whatsapp, name });
            putInCart(gate.shopkeeperId, gate.item, gate.quantity);
            setGate(null);
          }}
        />
      )}
    </CartContext.Provider>
  );
};
