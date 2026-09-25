/**
 * The WhatsApp campaign template language, browser side.
 *
 * A campaign message is written once and personalised per customer:
 * `Hello {{name}}` arrives as `Hello Vansh Sharma`. The backend renders every
 * message that is actually SENT (and every preview sample), so this copy
 * exists for three things only: the instant "unknown placeholder" check while
 * typing, the placeholder chips, and the one-by-one wa.me links offered when
 * the shop has no linked WhatsApp to send from.
 *
 * Because a wa.me link is sent by hand from the shopkeeper's own phone, it
 * must say exactly what the server would have said — so the rules below are a
 * contract shared with the backend (spec §1), not a loose imitation: THIS
 * FILE HAS A TWIN in backend/src/modules/campaigns/campaign-template.ts.
 * Change one side and the test vectors on both sides must change with it.
 *
 * Rendering is two passes, in this order:
 *
 *  1. Spintax. Every single-brace group with at least one `|` and no braces
 *     inside — `{Hi|Hello|Hey}` — becomes ONE of its options. The choice is a
 *     hash of the seed (the customer id) and the group's position, so the
 *     same customer always gets the same wording: the preview for customer X
 *     is exactly what X receives, and a resumed campaign does not reshuffle.
 *     `{{…}}` tokens are skipped whole, so the `|` of `{{name|friend}}` is
 *     never read as spintax.
 *
 *  2. Variables. `{{ key }}` / `{{ key | fallback }}` become the customer's
 *     value, else the fallback, else a default (`there` for names, empty for
 *     the rest). A key we do not know is left exactly as written, so a typo
 *     shows up in the preview instead of silently vanishing.
 *
 * Values go in as plain text and are never scanned again — a price of
 * `{a|b}` stays `{a|b}` — because the variables run last, in a single
 * `replace` whose output nothing reads again.
 */

/** Every placeholder a template may use, in the order the chips show them. */
export type PlaceholderKey =
  | "name"
  | "first_name"
  | "shop_name"
  | "product"
  | "price"
  | "store_link";

/**
 * The chips in the composer. `label` is English and doubles as the i18n key —
 * this module stays free of the translator so it can run under plain node for
 * the test vectors.
 */
export const KNOWN_PLACEHOLDERS: ReadonlyArray<{
  key: PlaceholderKey;
  label: string;
}> = [
  { key: "name", label: "Name" },
  { key: "first_name", label: "First name" },
  { key: "shop_name", label: "Shop name" },
  { key: "product", label: "Product" },
  { key: "price", label: "Price" },
  { key: "store_link", label: "Store link" },
];

const KNOWN_KEYS: ReadonlySet<string> = new Set(
  KNOWN_PLACEHOLDERS.map((p) => p.key),
);

/**
 * What an empty value becomes when the template gives no fallback of its own.
 * "Hi there" reads as a greeting; "Hi " reads as a bug. Keys not listed here
 * (a missing price, say) collapse to nothing.
 */
const DEFAULT_FALLBACK: Partial<Record<PlaceholderKey, string>> = {
  name: "there",
  first_name: "there",
};

export type CampaignVars = Partial<Record<PlaceholderKey, string>>;

/**
 * Pass 1. The first alternative swallows a whole `{{…}}` token (lazily, to
 * the first `}}`) so nothing inside it is spun; the second is a single-brace
 * group, spun only when it holds a `|`. A `{{` with no `}}` after it fails
 * the first alternative and is left as literal text.
 */
const SPIN_SCAN = /\{\{[\s\S]*?\}\}|\{[^{}]*\}/g;

/**
 * Pass 1 after the template's last `}}`. There the `{{…}}` alternative can
 * never match, yet trying it costs a lazy scan to the end of the text from
 * every `{{` — quadratic, so a template of 1500 `{{` stalled the server for
 * seconds per preview. Only the single-brace alternative can match there,
 * so it runs on its own.
 */
const SINGLE = /\{[^{}]*\}/g;

/**
 * Pass 2, and the validator. A key is letters and underscores only; the
 * optional fallback is anything up to the closing `}}` except a brace.
 * Whitespace (newlines included) is allowed around the key and the `|`.
 */
