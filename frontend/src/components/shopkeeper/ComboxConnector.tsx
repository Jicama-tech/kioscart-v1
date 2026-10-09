import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { t as i18nT } from "@/i18n/t";

const apiURL = __API_URL__;

type KeyStatus =
  | { active: false }
  | {
      active: true;
      prefix: string;
      createdAt?: string | null;
      lastUsedAt?: string | null;
    };

function authHeaders(): Record<string, string> {
  // Read per request: the token can be replaced by a re-login in another tab.
  const token = sessionStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

/** Human sentence out of a Nest error body (string or ValidationPipe array). */
function nestMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { message?: unknown }).message;
  const parts = (Array.isArray(raw) ? raw : [raw]).filter(
    (p): p is string => typeof p === "string" && p.trim() !== "",
  );
  return parts.length ? parts.map((p) => i18nT(p)).join(" · ") : null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Settings › ComBox. Owner-only: the API answers 403 to operator tokens, so the
 * parent does not render this tab for them, and a 403 here still shows the
 * server's sentence.
 */
export function ComboxConnector() {
  const { toast } = useToast();
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "revoke" | null>(null);
  const [confirm, setConfirm] = useState<"regenerate" | "revoke" | null>(null);
  /** The plaintext key, held only until the owner leaves or dismisses it. */
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<"key" | "url" | null>(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiURL}/integration/api-key`, {
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (!res.ok || !body || typeof body.active !== "boolean") {
        setUnavailable(
          (res.status === 403 ? nestMessage(body) : null) ??
            i18nT("ComBox connector could not be reached. Try again in a moment."),
        );
        return;
      }
      setUnavailable(null);
      setStatus(body as KeyStatus);
    } catch {
      if (mountedRef.current) {
        setUnavailable(
          i18nT("ComBox connector could not be reached. Try again in a moment."),
        );
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "generate" | "revoke") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    try {
      const res = await fetch(`${apiURL}/integration/api-key`, {
        method: action === "generate" ? "POST" : "DELETE",
        headers: authHeaders(),
      });
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
      if (action === "generate") {
        if (body && typeof body.apiKey === "string") {
          setNewKey(body.apiKey);
          setCopied(null);
        }
      } else {
        setNewKey(null);
        toast({ duration: 3000, title: i18nT("ComBox key revoked") });
      }
      await load();
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
      if (mountedRef.current) setBusy(null);
    }
  };

  const copy = async (what: "key" | "url", text: string) => {
    const ok = await copyText(text);
    if (!mountedRef.current) return;
    if (ok) {
      setCopied(what);
      window.setTimeout(() => {
        if (mountedRef.current) setCopied((c) => (c === what ? null : c));
      }, 2000);
    } else {
      toast({
        duration: 4000,
        variant: "destructive",
        title: i18nT("Could not copy"),
        description: i18nT("Select the text and copy it manually."),
      });
    }
  };

  const header = (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Plug className="h-5 w-5" />
        {i18nT("ComBox connector")}
      </CardTitle>
      <CardDescription>
        {i18nT(
          "Link this shop to ComBox so you can manage your products and orders from ComBox.",
        )}
      </CardDescription>
    </CardHeader>
  );

  if (!status) {
    return (
      <Card>
        {header}
        <CardContent>
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
              {i18nT("Loading ComBox connector…")}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const lastUsed = status.active ? formatDate(status.lastUsedAt) : null;
  const created = status.active ? formatDate(status.createdAt) : null;

  return (
    <Card>
      {header}
      <CardContent className="space-y-6">
        <div className="space-y-1">
          <Label htmlFor="combox-api-url">{i18nT("API base URL")}</Label>
          <div className="flex gap-2">
            <Input
              id="combox-api-url"
              readOnly
              value={apiURL}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={i18nT("Copy")}
              onClick={() => void copy("url", apiURL)}
            >
              {copied === "url" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {i18nT("Paste this and the API key below into ComBox.")}
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label>{i18nT("API key")}</Label>
            <Badge
              variant="outline"
              className={
                status.active
                  ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                  : "border-border bg-muted text-muted-foreground"
              }
            >
              {status.active ? i18nT("Active") : i18nT("No key")}
            </Badge>
          </div>

          {status.active && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                {i18nT("Key starts with")}{" "}
                <span className="font-mono text-foreground">
                  {status.prefix}…
                </span>
              </p>
              <p>
                {lastUsed
                  ? i18nT("Last used {date}", { date: lastUsed })
                  : i18nT("Not used yet")}
                {created && ` · ${i18nT("Created {date}", { date: created })}`}
              </p>
            </div>
          )}

          {newKey && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <p className="flex items-start gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {i18nT(
                  "Copy this key now — it won't be shown again. If you lose it, generate a new one.",
                )}
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  aria-label={i18nT("API key")}
                  value={newKey}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  variant="buttonOutline"
                  onClick={() => void copy("key", newKey)}
                >
                  {copied === "key" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied === "key" ? i18nT("Copied") : i18nT("Copy")}
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setNewKey(null)}>
                {i18nT("I've saved it")}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="buttonOutline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                status.active ? setConfirm("regenerate") : void act("generate")
              }
            >
              {busy === "generate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : status.active ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {status.active ? i18nT("Regenerate key") : i18nT("Generate key")}
            </Button>
            {status.active && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                disabled={busy !== null}
                onClick={() => setConfirm("revoke")}
              >
                {busy === "revoke" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {i18nT("Revoke")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "revoke"
                ? i18nT("Revoke this key?")
                : i18nT("Regenerate the key?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "revoke"
                ? i18nT(
                    "ComBox loses access to this shop immediately. You can generate a new key later.",
                  )
                : i18nT(
                    "The current key stops working immediately, so the existing ComBox connection breaks until you paste the new key into ComBox.",
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{i18nT("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              onClick={() => {
                const which = confirm;
                setConfirm(null);
                if (which) void act(which === "revoke" ? "revoke" : "generate");
              }}
            >
              {confirm === "revoke" ? i18nT("Revoke") : i18nT("Regenerate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
