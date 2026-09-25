import { useEffect, useRef } from "react";
import { t as i18nT } from "@/i18n/t";

/**
 * The wire types and small helpers shared by the WhatsApp campaign screens.
 *
 * Kept apart from the components on purpose: a module that exports both
 * components and plain functions defeats React Fast Refresh (see
 * hooks/useFeature.ts), and the composer, the progress view and the CRM's
 * opt-out switch all need these.
 *
 * The shapes mirror backend/src/modules/campaigns (spec §5). The server is
 * the source of truth for everything that is sent: names, numbers, the
 * rendered text and the skip reasons all come from it, never from the list
 * the browser happens to hold.
 */

export const apiURL = __API_URL__;

/** The request both preview and send use, so the two can never disagree
 * about who the audience is or what they receive. */
export type CampaignRequest = {
  template: string;
  customerIds?: string[];
  allCustomers?: boolean;
  productId?: string;
  variantIds?: string[];
  attachProductImage?: boolean;
  includePriceList?: boolean;
};

export type CampaignPreview = {
  total: number;
  willSend: number;
  willSkip: number;
  /** Skip reason (an English sentence that doubles as the i18n key) → count. */
  skipped: Record<string, number>;
  unknownPlaceholders: string[];
  hasImage: boolean;
  warnings: string[];
  estimatedMinutes: number;
  dailyRemaining: number;
  connected: boolean;
  /** Up to 20, sendable customers only, rendered exactly as they will go. */
  samples: Array<{ customerId: string; name: string; phone: string; text: string }>;
};

export type CampaignStatus =
  | "queued"
  | "sending"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type CampaignSummary = {
  id: string;
  createdAt: string;
  status: CampaignStatus;
  total: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  templatePreview: string;
  productName: string | null;
  hasImage: boolean;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdByName: string | null;
};

export type RecipientStatus = "pending" | "sent" | "failed" | "skipped";

export type CampaignDetail = CampaignSummary & {
  template: string;
  recipients: Array<{
    customerId: string;
    name: string;
    /** Masked by the server ("…3210"); the full number never leaves it. */
    phone: string;
    status: RecipientStatus;
    reason: string | null;
    sentAt: string | null;
  }>;
};

/** The runner is still working through the list — worth polling. */
export function isInFlight(status: CampaignStatus | undefined): boolean {
  return status === "queued" || status === "sending";
}

/** The DTO validates every id as a Mongo ObjectId and rejects the whole
 * body if one is not, so anything else is kept out of the request. */
export function isMongoId(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{24}$/i.test(id);
}

/**
 * `ref.current` is true exactly while the component is mounted, so an answer
 * that lands after the screen closed is dropped instead of setting state on
 * nothing. Set in the effect, not the initial value: StrictMode runs the
 * cleanup and the setup once more on mount, and the second setup must win.
 */
export function useMounted() {
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return mountedRef;
}

/** How often a list of campaigns is re-read while one of them is running —
 * it only needs to notice that campaign finishing. */
export const LIST_POLL_MS = 10000;

/**
 * Run `tick` every `everyMs` while `active`, the way the WhatsApp panel
 * polls: a hidden tab skips its ticks (nobody is looking) and catches up the
 * moment it is shown, and the interval dies with the component. Overlap is
 * the caller's job — every `load` that uses this refuses to start while one
 * is in flight, so a slow server does not collect a queue of reads.
 */
export function usePoll(active: boolean, everyMs: number, tick: () => void) {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (!document.hidden) tickRef.current();
    }, everyMs);
    const onVisible = () => {
      if (!document.hidden) tickRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, everyMs]);
}

export function authHeaders(json = false): Record<string, string> {
  // Read per request rather than once per render: the token can be replaced
  // (re-login in another tab) while the screen sits open.
  const token = sessionStorage.getItem("token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Sentences the campaign API builds with a number or a list inside, so they
 * cannot be dictionary keys as they stand. Each is matched and re-said
 * through a key with a `{placeholder}` instead.
 *
 * The unknown-placeholder error is the one to be careful with: its list is
 * literally `{{coupon}}`, and `t()` replaces `{key}` inside whatever it is
 * given — so only the fixed lead-in is translated and the list is appended
 * untouched, never passed through `t()`.
 */
const DYNAMIC_MESSAGES: Array<{
  pattern: RegExp;
  say: (m: RegExpMatchArray) => string;
}> = [
  {
    pattern: /^Your message uses unknown placeholders:\s*([\s\S]*)$/,
    say: (m) => `${i18nT("Your message uses unknown placeholders:")} ${m[1]}`,
  },
  {
    pattern: /^Daily limit reached \((\d+) messages\)\. Resume tomorrow\.$/,
    say: (m) =>
      i18nT("Daily limit reached ({count} messages). Resume tomorrow.", {
        count: m[1],
      }),
  },
  {
    pattern: /^A campaign can go to at most (\d+) customers\. Select fewer customers\.$/,
    say: (m) =>
      i18nT("A campaign can go to at most {count} customers. Select fewer customers.", {
        count: m[1],
      }),
  },
];

/** A sentence from the API in the shopkeeper's language when we know it.
 * The API's sentences are fixed English, so they double as i18n keys — an
 * unknown one falls through `t()` unchanged. */
export function apiText(message: string | null | undefined): string {
  const text = String(message ?? "").trim();
  if (!text) return "";
  for (const { pattern, say } of DYNAMIC_MESSAGES) {
    const m = text.match(pattern);
    if (m) return say(m);
  }
  return i18nT(text);
}

/**
 * The human sentence out of a Nest error body, translated when we know it.
 *
 * `message` is a string for the service's own errors but an array of strings
 * when the global ValidationPipe rejects the body, so both shapes are read.
 */
export function nestMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { message?: unknown }).message;
  const parts = (Array.isArray(raw) ? raw : [raw]).filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
  return parts.length ? parts.map((p) => apiText(p)).join(" · ") : null;
}

export function isPreview(body: unknown): body is CampaignPreview {
  if (!body || typeof body !== "object") return false;
  const b = body as Partial<CampaignPreview>;
  return typeof b.willSend === "number" && Array.isArray(b.samples);
}

export function isSummary(body: unknown): body is CampaignSummary {
  if (!body || typeof body !== "object") return false;
  const b = body as Partial<CampaignSummary>;
  return typeof b.id === "string" && typeof b.status === "string";
}

export function isDetail(body: unknown): body is CampaignDetail {
  return (
    isSummary(body) &&
    Array.isArray((body as Partial<CampaignDetail>).recipients)
  );
}

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  queued: "Queued",
  sending: "Sending",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
};

// Coloured badges carry an explicit dark pair: the light tints read as glare
// on the dark card, and the dark ones vanish on the light one.
const NEUTRAL = "border-border bg-muted text-muted-foreground";
const AMBER =
  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300";
const GREEN =
  "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300";
const RED =
  "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300";
const BLUE =
  "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300";

export const STATUS_CLASS: Record<CampaignStatus, string> = {
  queued: BLUE,
  sending: BLUE,
  paused: AMBER,
  completed: GREEN,
  cancelled: NEUTRAL,
  failed: RED,
};

export const BADGE_CLASS = { neutral: NEUTRAL, amber: AMBER, red: RED } as const;

/** A timestamp as the shopkeeper's browser writes dates. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