const VARIABLE = /\{\{\s*([A-Za-z_]+)\s*(?:\|([^{}]*))?\}\}/g;

/**
 * 32-bit FNV-1a over UTF-16 code units — the same units `charCodeAt` and the
 * backend's loop both see, so a name in Devanagari hashes identically on
 * both sides. `Math.imul` keeps the multiply inside 32 bits; a plain `*`
 * would lose the low bits to floating point once the product passes 2^53.
 */
export function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pass 1, in linear time. `n` counts only groups that are actually spun,
 * left to right, so adding a `{single}` word elsewhere does not reshuffle the
 * others.
 *
 * The template is cut after its last `}}`. Every `{{` before the cut finds a
 * close, and its match consumes the text it scanned, so SPIN_SCAN stays
 * linear there; after the cut no `{{…}}` can match, so only single-brace
 * groups are looked for. The counter is shared across the cut, which makes
 * the output identical to one SPIN_SCAN pass over the whole template (the
 * backend twin makes the same cut, and was fuzzed against the old pass).
 */
function spin(template: string, seed: string): string {
  let n = 0;
  const pick = (match: string) => {
    if (match.startsWith("{{")) return match;
    const inner = match.slice(1, -1);
    if (!inner.includes("|")) return match;
    const options = inner.split("|");
    const choice = options[fnv1a32(`${seed}:${n}`) % options.length];
    n += 1;
    return choice;
  };
  const last = template.lastIndexOf("}}");
  const cut = last < 0 ? 0 : last + 2;
  return (
    template.slice(0, cut).replace(SPIN_SCAN, pick) +
    template.slice(cut).replace(SINGLE, pick)
  );
}

/**
 * The message one customer receives. `seed` is that customer's id.
 *
 * A value counts as missing only when it is absent or exactly "" — the same
 * test the backend makes. Names reach here through `campaignName`, which
 * trims, so a whitespace-only name never gets this far anyway.
 */
export function render(
  template: string,
  vars: CampaignVars,
  seed: string,
): string {
  const spun = spin(String(template ?? ""), String(seed ?? ""));

  return spun.replace(
    VARIABLE,
    (whole: string, rawKey: string, fallback: string | undefined) => {
      const key = rawKey.toLowerCase() as PlaceholderKey;
      if (!KNOWN_KEYS.has(key)) return whole;
      const value = vars?.[key];
      if (value != null && value !== "") return String(value);
      if (fallback !== undefined) return fallback.trim();
      return DEFAULT_FALLBACK[key] ?? "";
    },
  );
}

/**
 * The placeholders a template uses that we do not know, lowercased and
 * de-duplicated in first-seen order. Checked on the raw template: spintax
 * options cannot contain braces and pass 1 never touches a `{{…}}` token, so
 * spinning cannot create or destroy a placeholder.
 */
export function validate(template: string): { unknown: string[] } {
  const unknown: string[] = [];
  for (const match of String(template ?? "").matchAll(VARIABLE)) {
    const key = match[1].toLowerCase();
    if (!KNOWN_KEYS.has(key) && !unknown.includes(key)) unknown.push(key);
  }
  return { unknown };
}

// ── The values that fill the placeholders ────────────────────────────────
//
// Everything below mirrors backend/src/modules/campaigns (campaign-audience.ts
// and campaign-money.ts), whatsapp-text.ts, and the number rule of
// shop-whatsapp.service.ts. The server computes these for every real send;
// the copies here only fill the hand-sent wa.me messages and the composer's
// price labels, which must read the same as — and go to the same number as —
// what the server would have sent.

/**
 * A person's name, or `fallback` when it does not look like one — the
 * backend's `plainName`, kept character for character. Letters and marks in
 * any script, spaces, apostrophes, hyphens and dots, at most 40 characters,
 * and no "word.word" a phone would turn into a link. NFKC first, so
 * full-width look-alikes are judged as what they look like.
 */
