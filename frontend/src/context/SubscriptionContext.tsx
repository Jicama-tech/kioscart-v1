import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import { OPT_IN_MODULE_KEYS } from "@/lib/planModules";

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

// `loading: false` in the default, deliberately. The provider wraps only the
// dashboard subtree, but gated components also render outside it — the
// standalone /estore-dashboard/product-* routes, and StorefrontCustomizer from
// the storefront pages. Gates return nothing while loading, so a default of
// `true` is never resolved out there: those screens render blank forever. With
// `false`, `isModuleEnabled`'s no-plan answer (enabled) stands and gates show
// their children, which is how they behaved before gating existed. Inside the
// provider the real state drives everything and this value is never read.
// Paid add-ons (OPT_IN_MODULE_KEYS) are the exception even out here: they did
// not exist before gating, and with no plan in hand they are off.
const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  loading: false,
  isModuleEnabled: (moduleKey: string) => !OPT_IN_MODULE_KEYS.has(moduleKey),
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

  // Re-read the plan when the shopkeeper comes back to the tab.
  //
  // Plans are edited in the Super Admin screen, in a different session, while
  // the shopkeeper's dashboard is already mounted — so a fetch on mount alone
  // means a toggle does not show up until they happen to reload. Refetching on
  // return is enough to make an admin change land on the next glance, without
  // polling a document that changes maybe monthly.
  //
  // visibilitychange only, not visibilitychange + window focus: returning to a
  // background tab fires both, so the pair sent two identical GETs every time.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") fetchSubscription();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [fetchSubscription]);

  const isModuleEnabled = useCallback(
    (moduleKey: string) => {
      // Paid add-ons read the plan the other way round: OFF unless an active
      // plan switches them on. The fallbacks below all answer "enabled" so a
      // missing plan, or a key a plan predates, never takes away a feature
      // the shop already had — but an add-on nobody paid for is not such a
      // feature. Same rule as the API's SubscriptionAccessService.
      if (OPT_IN_MODULE_KEYS.has(moduleKey)) {
        return (
          !!subscription?.subscribed &&
          !(subscription.isExpired && !subscription.inGracePeriod) &&
          subscription.modules?.[moduleKey]?.enabled === true
        );
      }

      if (!subscription || !subscription.subscribed) return true;

      // A lapsed plan disables everything, mirroring SubscriptionAccessService
      // on the API: past expiry AND past the seven-day grace window, no module
      // is enabled. Without this the dashboard stayed fully lit for a
      // shopkeeper 30 days past expiry — every nav item, KPI card and export
      // rendered while the API 403'd each one, so they saw zeros everywhere and
      // no reason to renew. Inside the grace window the plan is still paid for,
      // so it stays fully enabled.
      if (subscription.isExpired && !subscription.inGracePeriod) return false;

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
