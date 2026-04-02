import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { useToast } from "@/components/ui/use-toast";

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
  addToCart: (
    shopkeeperId: string,
    item: Omit<CartItem, "quantity">,
    quantity?: number,
  ) => void;
  removeFromCart: (shopkeeperId: string, id: CartItemIdentifier) => void;
  updateQuantity: (
    shopkeeperId: string,
    id: CartItemIdentifier,
    quantity: number,
  ) => void;
  clearCart: (shopkeeperId: string) => void;
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
  }, []);

  // Save cart to localStorage whenever cartItems changes
  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cartItems));
    } catch (error) {
      console.error("Error saving cart to localStorage:", error);
    }
  }, [cartItems]);

  const addToCart = (
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
      isInCart,
      getCartItemQuantity,
    }),
    [cartItems],
  );

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  );
};
