import { ReactNode } from "react";
import { Lock } from "lucide-react";
import { t as i18nT } from "@/i18n/t";
import { useFeatureState } from "@/hooks/useFeature";

interface ModuleGateProps {
  moduleKey: string;
  children: ReactNode;
  fallbackText?: string;
}

/**
 * Gates a whole panel or tab on its plan key — the large-surface counterpart to
 * `FeatureGate`, which gates a single control.
 *
 * Locked means NOT MOUNTED, not merely dimmed. This used to blur the children
 * and float the card over them, which looked like a lock but left the real
 * component live underneath: its effects ran and its fetches fired, so a gated
 * panel still hammered routes its plan forbids and surfaced the 403s as load
 * errors. A blurred screenshot of a panel the shopkeeper cannot use is worth
 * less than the upgrade prompt on its own anyway.
 */
export function ModuleGate({ moduleKey, children, fallbackText }: ModuleGateProps) {
  const { enabled, loading } = useFeatureState(moduleKey);

  // Nothing until the plan is known, same as FeatureGate. `isModuleEnabled`
  // answers "enabled" while the fetch is in flight, so rendering optimistically
  // here would mount the paid panel for the few hundred ms before the plan
  // lands — exactly the fetch storm this gate exists to prevent.
  if (loading) return null;

  if (enabled) return <>{children}</>;

  return (
    <div className="flex justify-center px-4 py-16">
      <div className="text-center p-5 bg-card text-card-foreground rounded-xl shadow-xl border max-w-xs">
        <Lock className="h-7 w-7 mx-auto mb-2 text-indigo-500" />
        <p className="text-sm font-semibold text-foreground">
          {fallbackText || i18nT("Upgrade your plan to access this feature")}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {i18nT("Go to Settings > Profile > Change Plan")}
        </p>
      </div>
    </div>
  );
}
