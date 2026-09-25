import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CircleCheck,
  CircleX,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  SkipForward,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { t as i18nT } from "@/i18n/t";
import {
  apiText,
  apiURL,
  authHeaders,
  CampaignDetail,
  CampaignSummary,
  formatWhen,
  isDetail,
  isInFlight,
  isSummary,
  LIST_POLL_MS,
  nestMessage,
  RecipientStatus,
  STATUS_CLASS,
  STATUS_LABEL,
  useMounted,
  usePoll,
} from "./whatsappCampaignApi";

/** How often a running campaign is re-read. The runner sends one message
 * every 6–15 s, so three seconds shows each one land without hammering. */
const RUN_POLL_MS = 3000;

const RECIPIENT_LABEL: Record<RecipientStatus, string> = {
  pending: "Waiting",
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
};

function RecipientIcon({ status }: { status: RecipientStatus }) {
  switch (status) {
    case "sent":
      return <CircleCheck className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />;
    case "failed":
      return <CircleX className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: CampaignSummary["status"] }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status] ?? STATUS_CLASS.cancelled}>
      {i18nT(STATUS_LABEL[status] ?? status)}
    </Badge>
  );
}

/** "12 sent · 1 failed · 3 skipped", leaving out the zeros. */
function CountsLine({ c }: { c: CampaignSummary }) {
  const parts: string[] = [i18nT("{count} sent", { count: c.sentCount })];
  if (c.failedCount > 0) parts.push(i18nT("{count} failed", { count: c.failedCount }));
  if (c.skippedCount > 0) parts.push(i18nT("{count} skipped", { count: c.skippedCount }));
  if (c.pendingCount > 0) parts.push(i18nT("{count} waiting", { count: c.pendingCount }));
  return <>{parts.join(" · ")}</>;
}

/**
 * One campaign: its progress while it runs, and its record afterwards.
 *
 * The campaign runs on the server whether or not this is open — leaving the
 * screen only stops the polling — so everything here is a read of the
 * server's state plus two buttons, Stop and Resume. Stop takes effect after
 * the message being sent at that moment; the rest are marked skipped.
 */
