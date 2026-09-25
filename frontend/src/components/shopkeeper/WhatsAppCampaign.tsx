import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { jwtDecode } from "jwt-decode";
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useFeatureState } from "@/hooks/useFeature";
import { t as i18nT } from "@/i18n/t";
import {
  buildPriceList,
  campaignName,
  composeMessage,
  effectivePrice,
  firstNameOf,
  formatCampaignPrice,
  KNOWN_PLACEHOLDERS,
  validate,
  variantLabel,
  waDigits,
  type CampaignVars,
} from "@/lib/campaignTemplate";
import {
  apiText,
  apiURL,
  authHeaders,
  BADGE_CLASS,
  CampaignPreview,
  CampaignRequest,
  CampaignSummary,
  isInFlight,
  isMongoId,
  isPreview,
  isSummary,
  LIST_POLL_MS,
  nestMessage,
  useMounted,
  usePoll,
} from "./whatsappCampaignApi";
import { CampaignHistory, CampaignRunView } from "./WhatsAppCampaignRun";

/** The campaign DTO's limits (spec §5), so the browser stops the typing
 * instead of the API answering with a class-validator sentence. */
const TEMPLATE_MAX = 3000;
const MAX_CUSTOMER_IDS = 1000;
const MAX_VARIANT_IDS = 100;
const MAX_VARIANT_ID_LENGTH = 64;
/** The most a single campaign may send (the service's MAX_SENDABLE). The
 * preview says so as a warning; Send is held back here to match. */
const MAX_SENDABLE = 1000;
/** WhatsApp's caption limit when the product photo goes with the text. */
const CAPTION_MAX = 1024;
/** Long enough that a preview is not fired per keystroke, short enough that
 * it has usually landed by the time the shopkeeper looks across. */
const PREVIEW_DEBOUNCE_MS = 800;

/** Radix Select cannot hold an empty value, so "no product" needs a name. */
const NO_PRODUCT = "none";
/** What a kiosk order stores as the customer's number. */
const KIOSK_NUMBER = "kiosk-order";
/**
 * The CRM list writes "Unknown" for a customer created without a name
 * (transformUsersAPIData). It is the CRM's stand-in, not the customer's name,
 * so it must not reach "Hello Unknown" — the template's fallback is kinder.
 */
const CRM_NO_NAME = "Unknown";

/** The slice of a CRM customer a campaign needs. */
export type CampaignCustomer = {
  id: string;
  name: string;
  email?: string;
  whatsapp?: string;
};

/** Why a row cannot be ticked. English, and the i18n key. */
type Block = "Opted out" | "No WhatsApp" | "Kiosk walk-in";

type AudienceRow = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  block: Block | null;
};

type ApiVariant = {
  id: number | string;
  title: string;
  price: number;
  isDiscounted?: boolean;
  discountedPrice?: number;
};

/** The fields of GET /products/shopkeeper-products this screen reads. */
type ApiProduct = {
  _id: string;
  name: string;
  price: number;
  isDiscounted?: boolean;
  discountedPrice?: number;
  status?: string;
  images?: string[];
  subcategories?: Array<{
    id: number | string;
    name: string;
    variants?: ApiVariant[];
  }>;
};

type FlatVariant = {
  key: string;
  label: string;
  price: number;
};

/**
 * A product's variants as one list, and whether each can be ticked on its
 * own. Ticking works by variant id — that is what the server's price list
 * filters on — so it needs every variant to carry an id no other variant
 * shares. Product rows written outside the dashboard can lack ids (the
 * schema does not enforce them): keyed by `String(undefined)`, four such
 * variants shared one checkbox, and no subset could ever be chosen. Those
 * products list every variant instead, which is what the server does when
 * no ids are sent; the keys then fall back to positions, only so React can
 * tell the rows apart.
 */
function flattenVariants(product: ApiProduct | null | undefined): {
  variants: FlatVariant[];
  pickable: boolean;
} {
  const list = (product?.subcategories ?? []).flatMap((sub, si) =>
    (sub?.variants ?? []).map((v, vi) => ({
      // As the server compares it: String(id), untrimmed.
      id: v?.id == null ? "" : String(v.id),
      position: `@${si}.${vi}`,
      // Labelled exactly as the price-list line will be.
      label: variantLabel(sub?.name, v?.title, product?.name ?? ""),
      price: effectivePrice(v),
    })),
  );
  const ids = list.map((v) => v.id);
  // Over MAX_VARIANT_ID_LENGTH the DTO would refuse the whole request, so
  // such an id cannot be named either — list everything instead.
  const pickable =
    ids.every((id) => id !== "" && id.length <= MAX_VARIANT_ID_LENGTH) &&
    new Set(ids).size === ids.length;
  return {
    variants: list.map((v) => ({
      key: pickable ? v.id : v.position,
      label: v.label,
      price: v.price,
    })),
    pickable,
  };
}

/** The shop's country and name, from the login token the dashboard holds. */
function readShop(): { country?: string; shopName?: string } {
  try {
    const token = sessionStorage.getItem("token");
    if (!token) return {};
    const decoded = jwtDecode<{ country?: string; shopName?: string }>(token);
    return { country: decoded?.country, shopName: decoded?.shopName };
  } catch {
    return {};
  }
}

