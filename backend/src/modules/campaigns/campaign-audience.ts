import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { extname, resolve, sep } from "path";
import { Order } from "../orders/entities/order.entity";
import { User } from "../users/schemas/user.schema";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { ShopfrontStore } from "../shopkeeper-stores/entities/shopkeeper-store.entity";
import { Product } from "../products/entities/product.entity";
import { ShopWhatsappService } from "../whatsapp/shop-whatsapp.service";
import { plainName } from "../whatsapp/whatsapp-text";
import { MarketingOptOut } from "./entities/marketing-opt-out.entity";
import { CampaignRequestDto } from "./dto/campaign-request.dto";
import { CampaignVars, render, renderedLength } from "./campaign-template";
import { effectivePrice, formatPrice } from "./campaign-money";

/** A larger audience should be split: past this the campaign record itself
 * approaches MongoDB's 16 MB document limit (every recipient stores the text
 * it is sent), and at the default daily cap it would take a week to send. */
export const MAX_SENDABLE = 1000;

/**
 * How many customers "all customers" reads before giving up. The selection is
 * otherwise unbounded — a shop decides how many customers it has — and every
 * one is loaded, named and measured before MAX_SENDABLE can refuse the
 * campaign. A shop with more customers than this has far more than
 * MAX_SENDABLE to message, so the answer is "select fewer" either way.
 */
const MAX_ALL_CANDIDATES = 5 * MAX_SENDABLE;

/**
 * Why a customer is not messaged. These exact sentences are stored on the
 * recipient row and double as i18n keys — the dashboard translates them by
 * looking the English up — so they are never built from parts.
 */
export const SKIP = {
  noNumber: "No WhatsApp number",
  kiosk: "Kiosk walk-in",
  ownNumber: "Shop's own number",
  optedOut: "Opted out of marketing",
  invalid: "Invalid number",
  duplicate: "Duplicate number",
  notOnWhatsapp: "Not on WhatsApp",
  tooLong: "Message too long",
  stopped: "Campaign stopped",
} as const;

/** WhatsApp's own ceilings. It rejects a longer message outright rather than
 * truncating it, so an over-long one is a skip decided up front. */
export const MAX_TEXT = 4096;
export const MAX_CAPTION = 1024;

/** The placeholder stored as a kiosk order's "number" when the walk-in
 * customer gave none (see OrdersService.createOrder). */
const KIOSK_NUMBER = "kiosk-order";

/** A Mongo ObjectId as a string — shop and customer ids are checked against
 * it before they reach a query, where anything else would be a cast error. */
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export const IMAGE_MISSING_WARNING =
  "The product photo could not be found, so messages are sent without it.";

/** Names that are placeholders somebody's code wrote, not a person's name.
 * "Guest User" is what a checkout without a name stores; kiosk flows write
 * walk-in variants; "Customer" is plainName's own stand-in. */
const NOT_A_NAME = [/^guest( user)?$/i, /^walk-?\s?in/i, /^customer$/i];

/**
 * The `{{name}}` for one customer: the first candidate that looks like a real
 * person's name, cleaned by plainName, or "" so the template's fallback
 * ("there") applies. A false negative only costs a less personal greeting; a
 * false positive greets a customer as "Hello Guest User", which is worse than
 * no name at all.
 *
 * Candidates are tried in order — the name on the customer's latest order at
 * this shop, then first + last name, then the account name — because the
 * order is where the customer most recently typed their own name for THIS
 * shop. A candidate equal to the local part of the customer's email is also
 * passed over: Google sign-in stores exactly that as the account name, and
 * "Hello rbgoda" is a username, not a greeting.
 */
