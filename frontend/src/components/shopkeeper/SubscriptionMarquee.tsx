import React from "react";
import {
  Crown,
  Zap,
  Clock,
  AlertTriangle,
  CalendarCheck,
} from "lucide-react";

// Ported 1:1 from eventsh's organizer ChatbotWidget subscription marquee.
// A quiet scrolling status bar (white bg, blue text, faint pill fills) that
// shows which plan is active and how much time is left.

interface SubLike {
  subscribed?: boolean;
  planName?: string;
  pricePaid?: string;
  planExpiryDate?: string;
  isExpired?: boolean;
  inGracePeriod?: boolean;
  graceDaysLeft?: number;
}

// kioscart's useSubscription doesn't expose daysLeft/fullyLapsed directly, so
// we derive them from the fields it does provide.
function deriveDaysLeft(expiry?: string): number {
  if (!expiry) return 0;
  const ms = new Date(expiry).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

function SubscriptionMarqueeRow({
  subscription,
  country,
  ariaHidden,
}: {
  subscription: {
    planName: string | null;
    pricePaid: string | null;
    planExpiryDate: string | null;
    daysLeft: number;
    fullyLapsed: boolean;
    inGracePeriod: boolean;
    graceDaysLeft: number;
  };
  country?: string;
  ariaHidden?: boolean;
}) {
  const symbol = country === "IN" ? "₹" : country === "SG" ? "SG$" : "$";
  const validTill = subscription.planExpiryDate
    ? new Date(subscription.planExpiryDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  // Status pill — color + label vary with the lifecycle stage so a renewal
  // nudge is loud when the plan is expiring.
  let statusIcon = <Clock className="h-3.5 w-3.5" />;
  let statusLabel = `${subscription.daysLeft} day${
    subscription.daysLeft === 1 ? "" : "s"
  } left`;
  let statusTint = "bg-blue-50 text-blue-700";
  if (subscription.fullyLapsed) {
    statusIcon = <AlertTriangle className="h-3.5 w-3.5" />;
    statusLabel = "Plan expired — renew now";
    statusTint = "bg-rose-50 text-rose-700";
  } else if (subscription.inGracePeriod) {
    statusIcon = <AlertTriangle className="h-3.5 w-3.5" />;
    statusLabel = `Grace period — ${subscription.graceDaysLeft} day${
      subscription.graceDaysLeft === 1 ? "" : "s"
    } to renew`;
    statusTint = "bg-amber-50 text-amber-700";
  } else if (subscription.daysLeft <= 7) {
    statusTint = "bg-amber-50 text-amber-700";
  }

  const Item = ({
    icon,
    children,
    tint,
  }: {
    icon: React.ReactNode;
    children: React.ReactNode;
    tint?: string;
  }) => (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
        tint || "bg-blue-50 text-blue-700"
      }`}
    >
      {icon}
      <span>{children}</span>
    </span>
  );

  return (
    <div
      className="flex items-center gap-3 pr-8 shrink-0"
      aria-hidden={ariaHidden}
    >
      <Item icon={<Crown className="h-3.5 w-3.5" />}>
        {subscription.planName || "—"}
      </Item>
      {subscription.pricePaid ? (
        <Item icon={<Zap className="h-3.5 w-3.5" />}>
          {symbol}
          {subscription.pricePaid} paid
        </Item>
      ) : null}
      <Item icon={statusIcon} tint={statusTint}>
        {statusLabel}
      </Item>
      <Item icon={<CalendarCheck className="h-3.5 w-3.5" />}>
        Valid till {validTill}
      </Item>
      <span className="text-muted-foreground">•</span>
    </div>
  );
}

export function SubscriptionMarquee({
  subscription,
  country,
}: {
  subscription: SubLike | null;
  country?: string;
}) {
  if (!subscription || !subscription.subscribed) return null;

  const normalized = {
    planName: subscription.planName ?? null,
    pricePaid: subscription.pricePaid ?? null,
    planExpiryDate: subscription.planExpiryDate ?? null,
    daysLeft: deriveDaysLeft(subscription.planExpiryDate),
    fullyLapsed: !!subscription.isExpired && !subscription.inGracePeriod,
    inGracePeriod: !!subscription.inGracePeriod,
    graceDaysLeft: subscription.graceDaysLeft ?? 0,
  };

  return (
    <div
      className="relative overflow-hidden border-b border-border bg-card text-blue-700 px-2 py-2 flex-shrink-0"
      role="status"
      aria-label={`Subscription: ${normalized.planName}, ${
        normalized.fullyLapsed ? "expired" : `${normalized.daysLeft} days left`
      }`}
    >
      <div className="flex w-max animate-sub-marquee whitespace-nowrap hover:[animation-play-state:paused]">
        <SubscriptionMarqueeRow subscription={normalized} country={country} />
        {/* second copy — required by the -50% keyframe so the loop feels
            seamless instead of snapping back */}
        <SubscriptionMarqueeRow
          subscription={normalized}
          country={country}
          ariaHidden
        />
      </div>

      <style>{`
        @keyframes sub-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-sub-marquee {
          animation: sub-marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

export default SubscriptionMarquee;