/**
 * The dashboard scrolls inside its <main>, not the window, so "the top" is
 * the top of the nearest ancestor that scrolls — the window only when none
 * does.
 */
function scrollToTop(el: HTMLElement | null) {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      node.scrollTop = 0;
      return;
    }
  }
  window.scrollTo(0, 0);
}

/**
 * CRM › WhatsApp Campaign.
 *
 * Replaces the old Product Marketing dialog, whose Send button only waited
 * two seconds and toasted "Messages Sent". A campaign now really goes out:
 * from the shop's linked WhatsApp, one personalised message per customer,
 * paced by the server.
 *
 * A screen of its own, not a dialog: the CRM renders it in place of the
 * customer list (its early return, like Add Customer) and Back returns to
 * the list. Only the send confirmation is a dialog. The campaign runs on the
 * server, so leaving this screen mid-send only stops the polling; it is
 * under History on the way back.
 *
 * Three views share the screen: New campaign and History as tabs, and one
 * campaign's progress on top of both. The composer stays mounted (hidden)
 * while another view is up, so a half-written message survives a look at the
 * history.
 */
export function WhatsAppCampaignScreen({
  onBack,
  customers,
}: {
  onBack: () => void;
  customers: CampaignCustomer[];
}) {
  const [tab, setTab] = useState<"new" | "history">("new");
  const [runId, setRunId] = useState<string | null>(null);
  const [composerVisits, setComposerVisits] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Opened from the CRM list, possibly scrolled down to reach the button,
  // and switching between the composer and a campaign's progress swaps
  // long content for short: each starts at its top rather than wherever the
  // previous view left the page.
  useLayoutEffect(() => {
    scrollToTop(rootRef.current);
  }, [runId]);

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="w-full sm:w-auto self-start"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> {i18nT("Back to Customers")}
        </Button>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FaWhatsapp className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
            {i18nT("WhatsApp Campaign")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {i18nT(
              "Send a personalised message to the customers you choose, from your shop's own WhatsApp.",
            )}
          </p>
        </div>
      </div>

      <Card className="w-full">
        <CardContent className="p-4 pt-6 sm:p-6">
          <div className={runId ? "hidden" : undefined}>
            <Tabs
              value={tab}
              onValueChange={(v) => {
                const next = v === "history" ? "history" : "new";
                if (next === "new") setComposerVisits((n) => n + 1);
                setTab(next);
              }}
            >
              <TabsList className="grid w-full grid-cols-2 sm:inline-grid sm:w-auto">
                <TabsTrigger value="new">{i18nT("New campaign")}</TabsTrigger>
                <TabsTrigger value="history">{i18nT("History")}</TabsTrigger>
              </TabsList>
              <TabsContent value="new" forceMount className="mt-4 data-[state=inactive]:hidden">
                <CampaignComposer
                  customers={customers}
                  onOpenRun={setRunId}
                  refreshKey={composerVisits}
                  onScreen={tab === "new" && !runId}
                />
              </TabsContent>
              <TabsContent value="history" className="mt-4">
                {/* Unmounted while a campaign is open, so the list is read
                    fresh — with that campaign's final counts — on the way back. */}
                {!runId && <CampaignHistory onOpen={setRunId} />}
              </TabsContent>
            </Tabs>
          </div>

          {runId && (
            <CampaignRunView
              key={runId}
              id={runId}
              onBack={() => {
                setRunId(null);
                setTab("history");
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The New campaign tab: who, what, a preview of exactly what they get, and
 * Send.
 *
 * The preview is the server's, not a guess made here. It renders each sample
 * with the customer's real name and the same spintax choice the send will
 * make, and it is where the skip reasons, the time estimate and the daily
 * allowance come from. Send is only offered for the preview on screen: any
 * edit makes it stale, and a stale preview cannot be sent.
 */
function CampaignComposer({
  customers,
  onOpenRun,
  refreshKey,
  onScreen,
}: {
  customers: CampaignCustomer[];
  onOpenRun: (id: string) => void;
  /** Bumped each time the shop comes back to this tab. */
  refreshKey: number;
  /** This tab is the view on screen (it stays mounted when it is not). */
  onScreen: boolean;
}) {
  const { toast } = useToast();
  const mountedRef = useMounted();
  // The add-on that sends from the shop's own number. Without it, or without
  // a linked phone, the screen still personalises and previews — sending
  // falls back to one wa.me chat per customer, from the shopkeeper's phone.
  const { enabled: waPlan, loading: planLoading } = useFeatureState("whatsappConnect");
  const shop = useMemo(readShop, []);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [template, setTemplate] = useState("");
  const [products, setProducts] = useState<ApiProduct[] | null>(null);
  const [productId, setProductId] = useState(NO_PRODUCT);
  const [attachPhoto, setAttachPhoto] = useState(false);
  const [withPriceList, setWithPriceList] = useState(false);
  const [variantKeys, setVariantKeys] = useState<Set<string>>(() => new Set());
  const [optedOut, setOptedOut] = useState<Set<string>>(() => new Set());
  /** null = not known yet. Seeded by /whatsapp/status, then kept current by
   * every preview (which answers `connected` too). */
  const [connected, setConnected] = useState<boolean | null>(null);
  const [active, setActive] = useState<CampaignSummary | null>(null);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);

  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  /** The request `preview` answers, so an edited form reads as stale. */
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sampleIndex, setSampleIndex] = useState(0);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const startingRef = useRef(false);
  /** Bumped per preview request; only the newest answer is applied. */
  const previewSeqRef = useRef(0);
  const previewAbortRef = useRef<AbortController | null>(null);
  const slugRequestedRef = useRef(false);

  // ---- one-off reads ----------------------------------------------------

  useEffect(() => {
    // Each read is independent and fails quietly: without products there is
    // no picker, without opt-outs the server still skips those customers,
    // and without the list there is simply no "already sending" banner.
    const getJson = async (path: string) => {
      const res = await fetch(`${apiURL}${path}`, { headers: authHeaders() });
      return { ok: res.ok, body: await res.json().catch(() => null) };
    };

    void getJson("/products/shopkeeper-products")
      .then(({ ok, body }) => {
        if (!mountedRef.current) return;
        const list: ApiProduct[] = ok && Array.isArray(body?.data) ? body.data : [];
        // A draft is not for sale yet, so it is not offered as the subject
        // of a campaign.
        setProducts(list.filter((p) => p && isMongoId(String(p._id)) && p.status !== "draft"));
      })
      .catch(() => mountedRef.current && setProducts([]));

    void getJson("/campaigns/whatsapp/opt-outs")
      .then(({ ok, body }) => {
        if (!mountedRef.current || !ok || !Array.isArray(body?.customerIds)) return;
        setOptedOut(new Set(body.customerIds.map(String)));
      })
      .catch(() => undefined);

    return () => {
      previewAbortRef.current?.abort();
    };
  }, [mountedRef]);

  /**
   * The "a campaign is sending / paused" banner. Re-read whenever the shop
   * comes back to this tab (`refreshKey`) and, while that campaign is still
   * running, every few seconds — this tab stays mounted behind the others,
   * so a one-off read would go on announcing a campaign that finished long
   * ago.
   */
  const activeLoadingRef = useRef(false);
  const loadActive = useCallback(async () => {
    if (activeLoadingRef.current) return;
    activeLoadingRef.current = true;
    try {
      const res = await fetch(`${apiURL}/campaigns/whatsapp`, { headers: authHeaders() });
      const body = await res.json().catch(() => null);
      if (!mountedRef.current || !res.ok || !Array.isArray(body)) return;
      // Newest first; the first unfinished one is the one to point at.
      const current = body
        .filter(isSummary)
        .find((c) => isInFlight(c.status) || c.status === "paused");
      setActive(current ?? null);
    } catch {
      // Only a courtesy banner; the server refuses a second campaign anyway.
    } finally {
      activeLoadingRef.current = false;
    }
  }, [mountedRef]);

  useEffect(() => {
    void loadActive();
  }, [loadActive, refreshKey]);

  // Only while this tab is the one on screen: behind the progress view or
  // the history list, those views are polling already.
  usePoll(onScreen && isInFlight(active?.status), LIST_POLL_MS, () => void loadActive());

  // The link status, once the plan is known to include the add-on. An
  // operator without the WhatsApp tab gets a 403 here; the preview's own
  // `connected` answers for them instead.
  const planKnownOn = !planLoading && waPlan;
  useEffect(() => {
    if (!planKnownOn) return;
    fetch(`${apiURL}/whatsapp/status`, { headers: authHeaders() })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!mountedRef.current || !res.ok || typeof body?.status !== "string") return;
        // Only fills the gap: a preview that already answered is newer.
        setConnected((current) => current ?? body.status === "connected");
      })
      .catch(() => undefined);
  }, [planKnownOn, mountedRef]);

  const manualMode = (!planLoading && !waPlan) || connected === false;

  // `{{store_link}}` in a hand-sent message needs the storefront's slug —
  // read only when this shop actually sends by hand.
  useEffect(() => {
    if (!manualMode || slugRequestedRef.current) return;
    slugRequestedRef.current = true;
    fetch(`${apiURL}/shopkeeper-stores/shopkeeper-store-detail`, {
      headers: authHeaders(),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        const slug = body?.data?.slug;
        if (mountedRef.current && res.ok && typeof slug === "string" && slug) {
          setStoreSlug(slug);
        }
      })
      .catch(() => undefined);
  }, [manualMode, mountedRef]);

  // ---- audience -----------------------------------------------------------

  const rows = useMemo<AudienceRow[]>(() => {
    const seen = new Set<string>();
    const out: AudienceRow[] = [];
    for (const c of customers) {
      // The DTO rejects the whole request over one id that is not an
      // ObjectId, and the server could not find such a customer anyway.
      if (!isMongoId(c?.id) || seen.has(c.id)) continue;
      seen.add(c.id);
      const whatsapp = String(c.whatsapp ?? "").trim();
      const block: Block | null = optedOut.has(c.id)
        ? "Opted out"
        : !whatsapp
          ? "No WhatsApp"
          : whatsapp.toLowerCase() === KIOSK_NUMBER
            ? "Kiosk walk-in"
            : null;
      out.push({
        id: c.id,
        name: String(c.name ?? ""),
        email: String(c.email ?? ""),
        whatsapp,
        block,
      });
    }
    return out;
  }, [customers, optedOut]);

  const selectableIds = useMemo(
    () => rows.filter((r) => !r.block).map((r) => r.id),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    const digits = q.replace(/\D/g, "");
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (digits !== "" && r.whatsapp.replace(/\D/g, "").includes(digits)),
    );
  }, [rows, search]);

  // A customer who opted out after being ticked drops out here, not in the
  // request — the tick is kept so it comes back if they opt in again.
  const chosenIds = useMemo(
    () => selectableIds.filter((id) => selected.has(id)),
    [selectableIds, selected],
  );
  const everyone = chosenIds.length > 0 && chosenIds.length === selectableIds.length;

  const toggleCustomer = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /**
   * Select all / none, over the rows the search shows. "All" stops at what
   * one campaign can name: on a shop with 1,200 customers, ticking every row
   * made a selection the server refuses as too many, with no way out but
   * unticking 200 by hand. Stopping at 1000 leaves a campaign that can be
   * sent, and the ones left over can be ticked for the next.
   */
  const selectVisible = (on: boolean) => {
    const next = new Set(selected);
    let room = MAX_CUSTOMER_IDS - chosenIds.length;
    let left = 0;
    for (const r of visible) {
      if (r.block) continue;
      if (!on) next.delete(r.id);
      else if (next.has(r.id)) continue;
      else if (room > 0) {
        next.add(r.id);
        room -= 1;
      } else left += 1;
    }
    setSelected(next);
    if (left > 0) {
      toast({
        duration: 6000,
        title: i18nT("Up to {count} customers per campaign", { count: MAX_CUSTOMER_IDS }),
        description: i18nT(
          "{count} more were not selected. Send this campaign, then select them for the next one.",
          { count: left },
        ),
      });
    }
  };

  // ---- product --------------------------------------------------------------

  const product = useMemo(
    () => products?.find((p) => String(p._id) === productId) ?? null,
    [products, productId],
  );
  const photoPath = product?.images?.[0] || null;

  const { variants, pickable } = useMemo(() => flattenVariants(product), [product]);

  const chooseProduct = (id: string) => {
    setProductId(id);
    const next = products?.find((p) => String(p._id) === id);
    // A new product starts with every variant ticked — the common case is
    // "list them all" — and the photo left off until asked for.
    setVariantKeys(new Set(flattenVariants(next).variants.map((v) => v.key)));
    setAttachPhoto(false);
    setWithPriceList(false);
  };

  const toggleVariant = (key: string, on: boolean) =>
    setVariantKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  // A product without variants still has a price list: its own price on the
  // name line. Variants, when there are any, are ticked individually — or,
  // when they cannot be told apart by id, all listed.
  const listOn = !!product && withPriceList;
  const listKeys = useMemo(
    () =>
      listOn
        ? variants.filter((v) => !pickable || variantKeys.has(v.key)).map((v) => v.key)
        : [],
    [listOn, variants, pickable, variantKeys],
  );
  // Only ids go to the server: the positional keys of an unpickable product
  // mean nothing there, and sending none is what lists every variant.
  const someVariants = listOn && pickable && listKeys.length < variants.length;

  // ---- the request ------------------------------------------------------------

  /** Why the price list cannot be built as ticked. */
  const variantProblem: string | null =
    listOn && variants.length > 0 && listKeys.length === 0
      ? i18nT("Select at least one variant")
      : someVariants && listKeys.length > MAX_VARIANT_IDS
        ? i18nT("Choose up to {count} variants, or all of them.", {
            count: MAX_VARIANT_IDS,
          })
        : null;

  /** Why the form cannot be previewed yet, when it is not simply empty. Not
   * "or select all of them": past 1000 customers, all of them is exactly
   * what the server refuses as too many. */
  const problem: string | null =
    chosenIds.length > MAX_CUSTOMER_IDS && !everyone
      ? i18nT("Choose up to {count} customers per campaign.", {
          count: MAX_CUSTOMER_IDS,
        })
      : variantProblem;

  const body = useMemo<CampaignRequest | null>(() => {
    if (!template.trim() || chosenIds.length === 0 || problem) return null;
    const req: CampaignRequest = { template };
    // The ticked ids by name whenever the DTO's 1000-id cap allows. The
    // `allCustomers` flag makes the server re-read the shop's whole customer
    // base at send time, which can include customers this list (loaded when
    // the CRM opened) never showed — so "every row is ticked", or ticking
    // the only tickable row, must not widen into that. The flag is kept for
    // the one selection a list cannot carry: more than 1000.
    if (everyone && chosenIds.length > MAX_CUSTOMER_IDS) req.allCustomers = true;
    else req.customerIds = chosenIds;
    if (product) {
      req.productId = String(product._id);
      req.attachProductImage = attachPhoto && !!photoPath;
      req.includePriceList = listOn;
      // No ids means "every variant" to the server, which also keeps a
      // product with more than 100 variants sendable.
      if (someVariants) req.variantIds = listKeys;
    }
    return req;
  }, [template, chosenIds, everyone, problem, product, attachPhoto, photoPath, listOn, listKeys, someVariants]);

  const bodyKey = body ? JSON.stringify(body) : null;

  // ---- preview ------------------------------------------------------------------

  const runPreview = useCallback(
    async (req: CampaignRequest, key: string) => {
      // Only the newest request counts: an older one still in flight is
      // aborted, and if its answer races in anyway the sequence drops it.
      previewAbortRef.current?.abort();
      const controller = new AbortController();
      previewAbortRef.current = controller;
      const seq = ++previewSeqRef.current;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await fetch(`${apiURL}/campaigns/whatsapp/preview`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify(req),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!mountedRef.current || seq !== previewSeqRef.current) return;
        if (res.ok && isPreview(data)) {
          setPreview(data);
          setPreviewKey(key);
          setSampleIndex(0);
          setConnected(data.connected === true);
        } else {
          setPreview(null);
          setPreviewKey(null);
          setPreviewError(
            nestMessage(data) ??
              i18nT("The preview could not be loaded. Try again in a moment."),
          );
        }
      } catch {
        if (controller.signal.aborted) return;
        if (!mountedRef.current || seq !== previewSeqRef.current) return;
        setPreviewError(
          i18nT("Could not reach the server. Check your internet connection and try again."),
        );
      } finally {
        if (mountedRef.current && seq === previewSeqRef.current) {
          setPreviewLoading(false);
        }
      }
    },
    [mountedRef],
  );

  // Debounced: the preview follows the form ~800 ms after the last edit.
  const bodyRef = useRef(body);
  bodyRef.current = body;
  useEffect(() => {
    if (!bodyKey) {
      // Nothing to preview: drop whatever is in flight so it cannot land.
      previewAbortRef.current?.abort();
      previewSeqRef.current += 1;
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }
    const id = window.setTimeout(() => {
      if (bodyRef.current) void runPreview(bodyRef.current, bodyKey);
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [bodyKey, runPreview]);

  const fresh = !!preview && previewKey === bodyKey && !previewLoading;
  const unknownHere = useMemo(() => validate(template).unknown, [template]);
  const unknown = useMemo(() => {
    const all = [...unknownHere];
    if (fresh) {
      for (const k of preview?.unknownPlaceholders ?? []) {
        if (!all.includes(k)) all.push(k);
      }
    }
    return all;
  }, [unknownHere, fresh, preview]);

  const samples = preview?.samples ?? [];
  const sample = samples[Math.min(sampleIndex, Math.max(0, samples.length - 1))] ?? null;

  const canSend =
    !manualMode &&
    connected === true &&
    fresh &&
    (preview?.willSend ?? 0) > 0 &&
    (preview?.willSend ?? 0) <= MAX_SENDABLE &&
    unknown.length === 0 &&
    !starting;

  // ---- send -----------------------------------------------------------------------

  const start = async () => {
    const req = body;
    const key = bodyKey;
    if (!req || !key || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const res = await fetch(`${apiURL}/campaigns/whatsapp`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(req),
      });
      const data = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (res.ok && isSummary(data)) {
        toast({ duration: 3000, title: i18nT("Campaign started") });
        // Unticked so the same people are not sent the same thing twice by
        // a second click; the message stays for the next campaign.
        setSelected(new Set());
        setPreview(null);
        setPreviewKey(null);
        setActive(isInFlight(data.status) ? data : null);
        onOpenRun(data.id);
        return;
      }
      toast({
        duration: 6000,
        variant: "destructive",
        title: i18nT("Campaign not started"),
        description: nestMessage(data) ?? i18nT("Please try again."),
      });
      // The usual causes — the phone dropped, a campaign already running,
      // today's allowance used up — all show in a fresh preview.
      void runPreview(req, key);
    } catch {
      if (mountedRef.current) {
        toast({
          duration: 5000,
          variant: "destructive",
          title: i18nT("Campaign not started"),
          description: i18nT(
            "Could not reach the server. Check your internet connection and try again.",
          ),
        });
      }
    } finally {
      startingRef.current = false;
      if (mountedRef.current) {
        setStarting(false);
        setConfirmOpen(false);
      }
    }
  };

  // ---- hand-sent fallback -----------------------------------------------------

  /**
   * The same text the server would send, rendered here for one customer, as a
   * wa.me link. The name goes through the same rules as the server's, from
   * the name the CRM holds (the server would prefer the name on the latest
   * order, which this list does not carry).
   */
  const handVars = useMemo<CampaignVars>(
    () => ({
      shop_name: shop.shopName ?? "",
      product: product?.name ?? "",
      price: product ? formatCampaignPrice(effectivePrice(product), shop.country) : "",
      store_link: storeSlug ? `${window.location.origin}/${storeSlug}` : "",
    }),
    [shop, product, storeSlug],
  );
  const handPriceList = useMemo(
    () =>
      product && listOn
        ? buildPriceList(product, someVariants ? listKeys : undefined, shop.country)
        : null,
    [product, listOn, someVariants, listKeys, shop.country],
  );
  // A wa.me link is one customer's message, so how many rows are ticked has
  // no bearing on it — only whether the message itself can be written.
  const handReady =
    manualMode && template.trim() !== "" && unknownHere.length === 0 && !variantProblem;

  const waLink = (row: AudienceRow): string | null => {
    if (!handReady || row.block) return null;
    // Normalised as the server's send would be; a number it would refuse
    // gets no link rather than one to whoever those digits happen to reach.
    const digits = waDigits(row.whatsapp, shop.country);
    if (!digits) return null;
    const name = campaignName([row.name === CRM_NO_NAME ? "" : row.name], row.email);
    const text = composeMessage(
      template,
      { ...handVars, name, first_name: firstNameOf(name) },
      row.id,
      handPriceList,
    );
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  };

  // ---- message editing ----------------------------------------------------------

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? template.length;
    const end = el?.selectionEnd ?? start;
    const next = template.slice(0, start) + token + template.slice(end);
    if (next.length > TEMPLATE_MAX) return;
    setTemplate(next);
    // Put the caret after the chip's text, as if it had been typed.
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const photoUrl = photoPath ? `${apiURL}${photoPath}` : null;

  return (
    <div className="space-y-5">
      {active && (
        <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            {isInFlight(active.status) && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
            {isInFlight(active.status)
              ? i18nT("A campaign is sending right now.")
              : i18nT("A campaign is paused.")}
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpenRun(active.id)}>
            {i18nT("View progress")}
          </Button>
        </div>
      )}

      {manualMode && (
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">
              {i18nT("Link your WhatsApp in Settings › WhatsApp to send campaigns automatically.")}
            </p>
            <p className="text-xs">
              {i18nT(
                "Until then, each customer below has an Open in WhatsApp button with their message already written, to send from your phone one by one.",
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------ compose ------------------------------ */}
        <div className="min-w-0 space-y-6">
          {/* Audience */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label htmlFor="wa-campaign-search" className="text-sm font-medium">
                {i18nT("Customers")}
              </Label>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {i18nT("{selected} of {total} selected", {
                  selected: chosenIds.length,
                  total: selectableIds.length,
                })}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="wa-campaign-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={i18nT("Search by name or number")}
                  className="pl-8"
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-10 flex-1 sm:flex-none" onClick={() => selectVisible(true)}>
                  {i18nT("Select all")}
                </Button>
                <Button variant="outline" size="sm" className="h-10 flex-1 sm:flex-none" onClick={() => selectVisible(false)}>
                  {i18nT("Select none")}
                </Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-md border border-border px-3 py-6 text-center text-sm text-muted-foreground">
                {i18nT("No customers yet. Customers appear here after their first order.")}
              </p>
            ) : (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {visible.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {i18nT("No customers match your search.")}
                  </li>
                )}
                {visible.map((row) => {
                  const link = waLink(row);
                  const boxId = `wa-campaign-c-${row.id}`;
                  return (
                    <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        id={boxId}
                        checked={!row.block && selected.has(row.id)}
                        disabled={!!row.block}
                        onCheckedChange={(v) => toggleCustomer(row.id, v === true)}
                      />
                      <label
                        htmlFor={boxId}
                        className={`min-w-0 flex-1 ${row.block ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                      >
                        <span className="block truncate text-sm font-medium text-foreground">
                          {row.name && row.name !== CRM_NO_NAME ? row.name : i18nT("Customer")}
                        </span>
                        {row.whatsapp && row.block !== "Kiosk walk-in" && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.whatsapp}
                          </span>
                        )}
                      </label>
                      {row.block && (
                        <Badge
                          variant="outline"
                          className={`shrink-0 ${row.block === "Opted out" ? BADGE_CLASS.amber : BADGE_CLASS.neutral}`}
                        >
                          {i18nT(row.block)}
                        </Badge>
                      )}
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-green-200 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950"
                        >
                          <FaWhatsapp className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{i18nT("Open in WhatsApp")}</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Message */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label htmlFor="wa-campaign-message" className="text-sm font-medium">
                {i18nT("Message")}
              </Label>
              <span
                className={`text-xs ${
                  template.length >= TEMPLATE_MAX
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                }`}
              >
                {template.length} / {TEMPLATE_MAX}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {KNOWN_PLACEHOLDERS.map((p) => (
                <Button
                  key={p.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => insertPlaceholder(p.key)}
                >
                  <Plus className="h-3 w-3" />
                  {i18nT(p.label)}
                </Button>
              ))}
            </div>
            <Textarea
              id="wa-campaign-message"
              ref={textareaRef}
              rows={6}
              maxLength={TEMPLATE_MAX}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              // No `vars` here: t() would rewrite the `{…}` inside `{{…}}`.
              placeholder={i18nT("Hi {{first_name}}, our new {{product}} is here! See it at {{store_link}}")}
              className="resize-y"
            />
            {/* The two syntaxes are shown as code, outside any translated
                sentence, so no translation can mangle them. */}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {i18nT("Fallback when a name is missing:")}{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground">{"{{name|there}}"}</code>
              {" · "}
              {i18nT("Vary the wording:")}{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-foreground">{"{Hi|Hello|Hey}"}</code>
            </p>
            {attachPhoto && photoPath && (
              <p className="text-xs text-muted-foreground">
                {i18nT(
                  "With a photo attached, WhatsApp allows up to {count} characters per message.",
                  { count: CAPTION_MAX },
                )}
              </p>
            )}
            {unknown.length > 0 && (
              <p role="alert" className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {i18nT("Your message uses unknown placeholders:")}{" "}
                  <span className="font-mono">{unknown.map((k) => `{{${k}}}`).join(", ")}</span>
                  {" — "}
                  {i18nT("Fix or remove them before sending.")}
                </span>
              </p>
            )}
          </section>

          {/* Product */}
          {products && products.length > 0 && (
            <section className="space-y-3">
              <Label className="text-sm font-medium">{i18nT("Product (optional)")}</Label>
              <Select value={productId} onValueChange={chooseProduct}>
                <SelectTrigger aria-label={i18nT("Product (optional)")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRODUCT}>{i18nT("No product")}</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={String(p._id)} value={String(p._id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {product && (
                <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="wa-campaign-photo" className="cursor-pointer">
                        {i18nT("Attach product photo")}
                      </Label>
                      {!photoPath && (
                        <p className="text-xs text-muted-foreground">
                          {i18nT("This product has no photo.")}
                        </p>
                      )}
                    </div>
                    <Switch
                      id="wa-campaign-photo"
                      checked={attachPhoto && !!photoPath}
                      disabled={!photoPath}
                      onCheckedChange={setAttachPhoto}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="wa-campaign-prices" className="cursor-pointer">
                        {i18nT("Add price list")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {variants.length === 0
                          ? i18nT("Adds the product name and its price below the message.")
                          : pickable
                            ? i18nT("Adds the product name and the prices of the variants you tick below the message.")
                            : i18nT("Adds the product name and the prices of all its variants below the message.")}
                      </p>
                    </div>
                    <Switch
                      id="wa-campaign-prices"
                      checked={listOn}
                      onCheckedChange={setWithPriceList}
                    />
                  </div>
                  {listOn && variants.length > 0 && (
                    <ul className="max-h-48 space-y-1 overflow-y-auto">
                      {variants.map((v) => {
                        const vid = `wa-campaign-v-${v.key}`;
                        return (
                          <li key={v.key} className="flex items-center gap-2 text-sm">
                            {pickable ? (
                              <>
                                <Checkbox
                                  id={vid}
                                  checked={variantKeys.has(v.key)}
                                  onCheckedChange={(on) => toggleVariant(v.key, on === true)}
                                />
                                <label htmlFor={vid} className="min-w-0 flex-1 cursor-pointer truncate">
                                  {v.label}
                                </label>
                              </>
                            ) : (
                              <span className="min-w-0 flex-1 truncate">{v.label}</span>
                            )}
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatCampaignPrice(v.price, shop.country)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* ------------------------------ preview ------------------------------ */}
        <div className="min-w-0 space-y-4 self-start lg:sticky lg:top-4">
          <section
            className={`space-y-4 rounded-lg border border-border bg-muted/30 p-4 ${
              preview && !fresh ? "opacity-70" : ""
            }`}
            aria-busy={previewLoading}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{i18nT("Preview")}</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={!body || previewLoading}
                onClick={() => body && bodyKey && void runPreview(body, bodyKey)}
              >
                {previewLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {i18nT("Refresh")}
              </Button>
            </div>

            {!body ? (
              <p className="text-sm text-muted-foreground">
                {problem ??
                  i18nT("Write a message and choose customers to see exactly what each one will receive.")}
              </p>
            ) : previewError && !preview ? (
              <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {previewError}
              </p>
            ) : !preview ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {i18nT("Preparing the preview…")}
              </p>
            ) : (
              <>
                {previewError && (
                  <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                    {previewError}
                  </p>
                )}

                {sample ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <span className="text-muted-foreground">
                          {i18nT("Customer {current} of {total}", {
                            current: Math.min(sampleIndex, samples.length - 1) + 1,
                            total: samples.length,
                          })}
                        </span>
                        <span className="block truncate font-medium text-foreground">
                          {sample.name || i18nT("Customer")}{" "}
                          <span className="font-normal text-muted-foreground">{sample.phone}</span>
                        </span>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={i18nT("Previous customer")}
                          disabled={sampleIndex <= 0}
                          onClick={() => setSampleIndex((i) => Math.max(0, i - 1))}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={i18nT("Next customer")}
                          disabled={sampleIndex >= samples.length - 1}
                          onClick={() =>
                            setSampleIndex((i) => Math.min(samples.length - 1, i + 1))
                          }
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {/* A WhatsApp-like chat: the wallpaper and the outgoing
                        bubble in WhatsApp's own light and dark colours. */}
                    <div className="rounded-lg bg-[#efeae2] p-3 dark:bg-[#0b141a]">
                      <div className="ml-auto w-fit max-w-[90%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-2 text-sm text-neutral-900 shadow-sm dark:bg-[#005c4b] dark:text-neutral-50">
                        {preview.hasImage && photoUrl && (
                          <img
                            src={photoUrl}
                            alt={product?.name ?? ""}
                            className="mb-2 max-h-48 w-full rounded object-cover"
                            loading="lazy"
                          />
                        )}
                        <p className="whitespace-pre-wrap break-words">{sample.text}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {i18nT("Nobody in this selection can receive a WhatsApp message.")}
                  </p>
                )}

                <div className="space-y-1 text-sm">
                  <p className="font-medium text-foreground">
                    {i18nT("{count} will receive this", { count: preview.willSend })}
                  </p>
                  {preview.willSkip > 0 && (
                    <>
                      <p className="text-muted-foreground">
                        {i18nT("{count} will be skipped", { count: preview.willSkip })}
                      </p>
                      <ul className="space-y-0.5 pl-3 text-xs text-muted-foreground">
                        {Object.entries(preview.skipped ?? {})
                          .filter(([, n]) => Number(n) > 0)
                          .map(([reason, n]) => (
                            <li key={reason}>
                              {apiText(reason)}: {n}
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </div>

                {preview.willSend > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {i18nT("Takes about {minutes} min", {
                      minutes: Math.max(1, Math.ceil(preview.estimatedMinutes || 0)),
                    })}
                    {" · "}
                    {i18nT("{count} messages left today", { count: preview.dailyRemaining })}
                  </p>
                )}
                {preview.willSend > preview.dailyRemaining && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {i18nT(
                      "Only {count} can go out today. The campaign pauses at the daily limit — resume it tomorrow for the rest.",
                      { count: preview.dailyRemaining },
                    )}
                  </p>
                )}
                {(preview.warnings ?? []).map((w) => (
                  <p key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {apiText(w)}
                  </p>
                ))}
              </>
            )}
          </section>

          <div className="space-y-2">
            <Button className="w-full" disabled={!canSend} onClick={() => setConfirmOpen(true)}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {fresh && preview && preview.willSend > 0
                ? i18nT("Send to {count} customers", { count: preview.willSend })
                : i18nT("Send campaign")}
            </Button>
            <p className="text-xs text-muted-foreground">
              {manualMode
                ? i18nT("Sending needs a linked WhatsApp. Use the Open in WhatsApp buttons to send by hand.")
                : i18nT("Messages go out one at a time, a few seconds apart, from your linked WhatsApp.")}
            </p>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !starting && setConfirmOpen(o)}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {i18nT("Send to {count} customers?", { count: preview?.willSend ?? 0 })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  {i18nT(
                    "WhatsApp may block numbers that send unwanted bulk messages. Only message customers who expect to hear from you.",
                  )}
                </p>
                <p>
                  {i18nT(
                    "Messages go out one at a time, a few seconds apart, so this takes about {minutes} min. You can stop it at any time.",
                    { minutes: Math.max(1, Math.ceil(preview?.estimatedMinutes || 0)) },
                  )}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={starting}>{i18nT("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={starting}
              className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
              onClick={(e) => {
                // Kept open until the server answers, so a second click
                // cannot start a second campaign.
                e.preventDefault();
                void start();
              }}
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {i18nT("Send now")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The CRM customer detail's "Marketing messages" switch — on means campaigns
 * may message this customer. Off records an opt-out on the server (by
 * customer and by number), which every campaign honours: new ones leave the
 * customer out, and one already sending or paused checks the list again
 * before each message, so a "stop" heard mid-campaign still counts. Nothing
 * here is trusted by the send itself.
 *
 * Hidden rather than shown broken when the list cannot be read: a switch
 * that cannot say where it stands would be a guess.
 */
export function MarketingMessagesSwitch({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const mountedRef = useMounted();
  const [optedOut, setOptedOut] = useState<boolean | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const valid = isMongoId(customerId);

  useEffect(() => {
    if (!valid) return;
    setOptedOut(null);
    setUnavailable(false);
    fetch(`${apiURL}/campaigns/whatsapp/opt-outs`, { headers: authHeaders() })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!mountedRef.current) return;
        if (res.ok && Array.isArray(body?.customerIds)) {
          setOptedOut(body.customerIds.map(String).includes(customerId));
        } else {
          setUnavailable(true);
        }
      })
      .catch(() => mountedRef.current && setUnavailable(true));
  }, [customerId, valid, mountedRef]);

  if (!valid || unavailable) return null;

  const change = async (allowed: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(
        `${apiURL}/campaigns/whatsapp/opt-outs/${encodeURIComponent(customerId)}`,
        {
          method: "PUT",
          headers: authHeaders(true),
          body: JSON.stringify({ optedOut: !allowed }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;
      if (res.ok && typeof body?.optedOut === "boolean") {
        setOptedOut(body.optedOut);
        // Said outright on the way off: the shopkeeper most likely got here
        // because the customer asked to stop, possibly while a campaign is
        // still going out — and the only other way to spare them would be
        // stopping that whole campaign.
        toast({
          duration: body.optedOut ? 5000 : 3000,
          title: body.optedOut
            ? i18nT("Marketing messages turned off")
            : i18nT("Marketing messages turned on"),
          description: body.optedOut
            ? i18nT("Campaigns already sending or paused will skip this customer too.")
            : undefined,
        });
        return;
      }
      toast({
        duration: 5000,
        variant: "destructive",
        title: i18nT("That did not work"),
        description: nestMessage(body) ?? i18nT("Please try again."),
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
      if (mountedRef.current) setSaving(false);
    }
  };

  const switchId = `wa-marketing-${customerId}`;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={switchId} className="cursor-pointer">
          {i18nT("Marketing messages")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {i18nT("When off, WhatsApp campaigns skip this customer.")}
        </p>
      </div>
      <Switch
        id={switchId}
        checked={optedOut === false}
        disabled={optedOut === null || saving}
        onCheckedChange={(on) => void change(on)}
      />
    </div>
  );
}
