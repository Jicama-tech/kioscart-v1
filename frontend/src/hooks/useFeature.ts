import { useSubscription } from "@/context/SubscriptionContext";

/**
 * Is this feature available on the current plan?
 *
 * Thin wrapper over the subscription context so call sites read as
 * `useFeature("bulkImport")` rather than pulling the whole subscription object
 * apart. Lives here rather than beside FeatureGate because a module that
 * exports both components and plain functions defeats React Fast Refresh.
 *
 * A key the plan does not mention is treated as ENABLED — see FeatureGate.
 */
export function useFeature(key: string): boolean {
  const { isModuleEnabled } = useSubscription();
  return isModuleEnabled(key);
}

/**
 * The same answer, plus whether we actually know it yet.
 *
 * `isModuleEnabled` returns true while the subscription is still in flight,
 * because an absent plan means unrestricted. That default is right for the
 * steady state and wrong for the first paint: for the few hundred ms before
 * the fetch lands, every gate reports "enabled" and renders its children —
 * which mounts paid components and fires their effects. PnLReport did exactly
 * that, hitting a route its plan forbids and showing the shopkeeper a
 * "Failed to load P&L report" error for a feature they had not bought.
 *
 * So gates need to distinguish "enabled" from "not known yet" and render
 * nothing until the plan has arrived.
 */
export function useFeatureState(key: string): {
  enabled: boolean;
  loading: boolean;
} {
  const { isModuleEnabled, loading } = useSubscription();
  return { enabled: isModuleEnabled(key), loading };
}