export function CampaignRunView({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const mountedRef = useMounted();
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "resume" | null>(null);

  const loadingRef = useRef(false);
  const busyRef = useRef(false);
  /**
   * Bumped by Stop and Resume. A read already in flight when the button was
   * pressed answers for the world BEFORE it; applying it after the action's
   * own answer would flash "Sending" back up, and a stale `paused` would
   * even stop the polling that is about to show the resume working.
   */
  const epochRef = useRef(0);

  const load = useCallback(async () => {
    if (loadingRef.current || busyRef.current) return;
    loadingRef.current = true;
    const epoch = epochRef.current;
    try {
      const res = await fetch(
        `${apiURL}/campaigns/whatsapp/${encodeURIComponent(id)}`,
        { headers: authHeaders() },
      );
      const body = await res.json().catch(() => null);
      if (!mountedRef.current || epoch !== epochRef.current) return;
      if (res.ok && isDetail(body)) {
        setDetail(body);
        setUnavailable(null);
        return;
      }
      // A 404 or 403 will not fix itself on the next tick; anything else
      // (a blip, a restart) keeps what is on screen and tries again.
      setUnavailable(
        (current) =>
          nestMessage(body) ??
          current ??
          i18nT("This campaign could not be loaded. Try again in a moment."),
      );
    } catch {
      if (mountedRef.current) {
        setUnavailable(
          (current) =>
            current ??
            i18nT("This campaign could not be loaded. Try again in a moment."),
        );
      }
    } finally {
      loadingRef.current = false;
    }
  }, [id, mountedRef]);

  // The parent keys this view by campaign id, so `id` never changes under a
  // mounted instance and a late answer for one campaign cannot land on
  // another's screen.
  useEffect(() => {
    void load();
  }, [load]);

  usePoll(isInFlight(detail?.status), RUN_POLL_MS, () => void load());

  const act = async (action: "cancel" | "resume") => {
    if (busyRef.current) return;
    busyRef.current = true;
    epochRef.current += 1;
    setBusy(action);
    try {
      const res = await fetch(
        `${apiURL}/campaigns/whatsapp/${encodeURIComponent(id)}/${action}`,
        { method: "POST", headers: authHeaders() },
      );
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast({
          duration: 5000,
          variant: "destructive",
          title: i18nT("That did not work"),
          description: nestMessage(body) ?? i18nT("Please try again."),
        });
        return;
      }
      // The answer is a summary without the recipient rows; keep the rows
      // on screen and let the read below bring them up to date.
      const summary = isSummary(body) ? body : null;
      if (summary) setDetail((prev) => (prev ? { ...prev, ...summary } : prev));
      const status = summary?.status;
      if (action === "resume") {
        toast({ duration: 3000, title: i18nT("Campaign resumed") });
        return;
      }
      // The toast says what the returned status says, not just "200". A
      // message being sent at that moment is allowed to finish, so the
      // campaign can still read as sending; and one that comes back paused
      // (a runner pausing itself in the same instant) still has customers
      // waiting — "stopped" there would invite a Resume that messages them.
      if (status === "paused") {
        toast({
          duration: 6000,
          variant: "destructive",
          title: i18nT("The campaign did not stop"),
          description: i18nT("It is paused, with customers still waiting. Press Stop again."),
        });
        return;
      }
      toast({
        duration: 3000,
        title: isInFlight(status)
          ? i18nT("Stopping after the current message")
          : status === "completed"
            ? i18nT("This campaign had already finished.")
            : i18nT("Campaign stopped"),
      });
    } catch {
      if (mountedRef.current) {
        toast({
          duration: 5000,
          variant: "destructive",
          title: i18nT("That did not work"),
          description: i18nT(
            "Could not reach the server. Check your internet connection and try again.",
          ),
        });
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) {
        setBusy(null);
        void load();
      }
    }
  };

  const back = (
    <Button variant="outline" size="sm" onClick={onBack} className="self-start">
      <ArrowLeft className="h-4 w-4" />
      {i18nT("All campaigns")}
    </Button>
  );

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        {unavailable ? (
          <div className="flex flex-col items-start gap-3" role="status">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {unavailable}
            </p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              {i18nT("Try Again")}
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {i18nT("Loading campaign…")}
          </p>
        )}
      </div>
    );
  }

  const done = detail.sentCount + detail.failedCount + detail.skippedCount;
  const percent = detail.total > 0 ? Math.round((done / detail.total) * 100) : 0;
  const running = isInFlight(detail.status);
  const paused = detail.status === "paused";

  return (
    <div className="flex flex-col gap-5">
      {back}

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.status} />
          <span className="text-sm text-muted-foreground">
            {formatWhen(detail.startedAt || detail.createdAt)}
            {detail.createdByName
              ? ` · ${i18nT("by {name}", { name: detail.createdByName })}`
              : ""}
          </span>
          {running && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          )}
        </div>

        <div className="space-y-1.5">
          <Progress
            value={percent}
            className="h-2.5"
            aria-label={i18nT("Campaign progress")}
          />
          <p className="text-sm text-foreground" aria-live="polite">
            {i18nT("{done} of {total} done", { done, total: detail.total })}
            <span className="text-muted-foreground">
              {" "}
              · <CountsLine c={detail} />
            </span>
          </p>
        </div>

        {detail.lastError && (
          <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {apiText(detail.lastError)}
          </p>
        )}

        {(running || paused) && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Stop is offered while paused too: a shop that decides against
                the rest must be able to close the campaign without resuming
                it first — which would send at least one more message, and
                after a daily-limit pause could never get as far as Stop. */}
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              disabled={busy !== null}
              onClick={() => void act("cancel")}
            >
              {busy === "cancel" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {i18nT("Stop")}
            </Button>
            {paused && (
              <Button
                variant="buttonOutline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void act("resume")}
              >
                {busy === "resume" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {i18nT("Resume")}
              </Button>
            )}
            {running ? (
              <span className="text-xs text-muted-foreground">
                {i18nT(
                  "Sending continues if you leave this screen. Stop takes effect after the current message.",
                )}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {i18nT(
                  "Resume sends to the customers still waiting. Stop skips them and closes the campaign.",
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {detail.template && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{i18nT("Message")}</p>
          {/* The template as written, placeholders and all — each customer's
              own version is what they received, shown nowhere else. */}
          <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
            {detail.template}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          {i18nT("Customers ({count})", { count: detail.recipients.length })}
        </p>
        <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
          {detail.recipients.map((r, i) => (
            <li
              key={`${r.customerId}-${i}`}
              className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <RecipientIcon status={r.status} />
                <span className="truncate font-medium text-foreground">
                  {r.name || i18nT("Customer")}
                </span>
                {r.phone && (
                  <span className="shrink-0 text-xs text-muted-foreground">{r.phone}</span>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 pl-6 text-xs text-muted-foreground sm:pl-0 sm:text-right">
                <span
                  className={
                    r.status === "failed"
                      ? "text-red-600 dark:text-red-400"
                      : r.status === "sent"
                        ? "text-green-700 dark:text-green-400"
                        : ""
                  }
                >
                  {i18nT(RECIPIENT_LABEL[r.status] ?? r.status)}
                </span>
                {r.reason && <span className="break-words">· {apiText(r.reason)}</span>}
                {r.status === "sent" && r.sentAt && (
                  <span>· {formatWhen(r.sentAt)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Every campaign this shop has sent, newest first; a click opens one. */
export function CampaignHistory({ onOpen }: { onOpen: (id: string) => void }) {
  const mountedRef = useMounted();
  const [rows, setRows] = useState<CampaignSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch(`${apiURL}/campaigns/whatsapp`, {
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (res.ok && Array.isArray(body)) {
        setRows(body.filter(isSummary));
        setUnavailable(null);
        return;
      }
      setUnavailable(
        (current) =>
          nestMessage(body) ??
          current ??
          i18nT("Campaigns could not be loaded. Try again in a moment."),
      );
    } catch {
      if (mountedRef.current) {
        setUnavailable(
          (current) =>
            current ?? i18nT("Campaigns could not be loaded. Try again in a moment."),
        );
      }
    } finally {
      loadingRef.current = false;
    }
  }, [mountedRef]);

  useEffect(() => {
    void load();
  }, [load]);

  usePoll((rows ?? []).some((r) => isInFlight(r.status)), LIST_POLL_MS, () => void load());

  if (!rows) {
    return unavailable ? (
      <div className="flex flex-col items-start gap-3 py-4" role="status">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {unavailable}
        </p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          {i18nT("Try Again")}
        </Button>
      </div>
    ) : (
      <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {i18nT("Loading campaigns…")}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {i18nT("No campaigns yet. Your sent campaigns will appear here.")}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            className="flex w-full flex-col gap-2 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate text-sm font-medium text-foreground">
                {c.templatePreview || i18nT("(no message)")}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatWhen(c.createdAt)}
                {c.productName ? ` · ${c.productName}` : ""}
                {c.createdByName ? ` · ${c.createdByName}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                <CountsLine c={c} />
                {" · "}
                {i18nT("{count} customers", { count: c.total })}
              </p>
            </div>
            <StatusBadge status={c.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
