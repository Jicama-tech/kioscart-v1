import { useState, useEffect, useCallback, useMemo } from "react";
import { CartItem } from "./cartContext";

export interface KioskCart {
  id: string;
  customerName: string;
  items: CartItem[];
  status: "active" | "parked";
  createdAt: number;
  updatedAt: number;
}

interface KioskState {
  carts: KioskCart[];
  activeCartId: string | null;
}

const STORAGE_KEY = (shopkeeperId: string) => `kioskCarts_${shopkeeperId}`;

function loadState(shopkeeperId: string): KioskState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(shopkeeperId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.carts)) return parsed;
    }
  } catch {}
  return { carts: [], activeCartId: null };
}

function saveState(shopkeeperId: string, state: KioskState) {
  try {
    localStorage.setItem(STORAGE_KEY(shopkeeperId), JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save kiosk carts:", e);
  }
}

export function useKioskCarts(shopkeeperId: string) {
  const [state, setState] = useState<KioskState>(() =>
    loadState(shopkeeperId),
  );

  // Persist on every change
  useEffect(() => {
    saveState(shopkeeperId, state);
  }, [shopkeeperId, state]);

  // Reload if shopkeeperId changes
  useEffect(() => {
    setState(loadState(shopkeeperId));
  }, [shopkeeperId]);

  const activeCart = useMemo(
    () => state.carts.find((c) => c.id === state.activeCartId) || null,
    [state],
  );

  const parkedCarts = useMemo(
    () => state.carts.filter((c) => c.status === "parked"),
    [state],
  );

  const createCart = useCallback((customerName?: string): string => {
    const id = `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = customerName?.trim() || `Walk-in #${Date.now().toString().slice(-4)}`;
    const newCart: KioskCart = {
      id,
      customerName: name,
      items: [],
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setState((prev) => ({
      carts: [...prev.carts, newCart],
      activeCartId: id,
    }));
    return id;
  }, []);

  const parkCart = useCallback((cartId: string) => {
    setState((prev) => ({
      carts: prev.carts.map((c) =>
        c.id === cartId
          ? { ...c, status: "parked" as const, updatedAt: Date.now() }
          : c,
      ),
      activeCartId: prev.activeCartId === cartId ? null : prev.activeCartId,
    }));
  }, []);

  const resumeCart = useCallback((cartId: string) => {
    setState((prev) => ({
      carts: prev.carts.map((c) =>
        c.id === cartId
          ? { ...c, status: "active" as const, updatedAt: Date.now() }
          : c,
      ),
      activeCartId: cartId,
    }));
  }, []);

  const deleteCart = useCallback((cartId: string) => {
    setState((prev) => ({
      carts: prev.carts.filter((c) => c.id !== cartId),
      activeCartId: prev.activeCartId === cartId ? null : prev.activeCartId,
    }));
  }, []);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity">, quantity: number = 1) => {
      setState((prev) => {
        if (!prev.activeCartId) return prev;
        return {
          ...prev,
          carts: prev.carts.map((c) => {
            if (c.id !== prev.activeCartId) return c;
            const existIdx = c.items.findIndex(
              (i) =>
                i.productId === item.productId &&
                i.subcategoryIndex === item.subcategoryIndex &&
                i.variantIndex === item.variantIndex,
            );
            let newItems: CartItem[];
            if (existIdx >= 0) {
              newItems = [...c.items];
              newItems[existIdx] = {
                ...newItems[existIdx],
                quantity: newItems[existIdx].quantity + quantity,
              };
            } else {
              newItems = [...c.items, { ...item, quantity }];
            }
            return { ...c, items: newItems, updatedAt: Date.now() };
          }),
        };
      });
    },
    [],
  );

  const removeItem = useCallback(
    (productId: string, subcategoryIndex: number, variantIndex: number) => {
      setState((prev) => {
        if (!prev.activeCartId) return prev;
        return {
          ...prev,
          carts: prev.carts.map((c) => {
            if (c.id !== prev.activeCartId) return c;
            return {
              ...c,
              items: c.items.filter(
                (i) =>
                  !(
                    i.productId === productId &&
                    i.subcategoryIndex === subcategoryIndex &&
                    i.variantIndex === variantIndex
                  ),
              ),
              updatedAt: Date.now(),
            };
          }),
        };
      });
    },
    [],
  );

  const updateItemQuantity = useCallback(
    (
      productId: string,
      subcategoryIndex: number,
      variantIndex: number,
      quantity: number,
    ) => {
      if (quantity <= 0) {
        removeItem(productId, subcategoryIndex, variantIndex);
        return;
      }
      setState((prev) => {
        if (!prev.activeCartId) return prev;
        return {
          ...prev,
          carts: prev.carts.map((c) => {
            if (c.id !== prev.activeCartId) return c;
            return {
              ...c,
              items: c.items.map((i) =>
                i.productId === productId &&
                i.subcategoryIndex === subcategoryIndex &&
                i.variantIndex === variantIndex
                  ? { ...i, quantity }
                  : i,
              ),
              updatedAt: Date.now(),
            };
          }),
        };
      });
    },
    [removeItem],
  );

  const getCartTotal = useCallback(
    (cartId: string): number => {
      const cart = state.carts.find((c) => c.id === cartId);
      if (!cart) return 0;
      return cart.items.reduce(
        (sum, i) =>
          sum +
          (i.isDiscounted && i.discountedPrice
            ? i.discountedPrice * i.quantity
            : i.price * i.quantity),
        0,
      );
    },
    [state.carts],
  );

  const getCartItemCount = useCallback(
    (cartId: string): number => {
      const cart = state.carts.find((c) => c.id === cartId);
      if (!cart) return 0;
      return cart.items.reduce((sum, i) => sum + i.quantity, 0);
    },
    [state.carts],
  );

  return {
    carts: state.carts,
    activeCart,
    activeCartId: state.activeCartId,
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
  };
}
