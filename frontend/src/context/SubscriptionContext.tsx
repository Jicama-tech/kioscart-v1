import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { jwtDecode } from "jwt-decode";

const apiURL = __API_URL__;

interface SubscriptionData {
  subscribed: boolean;
  planName?: string;
  planId?: string;
  planStartDate?: string;
  planExpiryDate?: string;
  pricePaid?: string;
  validityInDays?: number;
  features?: string[];
  modules?: Record<string, { enabled: boolean; limit?: number }>;
  isExpired?: boolean;
  inGracePeriod?: boolean;
  graceDaysLeft?: number;
  isDefault?: boolean;
}

interface SubscriptionContextValue {
  subscription: SubscriptionData | null;
  loading: boolean;
  isModuleEnabled: (moduleKey: string) => boolean;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  loading: true,
  isModuleEnabled: () => true,
  refetch: () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    try {
      const token = sessionStorage.getItem("token");
      if (!token) {
        setLoading(false);
        return;
      }
      const decoded: any = jwtDecode(token);
      const id = decoded?.sub;
      if (!id) {
        setLoading(false);
        return;
      }
      const res = await fetch(`${apiURL}/shopkeepers/subscription/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (err) {
      console.error("Failed to load subscription:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const isModuleEnabled = useCallback(
    (moduleKey: string) => {
      if (!subscription || !subscription.subscribed) return true;
      if (!subscription.modules) return true;
      return subscription.modules[moduleKey]?.enabled !== false;
    },
    [subscription],
  );

  return (
    <SubscriptionContext.Provider
      value={{ subscription, loading, isModuleEnabled, refetch: fetchSubscription }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
