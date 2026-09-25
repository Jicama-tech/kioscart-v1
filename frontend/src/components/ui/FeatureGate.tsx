import { ReactNode, SyntheticEvent, KeyboardEvent } from "react";
import { Lock } from "lucide-react";
import { t as i18nT } from "@/i18n/t";
import { useToast } from "@/hooks/use-toast";
import { useFeature, useFeatureState } from "@/hooks/useFeature";

/**
 * Gates a single control on its plan key.
 *
 * The distinction from `ModuleGate` is size. ModuleGate drops its children and
 * puts an upgrade card in their place, which reads well for a whole panel or
 * tab but is wrong for one button in a toolbar — a gap, or a full-width upgrade
 * card, between two working buttons looks like a rendering bug, not a locked
 * feature.
 *
 * Two modes, and the choice is a product one:
 *
 *   "hide" (default) removes the control outright. Right when its absence
 *   costs nothing — a second export button, a row action that duplicates one
 *   already in the toolbar.
 *
 *   "lock" leaves the control exactly where it is, dimmed with a padlock, and
 *   answers every attempt to use it with a "Subscribe to access" toast. Right
 *   when the feature is worth advertising: the shopkeeper can see that
 *   Variants exist and what they would get, which is the whole point of
 *   putting it on a plan. Hiding it instead just makes the product look like
 *   it cannot do the thing.
 *
 * `mode="lock"` intercepts on the CAPTURE phase, so the child's own onClick
 * never runs — the control is inert in fact, not merely in appearance. That
 * matters because these buttons mutate form state directly.
 *
 * A key the plan does not mention at all is treated as ENABLED, not disabled.
 * Plans predate most of these keys, so denying by default would silently strip
 * paying shopkeepers of features the moment this shipped; only an explicit
 * `{ enabled: false }` locks anything.
 */
export function FeatureGate({
  feature,
  children,
  mode = "hide",
  fallback = null,
  message,
}: {
  feature: string;
  children: ReactNode;
  mode?: "hide" | "lock";
  fallback?: ReactNode;
  /** Overrides the toast body, for a control whose value needs naming. */
  message?: string;
}) {
  const { enabled, loading } = useFeatureState(feature);
  const { toast } = useToast();

  // Render nothing until the plan is known. Children are NOT mounted in this
  // window — that is the point. A gated child that mounts optimistically runs
  // its effects, and an effect that fetches a plan-gated route comes back 403
  // and reports it to the shopkeeper as a failure.
  if (loading) return <>{fallback}</>;

  if (enabled) return <>{children}</>;
  if (mode === "hide") return <>{fallback}</>;

  const refuse = (e: SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toast({
      title: i18nT("Subscribe to access"),
      description: message || i18nT("Upgrade your plan to use this feature."),
    });
  };

  // Enter and Space are what activate a focused button or switch, so they get
  // the same treatment as a click — otherwise the control is reachable by
  // keyboard and still fires.
  const onKeyDownCapture = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") refuse(e);
  };

  return (
    <span
      className="inline-flex items-center gap-1 opacity-60 cursor-not-allowed [&_*]:cursor-not-allowed"
      onClickCapture={refuse}
      onKeyDownCapture={onKeyDownCapture}
      aria-disabled
      title={i18nT("Subscribe to access")}
    >
      {children}
      <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
    </span>
  );
}

/**
 * Small padlock for a tab trigger or heading that stays visible while locked,
 * so the feature still advertises itself as something the plan could include.
 */
export function LockHint({ feature }: { feature: string }) {
  const enabled = useFeature(feature);
  if (enabled) return null;
  return (
    <Lock
      className="h-3 w-3 ml-1 text-muted-foreground shrink-0"
      aria-label={i18nT("Locked — upgrade your plan")}
    />
  );
}