export function resolveCustomerName(
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
 * A stored name with the words string concatenation leaves behind removed.
 * Customers a shop adds by hand are saved as `firstName + " " + lastName`,
 * which becomes "Asha undefined" when the last name was left empty — and
 * plainName would accept that as a name.
 */
function cleanCandidate(candidate: unknown): string {
  return String(candidate ?? "")
    .replace(/\b(?:undefined|null)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `{{first_name}}`: the first word of the resolved name. */
export function firstNameOf(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** The last four digits, for anything a person or a log reads. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return `…${digits.slice(-4)}`;
}

type PriceListProduct = {
  name?: string;
  price?: number;
  isDiscounted?: boolean;
  discountedPrice?: number;
  subcategories?: Array<{
    name?: string;
    variants?: Array<{
      id?: number | string;
      title?: string;
      price?: number;
      isDiscounted?: boolean;
      discountedPrice?: number;
    }>;
  }>;
};

/** What the dashboard calls a subcategory or variant that the shop never
 * named; it says nothing to a customer. */
const isUnnamed = (label?: string) => {
  const t = String(label ?? "").trim();
  return !t || t === "Default";
};

/**
 * The "Add price list" block: the product name in bold, then one line per
 * selected variant with the price the customer would pay. No stock counts —
 * "only 2 left" in a marketing message is a promise the shop cannot keep
 * once three people reply. With no variant ids given, every variant is
 * listed; a product without variants gets its own price on the name line.
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
      const label = [sub?.name, variant?.title]
        .filter((part) => !isUnnamed(part))
        .map((part) => String(part).trim())
        .join(" – ");
      lines.push(
        `• ${label || name}: ${formatPrice(effectivePrice(variant), country)}`,
      );
    }
  }
  if (!lines.length) {
    return `*${name}*: ${formatPrice(effectivePrice(product), country)}`;
  }
  return [`*${name}*`, ...lines].join("\n");
}

/**
 * The file on disk behind a product image path ("/uploads/products/x.jpg"),
 * or null when the path does not point inside uploads/.
 *
 * The path comes from a product record, and it decides which file the server
 * reads off its own disk and sends to a stranger's phone, so it is held to
 * two independent checks: no ".." segment at all, and the resolved path must
 * still sit under the uploads root. resolve() collapses anything that tries
 * to climb out, which is exactly what the containment check catches. An
 * image hosted elsewhere (a full URL from a spreadsheet import) is not ours
 * to read, and is also null.
 */
export function resolveUploadPath(stored: string | null | undefined): string | null {
  const raw = String(stored ?? "").trim();
  if (!raw || raw.includes("\0")) return null;
  const match = /^\/?uploads\/(.+)$/.exec(raw);
  if (!match) return null;
  const rest = match[1];
  if (rest.split(/[\\/]/).includes("..")) return null;
  const root = resolve(process.cwd(), "uploads");
  const full = resolve(root, rest);
  if (!full.startsWith(root + sep)) return null;
  return full;
}

/** The MIME type WhatsApp is told for a product photo. Baileys assumes JPEG
 * when told nothing, and the product upload also accepts PNG and GIF. */
export function imageMimetype(path: string): string | undefined {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return undefined;
}

export type AudienceRow = {
  customerId: string;
  /** Who the shopkeeper sees in the list. */
  name: string;
  /** "+<digits>" when sendable; as stored otherwise. */
  phone: string;
  status: "pending" | "skipped";
  reason: string | null;
  sentAt: null;
  /** The rendered message; "" on a skipped row, and on a pending row whose
   * text the caller did not ask for (see BuildOptions). */
  text: string;
};

export type BuildOptions = {
  /**
   * Build the text of only the first `samples` sendable customers — all a
   * preview shows. Every row is still measured against the length limit, so
   * the counts are exact either way. Without it every sendable row gets its
   * text, unless the audience is too big to send (see build()).
   */
  samples?: number;
};

export type BuiltAudience = {
  rows: AudienceRow[];
  willSend: number;
  /** "All customers" was cut off at MAX_ALL_CANDIDATES: the counts cover
   * only the customers read, and the campaign is too big to send. */
  truncated: boolean;
  /** The product photo will be attached (it is on disk). */
  hasImage: boolean;
  /** The stored product image path, when hasImage. */
  imagePath: string | null;
  productId: string | null;
  productName: string;
  warnings: string[];
};

type Candidate = {
  id: string;
  /** customerName on this customer's latest order at the shop. */
  orderName?: string | null;
};

/**
 * Who a campaign goes to, and exactly what each of them is sent.
 *
 * Built on the server from customer ids only. The shop's customers are the
 * people with an order at this shop plus the customers it added by hand in
 * the CRM; an id outside that set is ignored, whoever sent it. Names and
 * numbers are read here from the database, never taken from the browser.
 *
 * Also the keeper of the opt-out list, since that is audience data too.
 */
@Injectable()
export class CampaignAudienceService {
  private readonly logger = new Logger(CampaignAudienceService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Shopkeeper.name)
    private readonly shopModel: Model<Shopkeeper>,
    @InjectModel(ShopfrontStore.name)
    private readonly storeModel: Model<ShopfrontStore>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(MarketingOptOut.name)
    private readonly optOutModel: Model<MarketingOptOut>,
    private readonly whatsapp: ShopWhatsappService,
  ) {}

  // ── The audience ─────────────────────────────────────────────────────────

  async build(
    shopId: string,
    dto: CampaignRequestDto,
    options: BuildOptions = {},
  ): Promise<BuiltAudience> {
    const id = assertShopId(shopId);
    assertOneAudience(dto);

    const shop = await this.shopModel
      .findById(id)
      .select("shopName country whatsappNumber phone")
      .lean();
    if (!shop) throw new NotFoundException("Shop not found.");
    const country = shop.country || undefined;

    const { customers, truncated } = await this.selectCustomers(id, dto);
    const warnings: string[] = [];

    // The product: the shop's own, and not deleted.
    let product: (Product & { _id: unknown }) | null = null;
    if (dto.productId) {
      product = (await this.productModel
        .findOne({
          _id: dto.productId,
          shopkeeperId: id,
          isSoftDeleted: { $ne: true },
        })
        .lean()) as (Product & { _id: unknown }) | null;
      if (!product) throw new NotFoundException("Product not found.");
    }

    let imagePath: string | null = null;
    if (product && dto.attachProductImage) {
      const stored = product.images?.[0] ?? null;
      const full = resolveUploadPath(stored);
      if (full && (await readable(full))) imagePath = stored;
      else warnings.push(IMAGE_MISSING_WARNING);
    }
    const hasImage = !!imagePath;

    const priceList =
      product && dto.includePriceList
        ? buildPriceList(product, dto.variantIds, country)
        : "";

    const store = await this.storeModel
      .findOne({ shopkeeperId: { $in: [id, new Types.ObjectId(id)] } })
      .select("slug")
      .lean();
    const base = (process.env.FRONTEND_URL || "https://kioscart.com").replace(
      /\/+$/,
      "",
    );
    const shared: CampaignVars = {
      shop_name: String(shop.shopName ?? ""),
      product: product ? String(product.name ?? "") : "",
      price: product ? formatPrice(effectivePrice(product), country) : "",
      store_link: store?.slug ? `${base}/${store.slug}` : "",
    };

    const users = customers.length
      ? await this.userModel
          .find({ _id: { $in: customers.map((c) => c.id) } })
          .select("name firstName lastName email whatsAppNumber")
          .lean()
      : [];
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const optedOut = await this.optOutKeys(id);

    const ownDigits = new Set<string>();
    for (const own of [shop.whatsappNumber, shop.phone]) {
      const digits = this.digitsOf(own, country) ?? rawDigits(own);
      if (digits) ownDigits.add(digits);
    }
    const linked = await this.linkedNumber(id);
    if (linked) ownDigits.add(linked);

    const cap = hasImage ? MAX_CAPTION : MAX_TEXT;
    const tail = priceList ? `\n\n${priceList}` : "";
    const seen = new Set<string>();
    const rows: AudienceRow[] = [];
    // Sendable rows and their values, so the texts can be built at the end —
    // only as many as the caller needs.
    const sendable: Array<{ row: AudienceRow; vars: CampaignVars }> = [];

    for (const customer of customers) {
      const user = userById.get(customer.id);
      // A user deleted since their order cannot be messaged, and there is
      // nobody to show in the list either.
      if (!user) continue;

      const name = resolveCustomerName(
        [
          customer.orderName,
          [user.firstName, user.lastName]
            .map((part) => String(part ?? "").trim())
            .filter(Boolean)
            .join(" "),
          user.name,
        ],
        user.email,
      );
      // A customer with no usable name still needs a label the shopkeeper
      // recognises ("Guest User" is at least honest about who that is). Only
      // ever shown in the shop's own dashboard, never sent.
      const display =
        name ||
        ([customer.orderName, user.name]
          .map(cleanCandidate)
          .find(Boolean) ?? ""
        ).slice(0, 60);

      const stored = String(user.whatsAppNumber ?? "").trim();
      let reason: string | null = null;
      let digits: string | null = null;
      if (!stored) {
        reason = SKIP.noNumber;
      } else if (stored.toLowerCase() === KIOSK_NUMBER) {
        reason = SKIP.kiosk;
      } else {
        digits = this.digitsOf(stored, country);
        const compare = digits ?? rawDigits(stored);
        if (compare && ownDigits.has(compare)) reason = SKIP.ownNumber;
        else if (
          optedOut.ids.has(customer.id) ||
          (compare && optedOut.digits.has(compare))
        ) {
          reason = SKIP.optedOut;
        } else if (!digits) reason = SKIP.invalid;
        else if (seen.has(digits)) reason = SKIP.duplicate;
      }

      const vars: CampaignVars = {
        ...shared,
        name,
        first_name: firstNameOf(name),
      };
      // Measured, not built: the length decides the skip, and the text itself
      // is only needed for the rows the caller will show or send.
      if (
        !reason &&
        renderedLength(dto.template, vars, customer.id) + tail.length > cap
      ) {
        reason = SKIP.tooLong;
      }

      // Only a row that will actually be sent claims its number: a number
      // whose first row was skipped for its own message length has not been
      // messaged, so a later row for it still can be.
      if (!reason && digits) seen.add(digits);

      const row: AudienceRow = {
        customerId: customer.id,
        name: display,
        phone: reason ? stored : `+${digits}`,
        status: reason ? "skipped" : "pending",
        reason,
        sentAt: null,
        text: "",
      };
      rows.push(row);
      if (!reason) sendable.push({ row, vars });
    }

    // A campaign too big to send is refused by the caller, so its texts are
    // never needed — except a preview's few samples, which still show what
    // the message looks like while the shopkeeper trims the selection.
    const tooBig = truncated || sendable.length > MAX_SENDABLE;
    const texts =
      options.samples !== undefined
        ? Math.max(0, options.samples)
        : tooBig
          ? 0
          : sendable.length;
    for (const { row, vars } of sendable.slice(0, texts)) {
      row.text = render(dto.template, vars, row.customerId) + tail;
    }

    return {
      rows,
      willSend: sendable.length,
      truncated,
      hasImage,
      imagePath,
      productId: product ? String(product._id) : null,
      productName: product ? String(product.name ?? "") : "",
      warnings,
    };
  }

  /**
   * The customers this request names, in a stable order, each with the name
   * on their latest order here. `customerIds` keeps the order it was sent in
   * (so the first-listed of two customers sharing a number is the one
   * messaged); "all customers" lists the most recent buyers first, then the
   * customers the shop added by hand, and stops at MAX_ALL_CANDIDATES
   * (`truncated`). An explicit list is already bounded by the request DTO.
   */
  private async selectCustomers(
    shopId: string,
    dto: CampaignRequestDto,
  ): Promise<{ customers: Candidate[]; truncated: boolean }> {
    const requested = dto.allCustomers
      ? null
      : [...new Set((dto.customerIds ?? []).map(String))].filter((c) =>
          OBJECT_ID.test(c),
        );
    if (requested && requested.length === 0) {
      return { customers: [], truncated: false };
    }
    // One past the cap, so "exactly at the cap" and "more" can be told apart.
    const readLimit = MAX_ALL_CANDIDATES + 1;

    const orderMatch: Record<string, unknown> = {
      shopkeeperId: { $in: [shopId, new Types.ObjectId(shopId)] },
      isSoftDeleted: { $ne: true },
    };
    if (requested) {
      orderMatch.userId = {
        $in: requested.flatMap((c) => [c, new Types.ObjectId(c)]),
      };
    }
    const orderCustomers = await this.orderModel.aggregate<{
      _id: unknown;
      customerName?: string | null;
    }>([
      { $match: orderMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$userId",
          customerName: { $first: "$customerName" },
          lastOrderAt: { $first: "$createdAt" },
        },
      },
      { $sort: { lastOrderAt: -1 } },
      ...(requested ? [] : [{ $limit: readLimit }]),
    ]);

    const byId = new Map<string, Candidate>();
    for (const row of orderCustomers) {
      const cid = String(row._id ?? "");
      // An order whose userId is not an id (old data) names nobody to look up.
      if (!OBJECT_ID.test(cid) || byId.has(cid)) continue;
      byId.set(cid, { id: cid, orderName: row.customerName ?? null });
    }

    const addedFilter: Record<string, unknown> = {
      provider: "Shopkeeper",
      providerId: shopId,
    };
    if (requested) addedFilter._id = { $in: requested };
    const addedQuery = this.userModel
      .find(addedFilter)
      .select("_id")
      .sort({ createdAt: -1 });
    if (!requested) addedQuery.limit(readLimit);
    const added = await addedQuery.lean();
    for (const user of added) {
      const cid = String(user._id);
      if (!byId.has(cid)) byId.set(cid, { id: cid, orderName: null });
    }

    if (!requested) {
      const all = [...byId.values()];
      return {
        customers: all.slice(0, MAX_ALL_CANDIDATES),
        truncated: all.length > MAX_ALL_CANDIDATES,
      };
    }
    return {
      customers: requested
        .map((cid) => byId.get(cid))
        .filter((c): c is Candidate => !!c),
      truncated: false,
    };
  }

  /**
   * Whether a user is one of this shop's customers, for the opt-out switch.
   *
   * Wider than the audience on purpose: soft-deleted orders still count. The
   * CRM lists those customers (as UsersService.isCustomerOfShop also
   * reasons), so the shop must be able to opt them out — and a stored
   * opt-out only ever removes people from a campaign, never adds them.
   */
  async isCustomerOf(shopId: string, customerId: string): Promise<boolean> {
    const id = assertShopId(shopId);
    if (!OBJECT_ID.test(String(customerId ?? ""))) return false;
    const added = await this.userModel.exists({
      _id: customerId,
      provider: "Shopkeeper",
      providerId: id,
    });
    if (added) return true;
    const ordered = await this.orderModel.exists({
      shopkeeperId: { $in: [id, new Types.ObjectId(id)] },
      userId: { $in: [customerId, new Types.ObjectId(customerId)] },
    });
    return !!ordered;
  }

  // ── Opt-outs ─────────────────────────────────────────────────────────────

  /** The shop's opt-outs, as the user ids and phone digits they cover. */
  async optOutKeys(
    shopId: string,
  ): Promise<{ ids: Set<string>; digits: Set<string> }> {
    const id = assertShopId(shopId);
    const optOuts = await this.optOutModel
      .find({ shopkeeperId: id })
      .select("userId phoneDigits")
      .lean();
    return {
      ids: new Set(optOuts.map((o) => String(o.userId))),
      digits: new Set(
        optOuts.map((o) => String(o.phoneDigits || "")).filter(Boolean),
      ),
    };
  }

  /**
   * Whether this customer may no longer be sent marketing, asked right before
   * each campaign message. A campaign is built once but can take days to send
   * (it pauses at the daily cap), and a customer who asks the shop to stop in
   * the meantime must not get the rest of it.
   *
   * `phone` is a pending row's "+<digits>", normalised exactly the way
   * setOptOut normalises the number it stores, so the digits compare directly.
   */
  async isOptedOut(
    shopId: string,
    customerId: string,
    phone: string,
  ): Promise<boolean> {
    const id = assertShopId(shopId);
    const digits = rawDigits(phone);
    const or: Record<string, unknown>[] = [{ userId: String(customerId) }];
    // An opt-out stored with no usable number has phoneDigits "", which must
    // not match a row that has none either.
    if (digits) or.push({ phoneDigits: digits });
    return !!(await this.optOutModel.exists({ shopkeeperId: id, $or: or }));
  }

  async listOptOuts(shopId: string): Promise<{ customerIds: string[] }> {
    const id = assertShopId(shopId);
    const rows = await this.optOutModel
      .find({ shopkeeperId: id })
      .select("userId")
      .lean();
    return { customerIds: rows.map((r) => String(r.userId)) };
  }

  /**
   * The CRM's "Marketing messages" switch. Stores the number alongside the
   * id (see MarketingOptOut) as it is NOW, normalised the way sending
   * normalises it, so the same person under another record is covered too.
   */
  async setOptOut(
    shopId: string,
    customerId: string,
    optedOut: boolean,
  ): Promise<{ customerId: string; optedOut: boolean }> {
    const id = assertShopId(shopId);
    if (!(await this.isCustomerOf(id, customerId))) {
      throw new NotFoundException("Customer not found.");
    }
    if (!optedOut) {
      await this.optOutModel.deleteOne({ shopkeeperId: id, userId: customerId });
      return { customerId, optedOut: false };
    }
    const [user, shop] = await Promise.all([
      this.userModel.findById(customerId).select("whatsAppNumber").lean(),
      this.shopModel.findById(id).select("country").lean(),
    ]);
    const stored = String(user?.whatsAppNumber ?? "").trim();
    const phoneDigits =
      !stored || stored.toLowerCase() === KIOSK_NUMBER
        ? ""
        : (this.digitsOf(stored, shop?.country) ?? rawDigits(stored));
    await this.optOutModel.updateOne(
      { shopkeeperId: id, userId: customerId },
      {
        $set: { phoneDigits },
        $setOnInsert: { shopkeeperId: id, userId: customerId },
      },
      { upsert: true },
    );
    return { customerId, optedOut: true };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** A number as WhatsApp would address it, digits only — or null when the
   * WhatsApp service refuses it (no country code, too short). */
  private digitsOf(phone: unknown, country?: string | null): string | null {
    const raw = String(phone ?? "").trim();
    if (!raw) return null;
    try {
      return this.whatsapp.toJid(raw, country || undefined).split("@")[0];
    } catch {
      return null;
    }
  }

  /** The number the shop's WhatsApp is linked as, if any. Messaging it would
   * land silently in the owner's "Message yourself". */
  private async linkedNumber(shopId: string): Promise<string | null> {
    try {
      const state = await this.whatsapp.getState(shopId);
      return state.number ? rawDigits(state.number) || null : null;
    } catch (err) {
      this.logger.warn(
        `Could not read the linked WhatsApp number for shop ${shopId}: ${describe(err)}`,
      );
      return null;
    }
  }
}

/** Exactly one of `customerIds` / `allCustomers` — a rule across two fields,
 * which class-validator cannot express on either one. */
export function assertOneAudience(dto: CampaignRequestDto) {
  const hasIds = dto.customerIds !== undefined && dto.customerIds !== null;
  const all = dto.allCustomers === true;
  if (hasIds === all) {
    throw new BadRequestException(
      "Choose the customers to send to, or send to all customers.",
    );
  }
}

export function assertShopId(shopId: string): string {
  const id = String(shopId ?? "");
  if (!OBJECT_ID.test(id)) throw new BadRequestException("Invalid shop id.");
  return id;
}

function rawDigits(phone: unknown): string {
  return String(phone ?? "").replace(/\D/g, "");
}

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function describe(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\d{7,}/g, (d) => `…${d.slice(-4)}`);
}
