import { ReactNode } from "react";
import { useSubscription } from "@/context/SubscriptionContext";
import { Lock } from "lucide-react";

interface ModuleGateProps {
  moduleKey: string;
  children: ReactNode;
  fallbackText?: string;
}

export function ModuleGate({ moduleKey, children, fallbackText }: ModuleGateProps) {
  const { isModuleEnabled } = useSubscription();

  if (isModuleEnabled(moduleKey)) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[2px] opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 z-10 overflow-hidden">
        <div className="sticky top-[40vh] flex justify-center pointer-events-auto">
          <div className="text-center p-5 bg-white/95 rounded-xl shadow-xl border max-w-xs">
            <Lock className="h-7 w-7 mx-auto mb-2 text-indigo-500" />
            <p className="text-sm font-semibold text-slate-800">
              {fallbackText || "Upgrade your plan to access this feature"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Go to Settings &gt; Profile &gt; Change Plan
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
