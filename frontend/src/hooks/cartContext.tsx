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
  removeFromCart: (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
  ) => void;
  updateQuantity: (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
    inventory: number,
  ) => void;
  clearCart: (shopkeeperId: string) => void;
  isInCart: (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
  ) => boolean;
  getCartItemQuantity: (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
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

      const existingIndex = shopCart.findIndex(
        (item) =>
          item.productId === newItem.productId &&
          item.subcategoryIndex === newItem.subcategoryIndex &&
          item.variantIndex === newItem.variantIndex,
      );

      if (existingIndex >= 0) {
        const updatedShopCart = [...shopCart];
        updatedShopCart[existingIndex].quantity += quantity;

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

  const removeFromCart = (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
  ) => {
    setCartItems((prev) => {
      const shopCart = prev[shopkeeperId] || [];
      const itemToRemove = shopCart.find(
        (item) =>
          item.productId === productId &&
          item.subcategoryIndex === subcategoryIndex &&
          item.variantIndex === variantIndex,
      );

      if (itemToRemove) {
        toast({
          duration: 5000,
          title: "Removed from Cart",
          description: `${itemToRemove.productName} removed from cart`,
        });
      }

      const updatedShopCart = shopCart.filter(
        (item) =>
          !(
            item.productId === productId &&
            item.subcategoryIndex === subcategoryIndex &&
            item.variantIndex === variantIndex
          ),
      );
      return { ...prev, [shopkeeperId]: updatedShopCart };
    });
  };

  const updateQuantity = (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
    quantity: number,
  ) => {
    if (quantity <= 0) {
      removeFromCart(shopkeeperId, productId, subcategoryIndex, variantIndex);
      return;
    }

    setCartItems((prev) => {
      const shopCart = prev[shopkeeperId] || [];
      const updatedShopCart = shopCart.map((item) => {
        if (
          item.productId === productId &&
          item.subcategoryIndex === subcategoryIndex &&
          item.variantIndex === variantIndex
        ) {
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

  const isInCart = (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
  ): boolean => {
    const shopCart = cartItems[shopkeeperId] || [];
    return shopCart.some(
      (item) =>
        item.productId === productId &&
        item.subcategoryIndex === subcategoryIndex &&
        item.variantIndex === variantIndex,
    );
  };

  const getCartItemQuantity = (
    shopkeeperId: string,
    productId: string,
    subcategoryIndex: number,
    variantIndex: number,
  ): number => {
    const shopCart = cartItems[shopkeeperId] || [];
    const item = shopCart.find(
      (item) =>
        item.productId === productId &&
        item.subcategoryIndex === subcategoryIndex &&
        item.variantIndex === variantIndex,
    );
    return item ? item.quantity : 0;
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