export function plainName(name: unknown, fallback = "Customer"): string {
  const oneLine = String(name ?? "")
    .normalize("NFKC")
    .replace(/[ \u00a0]+/g, " ")
    .trim();
  const looksLikeAName =
    /^[\p{L}\p{M}' .-]{1,40}$/u.test(oneLine) &&
    !/[\p{L}\p{M}-]\.[\p{L}]{2,}/u.test(oneLine);
  return looksLikeAName ? oneLine : fallback;
}

/**
 * Names that are placeholders somebody's code wrote, not a person's name:
 * "Guest User" from a checkout without one, walk-in variants from the kiosk,
 * and plainName's own "Customer". "Hello Guest User" is worse than "Hello
 * there", so these are passed over.
 */
const NOT_A_NAME = [/^guest( user)?$/i, /^walk-?\s?in/i, /^customer$/i];

/**
 * A stored name with the words string concatenation leaves behind removed:
 * a customer added by hand is saved as `firstName + " " + lastName`, which
 * reads "Asha undefined" when the last name was left empty — and plainName
 * would accept that as a name.
 */
function cleanCandidate(candidate: unknown): string {
  return String(candidate ?? "")
    .replace(/\b(?:undefined|null)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The `{{name}}` value (spec §2): the first candidate that looks like a real
 * person's name, cleaned by plainName, or "" so the template's fallback
 * applies. A candidate equal to the local part of the customer's email is
 * passed over too — Google sign-in stores exactly that as the account name,
 * and "Hello rbgoda" is a username, not a greeting.
 *
 * The server's first candidate is the name on the customer's latest order,
 * which the CRM list does not carry; a hand-sent message can differ from a
 * server send there, and only there.
 */
export function campaignName(
  candidates: unknown[],
  email?: string | null,
): string {
  const emailPrefix = String(email ?? "")
    .split("@")[0]
    .trim()
    .toLowerCase();
  for (const candidate of candidates) {
    const trimmed = cleanCandidate(candidate);
    if (!trimmed) continue;
    if (NOT_A_NAME.some((pattern) => pattern.test(trimmed))) continue;
    if (emailPrefix && trimmed.toLowerCase() === emailPrefix) continue;
    const clean = plainName(trimmed, "");
    if (clean) return clean;
  }
  return "";
}

/**
 * Calling codes for the countries shops are in — the backend's CALLING_CODES
 * (shop-whatsapp.service.ts), codes and the names older shop rows store.
 */
const CALLING_CODES: Record<string, string> = {
  IN: "91",
  INDIA: "91",
  SG: "65",
  SINGAPORE: "65",
  MY: "60",
  MALAYSIA: "60",
  AE: "971",
  UAE: "971",
  UNITEDARABEMIRATES: "971",
  US: "1",
  USA: "1",
  UNITEDSTATES: "1",
  GB: "44",
  UK: "44",
  UNITEDKINGDOM: "44",
  AU: "61",
  AUSTRALIA: "61",
};

/**
 * A stored number as wa.me wants it — full international digits — or null
 * when the server would refuse it as "Invalid number". The backend's
 * ShopWhatsappService.toJid rule for rule: numbers are stored as customers
 * typed them, so one without a "+" loses an international "00", or loses a
 * trunk "0" and gains the shop's calling code when it is short enough to be
 * local. Plain digit-stripping turned an Indian shop's "98765 43210" into
 * wa.me/9876543210, which WhatsApp reads as +98 — a chat with a stranger
 * abroad instead of the customer the automatic send would reach.
 */
export function waDigits(phone: unknown, country?: string | null): string | null {
  const raw = String(phone ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (!raw.startsWith("+")) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else {
      const calling =
        CALLING_CODES[
          String(country ?? "")
            .toUpperCase()
            .replace(/[^A-Z]/g, "")
        ];
      if (calling) {
        const local = digits.startsWith("0") ? digits.slice(1) : digits;
        if (local.length > 0 && local.length <= 10) digits = calling + local;
      }
    }
  }
  return digits.length >= 8 ? digits : null;
}

/** `{{first_name}}`: the first word of the resolved name ("" stays ""). */
export function firstNameOf(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

const CURRENCIES: Record<
  string,
  { locale: string; currency: string; symbol?: string }
> = {
  IN: { locale: "en-IN", currency: "INR", symbol: "₹" },
  SG: { locale: "en-SG", currency: "SGD", symbol: "S$" },
  US: { locale: "en-US", currency: "USD" },
  GB: { locale: "en-GB", currency: "GBP" },
};

/** Older shop rows store the country as a name rather than a code. */
const COUNTRY_NAMES: Record<string, string> = {
  INDIA: "IN",
  SINGAPORE: "SG",
  UNITEDSTATES: "US",
  USA: "US",
  UNITEDKINGDOM: "GB",
  UK: "GB",
};

function countryCode(country?: string | null): string {
  const key = String(country ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return COUNTRY_NAMES[key] ?? key;
}

/**
 * Money as a campaign message writes it — OrdersService.formatPriceByCountry's
 * format, so `{{price}}` reads like the amount on the same shop's order
 * confirmation: India `₹1,499.00`, Singapore `S$1,499.00`.
 */
export function formatCampaignPrice(
  amount: number,
  country?: string | null,
): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "0.00";
  const value = Number(amount);
  const cfg = CURRENCIES[countryCode(country)] || {
    locale: "en-US",
    currency: "USD",
  };
  if (cfg.symbol) {
    return `${cfg.symbol}${value.toLocaleString(cfg.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return value.toLocaleString(cfg.locale, {
    style: "currency",
    currency: cfg.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Anything with a price that can be on offer: a product or a variant. */
export type Priced = {
  price?: number | null;
  isDiscounted?: boolean | null;
  discountedPrice?: number | null;
};

/** What the customer actually pays: the discounted price when a discount is
 * switched on AND set, else the list price. A discount flag left on with no
 * amount would otherwise advertise the item as free. */
export function effectivePrice(item: Priced | null | undefined): number {
  const discounted = Number(item?.discountedPrice);
  if (item?.isDiscounted && Number.isFinite(discounted) && discounted > 0) {
    return discounted;
  }
  const price = Number(item?.price);
  return Number.isFinite(price) ? price : 0;
}

export type PriceListProduct = Priced & {
  name?: string;
  subcategories?: Array<{
    name?: string;
    variants?: Array<Priced & { id?: number | string; title?: string }>;
  }>;
};

/** What the dashboard calls a subcategory or variant the shop never named;
 * it says nothing to a customer. */
const isUnnamed = (label?: string) => {
  const t = String(label ?? "").trim();
  return !t || t === "Default";
};

/** A price-list line's label: "Silk – Red", leaving out the parts the shop
 * never named, and the product's own name when nothing is left. */
export function variantLabel(
  subcategoryName: string | undefined,
  variantTitle: string | undefined,
  productName: string,
): string {
  const label = [subcategoryName, variantTitle]
    .filter((part) => !isUnnamed(part))
    .map((part) => String(part).trim())
    .join(" – ");
  return label || productName;
}

/**
 * The "Add price list" block (spec §4): the product name in bold, then one
 * line per chosen variant — every variant when no ids are given — with the
 * price the customer would pay. No stock counts: "only 2 left" in a
 * marketing message is a promise the shop cannot keep once three people
 * reply. A product without variants gets its own price on the name line.
 */
export function buildPriceList(
  product: PriceListProduct,
  variantIds: string[] | undefined,
  country?: string | null,
): string {
  const wanted =
    variantIds && variantIds.length ? new Set(variantIds.map(String)) : null;
  const name = String(product?.name ?? "").trim();
  const lines: string[] = [];
  for (const sub of product?.subcategories ?? []) {
    for (const variant of sub?.variants ?? []) {
      if (wanted && !wanted.has(String(variant?.id))) continue;
      lines.push(
        `• ${variantLabel(sub?.name, variant?.title, name)}: ${formatCampaignPrice(
          effectivePrice(variant),
          country,
        )}`,
      );
    }
  }
  if (!lines.length) {
    return `*${name}*: ${formatCampaignPrice(effectivePrice(product), country)}`;
  }
  return [`*${name}*`, ...lines].join("\n");
}

/** The whole text one customer receives: the rendered template, then the
 * price list when there is one. */
export function composeMessage(
  template: string,
  vars: CampaignVars,
  seed: string,
  priceList?: string | null,
): string {
  const text = render(template, vars, seed);
  return priceList ? `${text}\n\n${priceList}` : text;
}
