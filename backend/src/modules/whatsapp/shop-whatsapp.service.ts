import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import makeWASocket, {
  BufferJSON,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  useMultiFileAuthState,
  ConnectionState,
  proto,
  UserFacingSocketConfig,
  WASocket,
  WAVersion,
} from "baileys";
import * as qrcode from "qrcode";
import { existsSync, readFileSync, rmSync } from "fs";
import { mkdir, rename, writeFile } from "fs/promises";
import { join } from "path";
import { SubscriptionAccessService } from "../../common/subscription/subscription-access.service";
import { ShopWhatsapp } from "./schemas/shop-whatsapp.schema";

/**
 * Each shop's own WhatsApp number, over Baileys.
 *
 * Baileys is an unofficial client: it pairs as a LINKED DEVICE of a real
 * WhatsApp account, exactly as WhatsApp Web does, and sends as that number.
 * There is no API key and no Business API account — the shopkeeper's phone
 * that scans the QR is the sender, and everything sent is attributable to it.
 * That also means WhatsApp can block the number if it is used the way a bulk
 * sender would use it. So the automated messages (order confirmations and
 * updates) go one at a time under per-shop ceilings, and the one path that
 * reaches many customers — a campaign the shopkeeper starts from the CRM —
 * goes through sendCampaignMessage() instead: paced by the campaign runner
 * (modules/campaigns) with seconds between messages, longer pauses and a
 * daily cap of its own, and never spending the order messages' allowance.
 *
 * WHAT THIS SERVICE OWNS: one socket per shop, and the truth about each one's
 * state. It is singadvisor's WhatsappService (one socket per site) generalised
 * to a Map of sessions, and it keeps that service's two load-bearing ideas:
 *
 *  - Readiness means the connection actually reached `open`, tracked from the
 *    event, not "a socket object exists". A socket exists while it is waiting
 *    for a scan or closed and retrying, and sending on it then returns a
 *    promise that never settles.
 *
 *  - Every socket captures the GENERATION it was created under, and every
 *    await in the connect path re-checks it. A reconnect, a switch-off or an
 *    unlink bumps the generation, so events from a superseded socket are
 *    dropped and a socket created after the supersede is ended instead of
 *    published. Without this two sockets race to set the status, which is how
 *    a disconnected shop ends up reporting `connected`.
 *
 * THE QR IS SHOWN ONCE. A QR is only ever rendered for an attempt a person
 * started by clicking (`interactive`). Background work — boot restore,
 * reconnect retries — never produces one: if a saved pairing stops working,
 * the socket is ended and the panel asks the shopkeeper to link again, rather
 * than cycling fresh codes that nobody is looking at. And once a phone is
 * linked, drops and restarts reconnect silently from the saved pairing.
 *
 * THE AUTH FOLDER IS THE PAIRING. Baileys writes the linked-device keys to
 * `<WHATSAPP_SHOP_AUTH_DIR>/<shopkeeperId>/`; delete them and the shop must
 * scan again. The deploy runs `git clean -fd` in backend/, which removes
 * untracked files — so the folder MUST stay gitignored (it is, in both
 * .gitignore files) or every deploy silently logs every shop out. It must also
 * never sit under uploads/, which is served publicly: those files let anyone
 * who reads them send as the shop.
 *
 * This is separate from the platform OTP socket in otp/otp.service.ts, which
 * uses `whatsapp_auth/`. The two never share a folder.
 */

export type ShopWhatsappStatus =
  | "off"
  | "disconnected"
  | "connecting"
  | "awaiting-scan"
  | "connected";

/**
 * What the Settings › WhatsApp panel is told.
 *
 * `awaiting-scan` is a state of its own rather than a flavour of `connecting`,
 * because it is the only one that asks the human for something.
 */
export type ShopWhatsappState = {
  /** The shopkeeper's on/off switch, from the ShopWhatsapp record. */
  enabled: boolean;
  status: ShopWhatsappStatus;
  /** The QR as a data: URL, only while `awaiting-scan`. */
  qr: string | null;
  /** When the current QR stops being scannable (ISO). WhatsApp rotates it —
   * first after 60 s, then every 20 s — and the panel uses this to show that a
   * refresh is coming rather than looking frozen. */
  qrExpiresAt: string | null;
  /** The linked number, digits only, as WhatsApp reports it. */
  number: string | null;
  connectedAt: string | null;
  /** The last failure as a sentence for the shopkeeper. Never a QR string. */
  lastError: string | null;
};

/** The plan key that sells this (OPT_IN_FEATURES: off unless a plan says on). */
const FEATURE = "whatsappConnect";

/**
 * A shopkeeper id is also a folder name on disk, so it is checked against the
 * exact shape of a Mongo ObjectId before it goes anywhere near a path. Anything
 * else — `..`, a slash, an absolute path — could otherwise point the auth
 * state, or the folder wipe on unlink, somewhere it must not go.
 */
const SHOP_ID = /^[a-f0-9]{24}$/i;

/** Fast reconnects (2s, 4s, 8s, 16s, 32s) before settling into the slow loop. */
const FAST_RETRIES = 5;
/** A paired shop keeps trying this often for as long as it is switched on and
 * its plan still includes the feature. A linked device survives the phone
 * being offline for days, so giving up after a few minutes of network trouble
 * would unlink nothing and only leave the shop silently not sending. */
const SLOW_RETRY_MS = 5 * 60 * 1000;
/** Slow retries are logged about hourly rather than every five minutes. */
const SLOW_RETRY_LOG_EVERY = 12;

/** How long a fetched WhatsApp Web version is reused. */
const VERSION_TTL_MS = 6 * 60 * 60 * 1000;
/** How long a FAILED version fetch is remembered, so a restore of many shops
 * while GitHub is unreachable waits out one timeout, not one per shop. */
const VERSION_FAILURE_TTL_MS = 10 * 60 * 1000;
const VERSION_FETCH_TIMEOUT_MS = 15_000;

/** Baileys' first QR lives 60 s, the ones after it 20 s. */
const FIRST_QR_MS = 60_000;
const NEXT_QR_MS = 20_000;

const SEND_TIMEOUT_MS = 30_000;
/** An image is uploaded to WhatsApp's media servers before the message goes,
 * which on a shop's slow uplink can take longer than a text's whole send.
 * Timing out mid-upload would report a failure for a message that then
 * arrives — and the campaign would record it as not sent. */
const MEDIA_SEND_TIMEOUT_MS = 90_000;
/** Sent messages remembered per shop so a customer's phone can ask for one
 * again — see Session.recentSent. */
const RECENT_SENT_MAX = 200;
const LOGOUT_TIMEOUT_MS = 5_000;
/** Upper bound on waiting for pending pairing writes to reach disk. */
const CREDS_FLUSH_TIMEOUT_MS = 10_000;
const RESTORE_STAGGER_MS = 1_500;
/**
 * How often live sessions are checked against the plan and the switch, and
 * linked shops that should be running but are not are started again. This is
 * what ends a socket whose plan lapsed while it was healthy, and what brings a
 * shop back after a renewal or once a slot under the session cap frees up.
 */
const SWEEP_EVERY_MS = 15 * 60 * 1000;

/**
 * Ceilings on AUTOMATED sends from one shop's number (order messages, via
 * trySendFromShop). Checkout is a public route, so without them anyone could
 * script orders and make a shop's own number message strangers at request
 * rate — the pattern that gets a number banned. Over a ceiling the message
 * falls back to the caller's other channel instead. Generous for a real shop;
 * WHATSAPP_SHOP_SENDS_PER_10_MIN / WHATSAPP_SHOP_SENDS_PER_DAY raise them.
 */
const AUTO_SENDS_PER_10_MIN = 30;
const AUTO_SENDS_PER_DAY = 300;
/** One customer gets an order confirmation and a status update or two, not
 * a stream — this caps what one recipient can be sent from one shop. */
const AUTO_SENDS_PER_RECIPIENT_PER_HOUR = 5;
/** Alerts to a shop's own owner, per shop, in an allowance of their own
 * (notify()). A busy hour of orders fits; a scripted flood of checkouts
 * does not. */
const OWNER_ALERTS_PER_HOUR = 60;
/** Notifications one outside party can set off per shop (a supplier's
 * replies) — room for a real negotiation across several products. */
const AUTO_SENDS_PER_CAUSE_PER_HOUR = 20;
/** Shop alerts the PLATFORM number sends, across all shops. Overridable with
 * WHATSAPP_PLATFORM_ALERTS_PER_10_MIN. */
const PLATFORM_ALERTS_PER_10_MIN = 120;
/** How long a platform-routed owner alert is given before it is reported as
 * slow — past Baileys' own 60 s lookups, since every caller runs in the
 * background and a premature fallback would deliver the alert twice. */
const PLATFORM_SEND_TIMEOUT_MS = 150_000;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Rejected before digits are counted: a local number with no country code. */
const NEEDS_COUNTRY_CODE = "Include the country code, e.g. +91 98765 43210";

// The sentences the panel shows. Kept together so the wording stays consistent
// and so none of them can ever carry a QR string or a full phone number.
const MSG = {
  capacity:
    "WhatsApp capacity on this server is full. Please contact support.",
  relink:
    "WhatsApp needs to be linked again. Click Link WhatsApp and scan the new code.",
  unlinked:
    "This phone was unlinked from WhatsApp. Link again to keep sending.",
  replaced:
    "This WhatsApp link was opened somewhere else. Click Reconnect to take it back.",
  forbidden:
    "WhatsApp refused this number (it may be restricted). Check the phone.",
  qrExpired:
    "The QR code expired before it was scanned. Click Show QR code when you are ready.",
  // Fixed sentences, not templates: the panel translates lastError by looking
  // the exact English up in the Hindi and Gujarati dictionaries, so a code or
  // an exception message spliced in would always show in English — and an
  // exception message can carry a server path. The detail goes to the log.
  linkUnreachable:
    "Could not reach WhatsApp to start linking. Click Show QR code to try again.",
  startFailed:
    "Could not start WhatsApp. Please try again, or contact support if it keeps happening.",
  reconnecting: "Reconnecting after a dropped connection…",
  slowRetry:
    "WhatsApp has not been reachable for a while. Trying again every 5 minutes — or click Reconnect to try now.",
  planEnded:
    "WhatsApp Connection is not part of this shop's current plan, so nothing is sent from this number. It reconnects on its own once the plan includes it again.",
  notConnected:
    "WhatsApp is not connected. Link your phone in Settings › WhatsApp first.",
} as const;

/** One shop's live session. Exists only in memory; the pairing is on disk. */
type Session = {
  shopId: string;
  sock: WASocket | null;
  /** Which socket is the current one — see the class note. */
  generation: number;
  status: ShopWhatsappStatus;
  qrDataUrl: string | null;
  qrExpiresAt: Date | null;
  /** QRs rendered by the current socket; the first lives longer. */
  qrCount: number;
  number: string | null;
  connectedAt: Date | null;
  lastError: string | null;
  /** Reconnects since the last successful open. */
  retries: number;
  retryTimer: NodeJS.Timeout | null;
  /**
   * Single-flight: a double click, or a retry landing mid-connect. Owned by
   * the attempt that set it — a stop releases it at once (see stopSocket), so
   * an attempt it cancelled cannot swallow the next click while it winds down.
   */
  starting: boolean;
  /** A person asked for THIS attempt, so a QR may be shown for it. */
  interactive: boolean;
  /**
   * Stopped in a state only a person can fix — unlinked from the phone, taken
   * over elsewhere, refused by WhatsApp, a pairing that is no longer accepted.
   * The periodic sweep leaves these alone; it only restarts shops that
   * stopped for reasons that clear by themselves (the plan, the session cap).
   * Any click on the panel clears it.
   */
  needsPerson: boolean;
  /**
   * Every pairing write, chained. The close handler waits on it before
   * deciding anything, because right after a scan Baileys emits the new
   * credentials and then closes with 515: deciding before they reach disk
   * would read the folder as "never paired" and treat a successful scan as an
   * expired QR.
   */
  credsWrite: Promise<void>;
  /**
   * The last messages this shop sent, by message id. When a customer's phone
   * cannot decrypt one it asks the sender to send it again, and Baileys looks
   * the original up through `getMessage`; with nothing to return, the customer
   * is left looking at "Waiting for this message" for good. Kept on the
   * session rather than the socket so a reconnect in between still answers.
   */
  recentSent: Map<string, proto.IMessage>;
};

type BaileysLogger = NonNullable<UserFacingSocketConfig["logger"]>;

/**
 * The platform's own WhatsApp number (the OTP socket in otp.service.ts),
 * registered by OtpService at startup. Injected this way round so this
 * module stays a leaf that anything can import without a cycle.
 */
export type PlatformWhatsappSender = {
  /** True only while the platform socket is actually open. */
  isConnected(): boolean;
  send(phone: string, text: string): Promise<void>;
};

/**
 * How notifyRoute() delivered a message:
 *  - `platform` — from the platform's number (rings);
 *  - `shop`     — from the shop's own number to someone else (rings);
 *  - `self`     — from the shop's own number to that same number, so it sits
 *                 in "Message yourself" WITHOUT a notification.
 */
export type NotifyRoute = "platform" | "shop" | "self";

/** One campaign message: a text, or one image with the text as its caption
 * (WhatsApp limits a caption to 1024 characters; the caller checks). */
export type CampaignMessageContent =
  | { text: string }
  | { image: Buffer; caption: string; mimetype?: string };

/** How long a recorded owner-alert outcome is kept (see trackOwnerAlert). */
const OWNER_ALERT_OUTCOME_TTL_MS = 15 * 60 * 1000;

/** What notify() is asked to send. */
export type ShopNotification = {
  shopId: string;
  /** The recipient's WhatsApp number, as stored; nothing is sent without one. */
  to: string | null | undefined;
  text: string;
  /** The shop's country, for numbers stored without a country code. */
  country?: string;
  /**
   * The recipient is the shop's own owner (a new-order alert, a supplier's
   * quote). See notify() for why that changes which number sends it.
   */
  toShopOwner?: boolean;
  /**
   * Who caused this message, when that is not the recipient — e.g.
   * `supplier:<id>` for a supplier's reply alerting the owner. Owner alerts
   * skip the per-recipient ceiling, so without this one outside party could
   * trigger them without limit and spend the shop's whole budget. With it,
   * the same ceiling applies per cause instead, in its own counter.
   */
  throttleKey?: string;
  /**
   * The shop's own signed-in action set this off (it approved a quote,
   * recorded a payment), so the recipient is not capped per hour — a normal
   * busy hour with one supplier would otherwise lose updates. The shop-wide
   * ceilings still apply.
   */
  shopInitiated?: boolean;
};

@Injectable()
export class ShopWhatsappService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ShopWhatsappService.name);
  private readonly sessions = new Map<string, Session>();

  /**
   * Baileys' own logging, silenced by default.
   *
   * Given no `logger`, Baileys builds a pino instance at `info` and narrates
   * the protocol — including counterparty JIDs, which are phone numbers. With
   * one socket per shop that would put every shop's customers' numbers in the
   * server log. WHATSAPP_LOG_LEVEL turns it back up when a connection needs
   * diagnosing (`warn` is the useful middle setting); at every level, runs of
   * seven or more digits are cut to their last four before they are written.
   * Built here rather than at import time because main.ts loads .env after
   * the imports have run.
   */
  private readonly baileysLogger: BaileysLogger;

  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;

  /** Automated sends per shop (timestamps, last 24 h) and per shop+recipient
   * (last hour) — see AUTO_SENDS_PER_10_MIN. */
  private readonly autoSends = new Map<string, number[]>();
  private readonly autoSendsTo = new Map<string, number[]>();
  /** When each shop last had a limited send logged, so an attack produces one
   * warning per shop every ten minutes rather than one per request. */
  private readonly limitWarnedAt = new Map<string, number>();

  /** See PlatformWhatsappSender. Null until OtpService registers. */
  private platformSender: PlatformWhatsappSender | null = null;
  /** Shop alerts the platform number sent (timestamps, last 10 minutes) —
   * see takePlatformSlot(). */
  private platformAlerts: number[] = [];
  /** Owner-alert outcomes by event key — see trackOwnerAlert(). */
  private readonly ownerAlerts = new Map<
    string,
    { at: number; outcome: Promise<NotifyRoute | null> }
  >();

  /** The WhatsApp Web version to announce, shared by every shop's socket. */
  private version: { value: WAVersion | null; until: number } | null = null;
  private versionInFlight: Promise<WAVersion | null> | null = null;

  /** Set on shutdown so the restore loop and pending retries stand down. */
  private shuttingDown = false;

  constructor(
    @InjectModel(ShopWhatsapp.name)
    private readonly model: Model<ShopWhatsapp>,
    private readonly access: SubscriptionAccessService,
  ) {
    this.baileysLogger = makeBaileysLogger(
      process.env.WHATSAPP_LOG_LEVEL || "silent",
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Reconnect every shop that was linked and switched on before the restart.
   *
   * Not awaited, deliberately: restoring is network work against a third
   * party, and nothing about it may delay the API coming up or, if it fails,
   * stop it coming up at all.
   */
  onApplicationBootstrap() {
    void this.resumeLinkedShops().catch((err) => {
      this.logger.warn(`WhatsApp restore did not run: ${safeDescribe(err)}`);
    });
    this.sweepTimer = setInterval(() => {
      void this.sweep().catch((err) => {
        this.logger.warn(`WhatsApp sweep failed: ${safeDescribe(err)}`);
      });
    }, SWEEP_EVERY_MS);
    this.sweepTimer.unref?.();
  }

  /**
   * Runs on shutdown because main.ts calls enableShutdownHooks(): without it
   * a pm2 restart killed the process mid pairing-write, and a truncated
   * pairing is a shop that has to scan again.
   */
  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    const pending: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      // End, never log out: a restart must not unlink anybody's phone.
      this.stopSocket(session);
      pending.push(session.credsWrite);
    }
    await withTimeout(
      Promise.all(pending),
      CREDS_FLUSH_TIMEOUT_MS,
      "flushing WhatsApp pairings",
    ).catch(() => undefined);
  }

  /**
   * Start every shop that is switched on, linked, in its plan and not already
   * running — at boot, and again from each sweep.
   *
   * Shops are started one after another with a short gap, not all at once: a
   * few hundred simultaneous logins from one IP is exactly the pattern
   * WhatsApp treats as abuse, and it would spike memory on boot.
   *
   * Only shops that are PAIRED on disk are started. An unpaired shop would
   * need a QR, and a QR nobody asked for is one nobody is watching. Shops
   * stopped in a state only a person can fix (`needsPerson`) are left alone.
   */
  private async resumeLinkedShops() {
    const records = await this.model
      .find({ enabled: true })
      .select("shopkeeperId")
      .lean();
    let started = 0;
    for (const record of records) {
      if (this.shuttingDown) return;
      const id = String(record.shopkeeperId || "");
      try {
        if (!SHOP_ID.test(id) || !this.isPaired(id)) continue;
        const existing = this.sessions.get(id);
        if (existing?.needsPerson || existing?.retryTimer) continue;
        if (this.hasLiveSocket(id)) continue;

        // The list above was read once, and working through it takes a while
        // — so the shopkeeper may switch this shop off, or start it by hand,
        // before its turn comes. The generation is noted BEFORE the awaits
        // and the switch re-read AFTER it: a switch-off that lands after the
        // note bumps the generation (suspend always does), and one that landed
        // before it had already saved `enabled: false`, which the re-read
        // sees. Nothing is awaited between the last check and connect()'s own
        // generation bump.
        const session = this.sessionFor(id);
        const generation = session.generation;
        if (!(await this.access.isEnabled(id, FEATURE))) continue;
        if (!(await this.isSwitchedOn(id))) continue;
        if (
          this.shuttingDown ||
          session.generation !== generation ||
          session.needsPerson ||
          session.retryTimer ||
          this.hasLiveSocket(id)
        ) {
          continue;
        }
        await this.connect(id, { interactive: false });
        started += 1;
        await sleep(RESTORE_STAGGER_MS);
      } catch (err) {
        this.logger.warn(
          `WhatsApp could not start shop ${id}: ${safeDescribe(err)}`,
        );
      }
    }
    if (started > 0) {
      this.logger.log(`WhatsApp: reconnecting ${started} linked shop(s).`);
    }
  }

  /**
   * The periodic check (every SWEEP_EVERY_MS).
   *
   * First, every live socket is held to the plan and the switch. A healthy
   * connection can stay up for weeks, and nothing else looks at the plan
   * while it does — so without this a shop whose add-on lapsed would keep a
   * linked device on the server, decrypting its messages, for as long as its
   * network held. Its pairing is kept; it is only paused.
   *
   * Then shops that should be running and are not are started again: a
   * renewed plan, a slot freed under the session cap. Old send counters are
   * pruned on the way.
   */
  private async sweep() {
    if (this.sweeping || this.shuttingDown) return;
    this.sweeping = true;
    try {
      for (const session of [...this.sessions.values()]) {
        if (this.shuttingDown) return;
        if (!session.sock && !session.starting) continue;
        const id = session.shopId;
        const generation = session.generation;
        try {
          const switchedOn = await this.isSwitchedOn(id);
          const inPlan =
            switchedOn && (await this.access.isEnabled(id, FEATURE));
          // Somebody acted on this shop while the checks ran; theirs wins.
          if (session.generation !== generation) continue;
          if (!switchedOn) await this.suspend(id);
          else if (!inPlan) this.pauseForPlan(session);
        } catch (err) {
          this.logger.warn(
            `WhatsApp sweep could not check shop ${id}: ${safeDescribe(err)}`,
          );
        }
      }
      this.pruneSendCounters(Date.now());
      await this.resumeLinkedShops();
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Stop a shop whose plan no longer includes the add-on. The pairing is
   * kept and the sweep starts it again once the plan does — so this is not a
   * state a person has to clear.
   */
  private pauseForPlan(session: Session) {
    this.logger.log(
      `WhatsApp for shop ${session.shopId}: paused, the plan no longer includes it.`,
    );
    this.stopSocket(session);
    this.settle(session, MSG.planEnded, { needsPerson: false });
    session.connectedAt = null;
    session.qrDataUrl = null;
    session.qrExpiresAt = null;
  }

  // ── Reading state ────────────────────────────────────────────────────────

  async getState(shopId: string): Promise<ShopWhatsappState> {
    const id = assertShopId(shopId);
    const record = await this.model
      .findOne({ shopkeeperId: id })
      .select("enabled number")
      .lean();
    const enabled = !!record?.enabled;
    // The number is only reported while the pairing that produced it is still
    // on disk; a record left behind by a wipe must not claim a link.
    const savedNumber = () =>
      record?.number && this.isPaired(id) ? String(record.number) : null;

    const session = this.sessions.get(id);
    // A session with nothing running for a shop that is switched off (e.g.
    // one that was unlinked while off) has nothing to report beyond "off".
    const idle =
      !session ||
      session.status === "off" ||
      (!enabled && !session.sock && !session.starting && !session.retryTimer);
    if (idle) {
      return {
        enabled,
        status: enabled ? "disconnected" : "off",
        qr: null,
        qrExpiresAt: null,
        number: savedNumber(),
        connectedAt: null,
        lastError: null,
      };
    }

    // "Not part of the plan" stops being true the moment the shop renews, but
    // the sweep that restarts it runs every fifteen minutes; until then the
    // panel should offer Reconnect, not repeat an out-of-date reason.
    let lastError = session.lastError;
    if (
      lastError === MSG.planEnded &&
      (await this.access.isEnabled(id, FEATURE))
    ) {
      lastError = null;
    }

    const awaitingScan = session.status === "awaiting-scan";
    return {
      enabled,
      status: session.status,
      qr: awaitingScan ? session.qrDataUrl : null,
      qrExpiresAt:
        awaitingScan && session.qrExpiresAt
          ? session.qrExpiresAt.toISOString()
          : null,
      number: session.number ?? savedNumber(),
      connectedAt:
        session.status === "connected" && session.connectedAt
          ? session.connectedAt.toISOString()
          : null,
      lastError,
    };
  }

  /** True only when a message would actually go out. */
  isConnected(shopId: string): boolean {
    const session = this.sessions.get(String(shopId ?? ""));
    return !!session && session.status === "connected" && !!session.sock;
  }

  /** The shopkeeper's switch, as stored. */
  async isSwitchedOn(shopId: string): Promise<boolean> {
    const id = assertShopId(shopId);
    const record = await this.model
      .findOne({ shopkeeperId: id })
      .select("enabled")
      .lean();
    return !!record?.enabled;
  }

  async setEnabled(shopId: string, enabled: boolean): Promise<void> {
    const id = assertShopId(shopId);
    await this.model.updateOne(
      { shopkeeperId: id },
      { $set: { enabled } },
      { upsert: true },
    );
  }

  // ── Connecting ───────────────────────────────────────────────────────────

  /**
   * Open a session for a shop. Returns once the socket exists — pairing is
   * asynchronous, and the panel polls getState() for the QR.
   *
   * `interactive` says a person asked for this attempt, which is the only
   * thing that allows a QR to be shown. `resetRetries` defaults to the same:
   * a deliberate connect is a fresh start, not a continuation of an earlier
   * backoff, while the restart after a scan must not reset a count it never
   * added to.
   */
  async connect(
    shopId: string,
    opts: { interactive: boolean; resetRetries?: boolean },
  ): Promise<void> {
    const id = assertShopId(shopId);
    if (this.shuttingDown) return;
    const session = this.sessionFor(id);

    // A person acting on the panel is the fix for any state that was waiting
    // for one.
    if (opts.interactive) session.needsPerson = false;

    // A socket already opening, or already showing a QR, IS the attempt being
    // asked for. Replacing it would throw away the code on screen, and a
    // script calling this in a loop would open a fresh WhatsApp login per
    // request from the server's one IP — which WhatsApp answers by throttling
    // every shop on it. A person asking still deserves their QR, so the
    // attempt in flight is promoted instead.
    if (
      session.starting ||
      (session.sock &&
        (session.status === "connecting" ||
          session.status === "awaiting-scan"))
    ) {
      if (opts.interactive) session.interactive = true;
      return;
    }
    if (this.isConnected(id)) return;

    if (this.otherLiveSockets(session) >= maxSessions()) {
      this.logger.warn(
        `WhatsApp for shop ${id} not started: the server is at its limit of ${maxSessions()} sessions (WHATSAPP_MAX_SHOP_SESSIONS).`,
      );
      // Not a state a person has to clear: the sweep tries again once a slot
      // frees up (a linked shop, that is — an unlinked one needs a click and a
      // QR anyway).
      this.settle(session, MSG.capacity, { needsPerson: false });
      return;
    }

    session.starting = true;
    let myGeneration = -1;
    try {
      this.clearRetry(session);
      // A previous socket, if any, is replaced rather than left running.
      this.teardown(session);

      myGeneration = ++session.generation;
      session.status = "connecting";
      session.lastError = null;
      session.qrDataUrl = null;
      session.qrExpiresAt = null;
      session.qrCount = 0;
      session.connectedAt = null;
      session.interactive = opts.interactive;
      if (opts.resetRetries ?? opts.interactive) session.retries = 0;

      const dir = this.authDirFor(id);
      await mkdir(dir, { recursive: true });
      if (this.superseded(session, myGeneration)) return;

      // The previous socket's last pairing write may still be in flight;
      // reading the folder before it lands would start from stale keys.
      await withTimeout(
        session.credsWrite,
        CREDS_FLUSH_TIMEOUT_MS,
        "saving the WhatsApp pairing",
      ).catch(() => undefined);
      if (this.superseded(session, myGeneration)) return;

      // Only the state: its saveCreds is replaced by the atomic write below.
      const { state } = await useMultiFileAuthState(dir);
      if (this.superseded(session, myGeneration)) return;

      const version = await this.baileysVersion();
      if (this.superseded(session, myGeneration)) return;

      const sock = makeWASocket({
        // Spread rather than `version,` — an explicit `undefined` would
        // override Baileys' own bundled default with nothing, the opposite
        // of the fallback baileysVersion() intends.
        ...(version ? { version } : {}),
        auth: state,
        // Silent unless asked otherwise — the default prints phone numbers.
        logger: this.baileysLogger,
        // The QR goes to the shopkeeper's panel, never the server terminal.
        printQRInTerminal: false,
        // What the phone lists under Linked devices, so a shopkeeper auditing
        // them knows what this one is.
        browser: ["KiosCart", "Chrome", "1.0.0"],
        // Nothing here reads chat history. Syncing it on every connect costs
        // minutes, memory and bandwidth per shop for data that is discarded.
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        // This is the shopkeeper's own WhatsApp, so the socket is handed all
        // of their traffic — every group, status update and channel post —
        // and decrypts each one only for nothing here to read it. With a
        // socket per shop that is real CPU on the server. Direct chats still
        // come through, which keeps retry requests and receipts working.
        shouldIgnoreJid: (jid) =>
          !!(isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid)),
        // Answers a customer's phone asking for a message again.
        getMessage: async (key) =>
          (key.id && session.recentSent.get(key.id)) || undefined,
        // Leaves the shopkeeper's phone getting notifications as usual.
        markOnlineOnConnect: false,
      });

      // The last and most important check. Between the awaits above and here,
      // suspend() or disconnect() may have run — they bump the generation and
      // tear down `session.sock`, but this socket did not exist yet, so there
      // was nothing for them to tear down. Publishing it now would leave a
      // live WhatsApp socket that nothing owns and nothing can stop: its
      // events are ignored by the generation check, so it is invisible, and it
      // keeps the device linked after the shop was told it was off.
      if (this.superseded(session, myGeneration)) {
        try {
          sock.end(undefined);
        } catch {
          // Already dead is the outcome we wanted.
        }
        return;
      }

      session.sock = sock;
      // Baileys' own saveCreds rewrites creds.json in place, so a process
      // killed mid-write — a crash, an OOM, a restart that does not wait —
      // leaves it truncated, and a truncated pairing is a shop that has to
      // scan again. Written beside it and renamed over it instead, which is
      // atomic. The other key files stay Baileys' own: losing one costs a
      // re-negotiated chat session, not the link. `state.creds` is the object
      // Baileys updates before this listener runs.
      const credsFile = join(dir, "creds.json");
      const credsTemp = join(dir, "creds.json.tmp");
      sock.ev.on("creds.update", () => {
        // Chained, so writes land in order and the close handler can wait for
        // all of them. Caught, because the write targets a folder that
        // disconnect() may have just deleted, and an unhandled rejection from
        // an event listener takes the process down.
        session.credsWrite = session.credsWrite
          .then(async () => {
            await writeFile(
              credsTemp,
              JSON.stringify(state.creds, BufferJSON.replacer),
            );
            await rename(credsTemp, credsFile);
          })
          .catch((err) => {
            this.logger.warn(
              `Could not save the WhatsApp pairing for shop ${id}: ${safeDescribe(err)}`,
            );
          });
      });
      const generation = myGeneration;
      sock.ev.on("connection.update", (update) => {
        // Events from a socket that has been superseded are not this session's.
        if (generation !== session.generation) return;
        void this.onConnectionUpdate(session, sock, update, generation).catch(
          (err) => {
            this.logger.error(
              `WhatsApp event handling failed for shop ${id}: ${safeDescribe(err)}`,
            );
          },
        );
      });
    } catch (err) {
      const bumped = myGeneration !== -1;
      if (bumped && this.superseded(session, myGeneration)) return;
      session.status = "disconnected";
      session.lastError = MSG.startFailed;
      this.logger.error(
        `WhatsApp connect failed for shop ${id}: ${safeDescribe(err)}`,
      );
      // A background attempt has nobody to click Reconnect, so a paired shop
      // keeps its place in the retry loop rather than stopping for good on
      // one bad start.
      if (bumped && !opts.interactive && this.isPaired(id)) {
        this.scheduleRetry(session, myGeneration, undefined);
      }
    } finally {
      // Only the attempt that still owns the flag releases it. One that was
      // cancelled had its flag released by the stop that cancelled it, and a
      // newer attempt may hold it by now.
      if (myGeneration === -1 || !this.superseded(session, myGeneration)) {
        session.starting = false;
      }
    }
  }

  private async onConnectionUpdate(
    session: Session,
    sock: WASocket,
    update: Partial<ConnectionState>,
    myGeneration: number,
  ) {
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    if (qr) await this.onQr(session, sock, qr, myGeneration);

    if (isNewLogin && this.owns(session, sock, myGeneration)) {
      // The phone has scanned. Baileys now restarts the connection (515);
      // until it opens, the code on screen is spent and must not be shown.
      session.status = "connecting";
      session.qrDataUrl = null;
      session.qrExpiresAt = null;
    }

    if (connection === "open" && this.owns(session, sock, myGeneration)) {
      this.onOpen(session, sock);
    }

    if (connection === "close" && !this.superseded(session, myGeneration)) {
      await this.onClose(session, sock, lastDisconnect?.error, myGeneration);
    }
  }

  private async onQr(
    session: Session,
    sock: WASocket,
    qr: string,
    myGeneration: number,
  ) {
    const id = session.shopId;
    if (!this.owns(session, sock, myGeneration)) return;

    if (!session.interactive) {
      // Background work (a restore or a retry) was offered a QR, which means
      // the saved pairing is no longer accepted. Nobody is watching, so
      // rendering it would only start a cycle of codes expiring unseen. Stop,
      // and let the shopkeeper start a pairing they can actually scan.
      this.logger.warn(
        `WhatsApp for shop ${id}: the saved link was not accepted — stopping until the shop links again.`,
      );
      this.stopSocket(session);
      this.settle(session, MSG.relink);
      session.qrDataUrl = null;
      session.qrExpiresAt = null;
      session.connectedAt = null;
      return;
    }

    session.qrCount += 1;
    const first = session.qrCount === 1;
    try {
      const dataUrl = await qrcode.toDataURL(qr, { margin: 1, width: 288 });
      // Rendering is async. A suspend, unlink, or close landing during it
      // would otherwise have its cleared QR overwritten by this one — the
      // panel would show a live pairing code for a session that has stopped.
      if (!this.owns(session, sock, myGeneration)) return;
      session.qrDataUrl = dataUrl;
      session.qrExpiresAt = new Date(
        Date.now() + (first ? FIRST_QR_MS : NEXT_QR_MS),
      );
      session.status = "awaiting-scan";
      if (first) {
        this.logger.log(`WhatsApp QR ready for shop ${id} — waiting for a scan.`);
      }
    } catch (err) {
      if (!this.owns(session, sock, myGeneration)) return;
      session.lastError = "Could not draw the QR code. Please try again.";
      this.logger.error(
        `WhatsApp QR render failed for shop ${id}: ${safeDescribe(err)}`,
      );
    }
  }

  private onOpen(session: Session, sock: WASocket) {
    const id = session.shopId;
    session.status = "connected";
    session.qrDataUrl = null;
    session.qrExpiresAt = null;
    session.connectedAt = new Date();
    session.lastError = null;
    session.retries = 0;
    session.interactive = false;
    // `id` arrives as "<digits>:<device>@s.whatsapp.net"; the part before the
    // colon is the number the customer will see as the sender.
    const number = sock.user?.id?.split(":")[0]?.split("@")[0] || null;
    session.number = number;
    this.logger.log(`WhatsApp connected for shop ${id} as ${mask(number)}.`);
    if (number) {
      void this.recordLinked(id, number).catch((err) => {
        this.logger.warn(
          `Could not record the WhatsApp link for shop ${id}: ${safeDescribe(err)}`,
        );
      });
    }
  }

  /**
   * A socket closed on its own (deliberate stops bump the generation first,
   * so their close never reaches here). What happens next depends on why,
   * and on whether the shop is paired — see the branches below. The table is
   * whatsapp-plugin/docs/DESIGN.md §6.
   */
  private async onClose(
    session: Session,
    sock: WASocket,
    error: unknown,
    myGeneration: number,
  ) {
    const id = session.shopId;
    const code = statusCodeOf(error);

    // This socket is finished. Detached synchronously, so nothing tries to
    // send on it while the decision below waits on the disk.
    if (session.sock === sock) session.sock = null;
    try {
      sock.ev.removeAllListeners("creds.update");
    } catch {
      // A dead socket's emitter is not worth failing over.
    }
    session.qrDataUrl = null;
    session.qrExpiresAt = null;
    session.connectedAt = null;
    session.status = "connecting";

    // Wait for the pairing writes: see Session.credsWrite for why the
    // decision is wrong without them.
    await withTimeout(
      session.credsWrite,
      CREDS_FLUSH_TIMEOUT_MS,
      "saving the WhatsApp pairing",
    ).catch(() => undefined);
    if (this.superseded(session, myGeneration)) return;

    // 515 is not a failure. WhatsApp asks for it right after a successful
    // scan, and the fresh socket logs in with the credentials just saved.
    // It keeps `interactive` (the person who scanned is still watching), does
    // not count as a retry, and shows no error.
    if (code === DisconnectReason.restartRequired) {
      // WhatsApp can also ask for a restart on a long-lived connection, and
      // this path skips retry()'s checks — so the plan is checked here too,
      // or a shop whose add-on lapsed would be restarted indefinitely.
      const inPlan = await this.access
        .isEnabled(id, FEATURE)
        .catch(() => true);
      if (this.superseded(session, myGeneration)) return;
      if (!inPlan) {
        this.pauseForPlan(session);
        return;
      }
      this.logger.log(`WhatsApp for shop ${id}: restarting after linking.`);
      void this.connect(id, {
        interactive: session.interactive,
        resetRetries: false,
      }).catch((err) => {
        this.logger.error(
          `WhatsApp restart failed for shop ${id}: ${safeDescribe(err)}`,
        );
      });
      return;
    }

    // The pairing is gone — unlinked from the phone, or no longer valid for
    // this device. Keeping the credentials would make every future connect
    // fail the same way, so they are wiped and the next link starts clean.
    if (
      code === DisconnectReason.loggedOut ||
      code === DisconnectReason.multideviceMismatch
    ) {
      this.logger.warn(
        `WhatsApp for shop ${id} was unlinked (code ${code}) — clearing its pairing.`,
      );
      this.clearRetry(session);
      this.clearAuthFolder(id);
      this.settle(session, MSG.unlinked);
      session.number = null;
      void this.recordUnlinked(id).catch((err) => {
        this.logger.warn(
          `Could not clear the WhatsApp link record for shop ${id}: ${safeDescribe(err)}`,
        );
      });
      return;
    }

    // Another client took over this linked device. Reconnecting would take
    // it back, which kicks the other one off, which reconnects… Two owners
    // fighting forever is worse than stopping; the shopkeeper decides.
    if (code === DisconnectReason.connectionReplaced) {
      this.logger.warn(`WhatsApp for shop ${id} was replaced by another session.`);
      this.settle(session, MSG.replaced);
      return;
    }

    // Refused outright — typically a restricted or banned number. Retrying
    // would look like exactly the behaviour that got it refused.
    if (code === DisconnectReason.forbidden) {
      this.logger.warn(`WhatsApp refused shop ${id} (403).`);
      this.settle(session, MSG.forbidden);
      return;
    }

    // Not paired: a pairing attempt ended — the QR ran out of refreshes
    // (408 "QR refs attempts ended") or the connection dropped before a scan.
    // Retrying would mean a new QR nobody asked for; the shopkeeper clicks
    // again when they are ready.
    if (!this.isPaired(id)) {
      if (session.qrCount === 0) {
        this.logger.warn(
          `WhatsApp for shop ${id}: linking ended before a QR (code ${code ?? "unknown"}).`,
        );
      }
      this.settle(
        session,
        session.qrCount > 0 ? MSG.qrExpired : MSG.linkUnreachable,
      );
      return;
    }

    // 405 is WhatsApp rejecting the client version; the cached one is stale.
    if (code === 405) this.version = null;

    // Paired, and dropped for an ordinary reason (428, 408, 500, 503, …).
    this.scheduleRetry(session, myGeneration, code);
  }

  /**
   * Stop in `disconnected` with an explanation, and no retry. By default the
   * shop then waits for a person (see Session.needsPerson); pass
   * `needsPerson: false` for a reason that clears by itself, so the sweep
   * starts it again.
   */
  private settle(
    session: Session,
    lastError: string,
    opts: { needsPerson?: boolean } = {},
  ) {
    this.clearRetry(session);
    session.status = "disconnected";
    session.interactive = false;
    session.lastError = lastError;
    session.needsPerson = opts.needsPerson ?? true;
  }

  /**
   * Reconnect a paired shop later: 2s, 4s, 8s, 16s, 32s, then every five
   * minutes for as long as the shop wants it and pays for it.
   *
   * During the slow phase the panel reports `disconnected` with a Reconnect
   * button instead of a spinner, so a shopkeeper looking at it can try at
   * once rather than watch a spinner for five minutes (and the panel polls
   * slowly instead of every two seconds). Retries are never interactive:
   * they reconnect from the saved pairing or stop, and never show a QR.
   */
  private scheduleRetry(
    session: Session,
    myGeneration: number,
    code: number | undefined,
  ) {
    const id = session.shopId;
    this.clearRetry(session);
    session.interactive = false;
    const fast = session.retries < FAST_RETRIES;
    const wait = fast ? 2000 * 2 ** session.retries : SLOW_RETRY_MS;
    const slowIndex = session.retries - FAST_RETRIES;
    session.retries += 1;

    if (fast) {
      session.status = "connecting";
      session.lastError = MSG.reconnecting;
    } else {
      session.status = "disconnected";
      session.lastError = MSG.slowRetry;
    }
    if (fast || slowIndex % SLOW_RETRY_LOG_EVERY === 0) {
      this.logger.warn(
        `WhatsApp for shop ${id} closed (code ${code ?? "unknown"}). Retry ${session.retries} in ${Math.round(wait / 1000)}s.`,
      );
    }

    const timer = setTimeout(() => {
      if (session.retryTimer === timer) session.retryTimer = null;
      // A manual reconnect, a switch-off or an unlink in the meantime
      // supersedes this retry.
      if (this.superseded(session, myGeneration) || this.shuttingDown) return;
      void this.retry(session, myGeneration);
    }, wait);
    timer.unref?.();
    session.retryTimer = timer;
  }

  private async retry(session: Session, myGeneration: number) {
    const id = session.shopId;
    try {
      // Checked before EVERY attempt, not once: a shop that switched the
      // feature off, or whose plan lapsed, must not keep a socket open (and
      // its number linked) that it is no longer paying for.
      const switchedOn = await this.isSwitchedOn(id);
      const inPlan = switchedOn && (await this.access.isEnabled(id, FEATURE));
      if (this.superseded(session, myGeneration) || this.shuttingDown) return;
      if (!switchedOn) {
        this.clearRetry(session);
        session.status = "off";
        session.lastError = null;
        return;
      }
      if (!inPlan) {
        // Paused, not stopped for good: the sweep resumes it after a renewal.
        this.pauseForPlan(session);
        return;
      }
      await this.connect(id, { interactive: false });
    } catch (err) {
      // A failed check (a database blip) is not a reason to stop for good.
      if (this.superseded(session, myGeneration) || this.shuttingDown) return;
      this.logger.warn(
        `WhatsApp retry check failed for shop ${id}: ${safeDescribe(err)}`,
      );
      this.scheduleRetry(session, myGeneration, undefined);
    }
  }

  // ── Stopping ─────────────────────────────────────────────────────────────

  /**
   * The shopkeeper switched it off. Ends the socket but KEEPS the pairing, so
   * switching it back on reconnects without the phone.
   */
  async suspend(shopId: string): Promise<void> {
    const id = assertShopId(shopId);
    // Created if missing, so the stop is always recorded as a new generation:
    // a boot restore that has this shop further down its list checks for
    // exactly that before it starts it.
    const session = this.sessionFor(id);
    this.stopSocket(session);
    session.status = "off";
    session.qrDataUrl = null;
    session.qrExpiresAt = null;
    session.connectedAt = null;
    session.lastError = null;
    session.interactive = false;
    await withTimeout(
      session.credsWrite,
      CREDS_FLUSH_TIMEOUT_MS,
      "saving the WhatsApp pairing",
    ).catch(() => undefined);
  }

  /**
   * Unlink. Tells WhatsApp to drop the linked device where it can, then clears
   * the local pairing either way — a logout that failed on the network must
   * not leave credentials behind that the shopkeeper believes are gone.
   */
  async disconnect(shopId: string): Promise<void> {
    const id = assertShopId(shopId);
    const session = this.sessionFor(id);
    this.clearRetry(session);
    // Bumped first: the close that logout() triggers is then stale, and is
    // ignored instead of being handled as an unexpected drop. An attempt that
    // was mid-start is cancelled by the same bump, so its flag is released
    // here rather than left to swallow the next Link click.
    session.generation += 1;
    session.starting = false;

    const sock = session.sock;
    if (sock && session.status === "connected") {
      try {
        await withTimeout(sock.logout(), LOGOUT_TIMEOUT_MS, "WhatsApp logout");
      } catch (err) {
        this.logger.warn(
          `WhatsApp logout for shop ${id} failed, clearing locally: ${safeDescribe(err)}`,
        );
      }
    }
    this.teardown(session);
    // Let any last pairing write finish before the folder goes, or it would
    // fail against a deleted directory mid-write.
    await withTimeout(
      session.credsWrite,
      CREDS_FLUSH_TIMEOUT_MS,
      "saving the WhatsApp pairing",
    ).catch(() => undefined);
    this.clearAuthFolder(id);

    session.status = "disconnected";
    session.number = null;
    session.connectedAt = null;
    session.qrDataUrl = null;
    session.qrExpiresAt = null;
    session.qrCount = 0;
    session.lastError = null;
    session.retries = 0;
    session.interactive = false;
    session.needsPerson = false;
    // Those messages went out as the number just unlinked; a phone linked
    // next is somebody else and must never resend them.
    session.recentSent.clear();

    try {
      await this.recordUnlinked(id);
    } catch (err) {
      this.logger.warn(
        `Could not clear the WhatsApp link record for shop ${id}: ${safeDescribe(err)}`,
      );
    }
  }

  /**
   * Bump the generation, cancel any retry, and end the socket. An attempt
   * that was mid-start is cancelled by the bump, so the single-flight flag is
   * released now: left to that attempt, it stays held until the attempt
   * notices — up to the version fetch's fifteen seconds — and a switch back on
   * in that window would be silently dropped.
   */
  private stopSocket(session: Session) {
    this.clearRetry(session);
    session.generation += 1;
    session.starting = false;
    this.teardown(session);
  }

  private teardown(session: Session) {
    const sock = session.sock;
    session.sock = null;
    if (!sock) return;
    try {
      // Drop every listener before ending, so the close this causes cannot
      // schedule a reconnect for a session being deliberately stopped.
      sock.ev.removeAllListeners("connection.update");
      sock.ev.removeAllListeners("creds.update");
      sock.end(undefined);
    } catch (err) {
      this.logger.warn(
        `WhatsApp teardown for shop ${session.shopId}: ${safeDescribe(err)}`,
      );
    }
  }

  private clearRetry(session: Session) {
    if (session.retryTimer) {
      clearTimeout(session.retryTimer);
      session.retryTimer = null;
    }
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  /**
   * A phone number as WhatsApp addresses it.
   *
   * Everything but digits goes. WhatsApp has no concept of a local number,
   * but customers type them anyway, so a number that was not written with a
   * "+" and is short enough to be local gets the shop's own calling code — a
   * customer ordering from an Indian shop who types "98765 43210" means +91.
   * A domestic trunk "0" (India and the UK write mobiles as 0…) and an
   * international "00" are dropped first for the same reason. Anything still
   * too short to be a full international number is refused rather than sent
   * somewhere unintended.
   */
  toJid(phone: string, countryCode?: string): string {
    const raw = String(phone ?? "").trim();
    let digits = raw.replace(/\D/g, "");
    if (!raw.startsWith("+")) {
      if (digits.startsWith("00")) {
        digits = digits.slice(2);
      } else {
        const calling = callingCodeFor(countryCode);
        if (calling) {
          const local = digits.startsWith("0") ? digits.slice(1) : digits;
          if (local.length > 0 && local.length <= 10) digits = calling + local;
        }
      }
    }
    if (digits.length < 8) throw new BadRequestException(NEEDS_COUNTRY_CODE);
    return `${digits}@s.whatsapp.net`;
  }

  /** Send one message from the shop's own number. Throws when the shop has no
   * live session, rather than queueing into a void. */
  async sendText(
    shopId: string,
    phone: string,
    text: string,
    country?: string,
  ): Promise<void> {
    const id = assertShopId(shopId);
    const sock = this.sessions.get(id)?.sock;
    if (!this.isConnected(id) || !sock) {
      throw new BadRequestException(MSG.notConnected);
    }
    const jid = this.toJid(phone, country);
    try {
      // Bounded: a socket that dies mid-send can leave this promise pending
      // forever, and the caller is an HTTP request or an order flow.
      const sent = await withTimeout(
        sock.sendMessage(jid, { text }),
        SEND_TIMEOUT_MS,
        "WhatsApp send",
      );
      this.rememberSent(id, sent);
    } catch (err) {
      this.logger.warn(
        `WhatsApp send from shop ${id} to ${mask(phone)} failed: ${safeDescribe(err)}`,
      );
      throw new ServiceUnavailableException(
        "WhatsApp did not send the message. Check that the phone has internet and try again.",
      );
    }
  }

  /**
   * Whether a number has a WhatsApp account, asked from the shop's own
   * session before a campaign message goes to it. Messaging numbers that are
   * not on WhatsApp is one of the signals that gets a sender flagged.
   *
   * The number is addressed BEFORE the try, on purpose: "no country code" is
   * a fact about the number, not the flaky lookup the catch exists to absorb,
   * and swallowed into `true` it would tell the campaign an unaddressable
   * string is a live account. It reaches the caller as a BadRequest. A lookup
   * that fails answers `true` (fail open), so a WhatsApp hiccup does not
   * silently drop a real customer — the send itself then decides.
   */
  async isOnWhatsapp(
    shopId: string,
    phone: string,
    country?: string,
  ): Promise<boolean> {
    const id = assertShopId(shopId);
    const sock = this.sessions.get(id)?.sock;
    if (!this.isConnected(id) || !sock) {
      throw new BadRequestException(MSG.notConnected);
    }
    const jid = this.toJid(phone, country);
    try {
      // Bounded like a send: the lookup is a query over the same socket, and
      // one that dies mid-query would hold the campaign loop forever.
      const results = await withTimeout(
        sock.onWhatsApp(jid),
        SEND_TIMEOUT_MS,
        "WhatsApp number lookup",
      );
      // `exists` is typed `unknown`, so only a literal true counts.
      return results?.[0]?.exists === true;
    } catch (err) {
      this.logger.warn(
        `WhatsApp lookup from shop ${id} for ${mask(phone)} failed, assuming it exists: ${safeDescribe(err)}`,
      );
      return true;
    }
  }

  /**
   * One campaign message from the shop's own number: a text, or an image with
   * the text as its caption (one message, not two — a second would double the
   * send rate the campaign pacing holds down).
   *
   * Sent like sendText() — only on a live session, bounded, remembered for
   * the customer's phone to ask for again, logged with the number masked,
   * ServiceUnavailable on failure — but NOT through trySendFromShop(). The
   * automated-send ceilings there protect the order messages from strangers
   * scripting checkouts; a campaign is the shopkeeper's own deliberate action
   * with pacing and a daily cap of its own in the campaign runner. Routed
   * through that allowance, one campaign would use up the day's order
   * confirmations.
   */
  async sendCampaignMessage(
    shopId: string,
    phone: string,
    content: CampaignMessageContent,
    country?: string,
  ): Promise<void> {
    const id = assertShopId(shopId);
    const sock = this.sessions.get(id)?.sock;
    if (!this.isConnected(id) || !sock) {
      throw new BadRequestException(MSG.notConnected);
    }
    const jid = this.toJid(phone, country);
    const isImage = "image" in content;
    try {
      const sent = await withTimeout(
        sock.sendMessage(
          jid,
          isImage
            ? {
                image: content.image,
                caption: content.caption || undefined,
                ...(content.mimetype ? { mimetype: content.mimetype } : {}),
              }
            : { text: content.text },
        ),
        isImage ? MEDIA_SEND_TIMEOUT_MS : SEND_TIMEOUT_MS,
        "WhatsApp campaign send",
      );
      this.rememberSent(id, sent);
    } catch (err) {
      this.logger.warn(
        `WhatsApp campaign send from shop ${id} to ${mask(phone)} failed: ${safeDescribe(err)}`,
      );
      throw new ServiceUnavailableException(
        "WhatsApp did not send the message. Check that the phone has internet and try again.",
      );
    }
  }

  /** Called once by OtpService — see PlatformWhatsappSender. */
  registerPlatformSender(sender: PlatformWhatsappSender) {
    this.platformSender = sender;
  }

  /**
   * Mirror a notification — normally an email that has just gone out — on
   * WhatsApp, IF this shop's WhatsApp is connected. Never throws, and returns
   * whether it was sent, so no caller's email or request can be affected.
   *
   * Messages to the SHOP'S OWN OWNER need care. WhatsApp files a message sent
   * from your own linked device to your own number under "Message yourself",
   * where it arrives silently — no ring, no notification — which is useless
   * for a new-order alert. So when the owner's number IS the linked number,
   * the alert goes from the platform's number instead (it rings like any
   * message), and only when that is not connected does it fall back to the
   * shop's own number, where it at least appears. An owner whose alerts go to
   * a different number than the one linked just gets them from the shop's
   * number. Alerts to the owner are also exempt from the per-recipient
   * ceiling: the recipient is the shop itself, and a busy hour would
   * otherwise silence them.
   */
  async notify(n: ShopNotification): Promise<boolean> {
    return (await this.notifyRoute(n)) !== null;
  }

  /**
   * Record how the owner was (or will be) alerted about one event, e.g.
   * `order:<id>`, so a LATER alert about the same event can tell whether it
   * is still needed. The Razorpay webhook uses it: its own paid-order alert
   * is a duplicate only if the order's creation alert actually rang.
   *
   * Registered with the pending outcome, synchronously when the event
   * happens, so a later reader never races past it — it waits for the answer.
   * In memory, which is enough for one process; after a restart the outcome
   * is simply unknown and the later alert goes out.
   */
  trackOwnerAlert(key: string, outcome: Promise<NotifyRoute | null>) {
    const now = Date.now();
    this.ownerAlerts.set(key, {
      at: now,
      outcome: outcome.catch(() => null),
    });
    if (this.ownerAlerts.size > 5_000) this.pruneOwnerAlerts(now);
  }

  /**
   * How the owner was alerted about `key`: the route, null if they were not,
   * or undefined if nothing was recorded or the answer took longer than
   * `waitMs` — in which case the caller should alert them itself.
   */
  async ownerAlertOutcome(
    key: string,
    waitMs: number,
  ): Promise<NotifyRoute | null | undefined> {
    const entry = this.ownerAlerts.get(key);
    if (!entry) return undefined;
    try {
      return await withTimeout(entry.outcome, waitMs, "owner alert outcome");
    } catch {
      return undefined;
    }
  }

  private pruneOwnerAlerts(now: number) {
    for (const [key, entry] of this.ownerAlerts) {
      if (now - entry.at >= OWNER_ALERT_OUTCOME_TTL_MS) {
        this.ownerAlerts.delete(key);
      }
    }
  }

  /** notify(), reporting HOW the message went out (see NotifyRoute), or null
   * if it did not. */
  async notifyRoute(n: ShopNotification): Promise<NotifyRoute | null> {
    const id = String(n?.shopId ?? "");
    try {
      if (!SHOP_ID.test(id) || !n.to || !n.text?.trim()) return null;
      if (!this.isConnected(id)) return null;

      // Addressed first — an unaddressable number throws here, into the
      // catch below, before it can spend any allowance. An owner whose alerts
      // go to the very number that is linked is "toSelf": from the shop's own
      // device such an alert lands silently in "Message yourself".
      const toDigits = this.toJid(n.to, n.country).split("@")[0];
      const toSelf =
        !!n.toShopOwner && toDigits === this.sessions.get(id)?.number;

      // Every ceiling that applies to this message is claimed HERE, before a
      // route is chosen, because the platform route below never reaches the
      // shop's own limiter — and several of these notifications can be set
      // off by strangers (a public checkout, a supplier's reply).
      if (
        n.throttleKey &&
        !this.takeKeyedSlot(
          id,
          `cause|${n.throttleKey}`,
          AUTO_SENDS_PER_CAUSE_PER_HOUR,
          "caused by one party",
        )
      ) {
        return null;
      }
      if (
        n.toShopOwner &&
        !this.takeKeyedSlot(id, "owner", OWNER_ALERTS_PER_HOUR, "to the shop owner")
      ) {
        return null;
      }

      if (toSelf) {
        const platform = this.platformSender;
        if (platform?.isConnected() && this.takePlatformSlot()) {
          if (!(await this.access.isEnabled(id, FEATURE))) return null;
          // `then`, so a sender that throws synchronously is a rejection too.
          const sending = Promise.resolve().then(() =>
            platform.send(toDigits, n.text),
          );
          try {
            await withTimeout(
              sending,
              PLATFORM_SEND_TIMEOUT_MS,
              "platform WhatsApp send",
            );
            return "platform";
          } catch (err) {
            // A timeout is NOT a failure: the send is still in flight and may
            // yet land, and falling back now would deliver the alert twice.
            // Every caller runs this in the background, so it has already
            // waited as long as Baileys' own lookups can take.
            if (err instanceof TimeoutError) {
              this.logger.warn(
                `Platform WhatsApp alert for shop ${id} is taking long; not sending a second copy.`,
              );
              return "platform";
            }
            this.logger.warn(
              `Platform WhatsApp alert for shop ${id} failed, sending from the shop's own number instead: ${safeDescribe(err)}`,
            );
          }
        }
      }

      const sent = await this.trySendFromShop(id, n.to, n.text, n.country, {
        // Owner alerts and messages the shop itself set off (it approved a
        // quote, recorded a payment) are not capped per recipient: the one is
        // the shop, the other is the shop's own authenticated action. Owner
        // alerts are counted in their own allowance above, not in the budget
        // the shop's messages to customers and suppliers share.
        perRecipientLimit: !(n.toShopOwner || n.shopInitiated),
        sharedBudget: !n.toShopOwner,
      });
      if (!sent) return null;
      return toSelf ? "self" : "shop";
    } catch (err) {
      this.logger.warn(
        `WhatsApp notification for shop ${id} to ${mask(n?.to)} not sent: ${safeDescribe(err)}`,
      );
      return null;
    }
  }

  /**
   * For other services' transactional messages (order confirmations and
   * updates). Never throws: returns false when the shop is not connected,
   * the plan does not include the feature, or the send fails, so the caller
   * can fall back to its existing channel.
   */
  async trySendFromShop(
    shopId: string,
    phone: string,
    text: string,
    country?: string,
    opts: { perRecipientLimit?: boolean; sharedBudget?: boolean } = {},
  ): Promise<boolean> {
    const id = String(shopId ?? "");
    try {
      if (!SHOP_ID.test(id) || !this.isConnected(id)) return false;
      // Checked here as well as at connect time: a plan that lapses leaves a
      // connected socket behind, and it must not keep sending — or stay
      // linked — for a shop that has stopped paying for it.
      if (!(await this.access.isEnabled(id, FEATURE))) {
        const session = this.sessions.get(id);
        if (session && this.isConnected(id)) this.pauseForPlan(session);
        return false;
      }
      // Throws for a number that cannot be addressed, which lands in the
      // catch below like any other refusal.
      const jid = this.toJid(phone, country);
      if (
        !this.takeAutoSendSlot(
          id,
          jid,
          opts.perRecipientLimit ?? true,
          opts.sharedBudget ?? true,
        )
      ) {
        return false;
      }
      await this.sendText(id, phone, text, country);
      return true;
    } catch (err) {
      this.logger.warn(
        `WhatsApp message from shop ${id} to ${mask(phone)} not sent: ${safeDescribe(err)}`,
      );
      return false;
    }
  }

  /**
   * Claim one automated send for this shop and recipient, or refuse if a
   * ceiling is reached (see AUTO_SENDS_PER_10_MIN). Claimed BEFORE sending, so
   * attempts count whether or not they go through — a flood that fails is
   * still a flood. Refusal is quiet for the caller (it falls back) but logged
   * for us, at most once per shop per ten minutes.
   */
  private takeAutoSendSlot(
    id: string,
    jid: string,
    perRecipientLimit = true,
    /** False for messages counted in an allowance of their own (owner
     * alerts — see notify()), which then neither use nor are refused by the
     * shop-wide budget. */
    sharedBudget = true,
  ): boolean {
    const now = Date.now();
    const perTen =
      Number(process.env.WHATSAPP_SHOP_SENDS_PER_10_MIN) ||
      AUTO_SENDS_PER_10_MIN;
    const perDay =
      Number(process.env.WHATSAPP_SHOP_SENDS_PER_DAY) || AUTO_SENDS_PER_DAY;

    const shopLog = (this.autoSends.get(id) ?? []).filter(
      (at) => now - at < DAY_MS,
    );
    const lastTen = shopLog.filter((at) => now - at < TEN_MINUTES_MS).length;
    const key = `${id}|${jid}`;
    const toLog = (this.autoSendsTo.get(key) ?? []).filter(
      (at) => now - at < HOUR_MS,
    );

    let refusal: string | null = null;
    if (sharedBudget && shopLog.length >= perDay) refusal = `${perDay} a day`;
    else if (sharedBudget && lastTen >= perTen) {
      refusal = `${perTen} per 10 minutes`;
    } else if (
      perRecipientLimit &&
      toLog.length >= AUTO_SENDS_PER_RECIPIENT_PER_HOUR
    ) {
      refusal = `${AUTO_SENDS_PER_RECIPIENT_PER_HOUR} per recipient per hour`;
    }
    if (refusal) {
      this.autoSends.set(id, shopLog);
      this.autoSendsTo.set(key, toLog);
      if (now - (this.limitWarnedAt.get(id) ?? 0) >= TEN_MINUTES_MS) {
        this.limitWarnedAt.set(id, now);
        this.logger.warn(
          `WhatsApp for shop ${id}: automated sends held back (limit ${refusal}); falling back to the other channel.`,
        );
      }
      return false;
    }
    if (sharedBudget) {
      shopLog.push(now);
      this.autoSends.set(id, shopLog);
    }
    toLog.push(now);
    this.autoSendsTo.set(key, toLog);
    return true;
  }

  /**
   * Claim one slot in a per-shop hourly allowance of its own — `owner` for
   * alerts to the shop owner, `cause|<who>` per outside party (see
   * ShopNotification.throttleKey). Kept in the same map as the per-recipient
   * counters under keys no phone number can collide with, so the sweep prunes
   * them with the rest.
   */
  private takeKeyedSlot(
    id: string,
    slot: string,
    perHour: number,
    what: string,
  ): boolean {
    const now = Date.now();
    const key = `${id}|${slot}`;
    const log = (this.autoSendsTo.get(key) ?? []).filter(
      (at) => now - at < HOUR_MS,
    );
    if (log.length >= perHour) {
      this.autoSendsTo.set(key, log);
      if (now - (this.limitWarnedAt.get(key) ?? 0) >= TEN_MINUTES_MS) {
        this.limitWarnedAt.set(key, now);
        this.logger.warn(
          `WhatsApp for shop ${id}: notifications ${what} held back (limit ${perHour} per hour).`,
        );
      }
      return false;
    }
    log.push(now);
    this.autoSendsTo.set(key, log);
    return true;
  }

  /**
   * One slot of the platform number's allowance for shop alerts, across ALL
   * shops. Per-shop allowances multiplied by every linked shop would still
   * let a flood of public checkouts drive the number that also carries every
   * WhatsApp login code; this caps the total. Refused, the alert simply goes
   * from the shop's own number instead.
   */
  private takePlatformSlot(): boolean {
    const now = Date.now();
    const perTen =
      Number(process.env.WHATSAPP_PLATFORM_ALERTS_PER_10_MIN) ||
      PLATFORM_ALERTS_PER_10_MIN;
    this.platformAlerts = this.platformAlerts.filter(
      (at) => now - at < TEN_MINUTES_MS,
    );
    if (this.platformAlerts.length >= perTen) return false;
    this.platformAlerts.push(now);
    return true;
  }

  /** Drop send counters that have aged out, so the maps do not grow with
   * every shop and recipient ever seen. Run from the sweep. */
  private pruneSendCounters(now: number) {
    this.pruneOwnerAlerts(now);
    for (const [id, log] of this.autoSends) {
      const kept = log.filter((at) => now - at < DAY_MS);
      if (kept.length) this.autoSends.set(id, kept);
      else this.autoSends.delete(id);
    }
    for (const [key, log] of this.autoSendsTo) {
      const kept = log.filter((at) => now - at < HOUR_MS);
      if (kept.length) this.autoSendsTo.set(key, kept);
      else this.autoSendsTo.delete(key);
    }
    for (const [id, at] of this.limitWarnedAt) {
      if (now - at >= TEN_MINUTES_MS) this.limitWarnedAt.delete(id);
    }
  }

  /** Keep a sent message for getMessage, dropping the oldest past the cap. */
  private rememberSent(id: string, sent: proto.IWebMessageInfo | undefined) {
    const session = this.sessions.get(id);
    const messageId = sent?.key?.id;
    if (!session || !messageId || !sent?.message) return;
    session.recentSent.set(messageId, sent.message);
    if (session.recentSent.size > RECENT_SENT_MAX) {
      const oldest = session.recentSent.keys().next().value;
      if (oldest !== undefined) session.recentSent.delete(oldest);
    }
  }

  // ── Disk, records, helpers ───────────────────────────────────────────────

  private sessionFor(id: string): Session {
    let session = this.sessions.get(id);
    if (!session) {
      session = {
        shopId: id,
        sock: null,
        generation: 0,
        status: "disconnected",
        qrDataUrl: null,
        qrExpiresAt: null,
        qrCount: 0,
        number: null,
        connectedAt: null,
        lastError: null,
        retries: 0,
        retryTimer: null,
        starting: false,
        interactive: false,
        needsPerson: false,
        credsWrite: Promise.resolve(),
        recentSent: new Map(),
      };
      this.sessions.set(id, session);
    }
    return session;
  }

  /** True when this attempt has been replaced — by another connect, a
   * suspend or an unlink — and should stop rather than publish anything. */
  private superseded(session: Session, myGeneration: number): boolean {
    return myGeneration !== session.generation;
  }

  /** Still the current generation AND still the shop's socket (a close
   * detaches it without bumping the generation). */
  private owns(session: Session, sock: WASocket, myGeneration: number) {
    return !this.superseded(session, myGeneration) && session.sock === sock;
  }

  private hasLiveSocket(id: string): boolean {
    const session = this.sessions.get(id);
    return !!session && (!!session.sock || session.starting);
  }

  /** Sockets open or opening for every shop but this one — what the
   * WHATSAPP_MAX_SHOP_SESSIONS cap counts. */
  private otherLiveSockets(except: Session): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session !== except && (session.sock || session.starting)) count += 1;
    }
    return count;
  }

  /**
   * Read lazily: main.ts loads .env after the imports, so a top-level const
   * would always see the default.
   */
  private authRoot(): string {
    return (
      process.env.WHATSAPP_SHOP_AUTH_DIR ||
      join(process.cwd(), "whatsapp_shop_auth")
    );
  }

  private authDirFor(id: string): string {
    return join(this.authRoot(), assertShopId(id));
  }

  /**
   * Whether a USABLE pairing exists on disk. creds.json alone is not enough:
   * an abandoned scan leaves one behind with no `me`, and a file truncated by
   * a crash or a full disk parses as nothing. Either way Baileys would start
   * an unauthenticated socket that waits for a scan nobody is watching, so
   * both count as unpaired — which sends the shop to the QR, the thing that
   * actually fixes it.
   */
  private isPaired(id: string): boolean {
    const file = join(this.authDirFor(id), "creds.json");
    if (!existsSync(file)) return false;
    try {
      const creds = JSON.parse(readFileSync(file, "utf8")) as {
        me?: { id?: string };
      } | null;
      return !!creds?.me?.id;
    } catch {
      this.logger.warn(
        `The WhatsApp pairing file for shop ${id} is unreadable — treating it as unpaired.`,
      );
      return false;
    }
  }

  private clearAuthFolder(id: string) {
    try {
      rmSync(this.authDirFor(id), { recursive: true, force: true });
    } catch (err) {
      this.logger.error(
        `Could not clear the WhatsApp pairing for shop ${id}: ${safeDescribe(err)}`,
      );
    }
  }

  /** Remember the linked number, keeping the original link date when the
   * same phone simply reconnects. */
  private async recordLinked(id: string, number: string) {
    const record = await this.model
      .findOne({ shopkeeperId: id })
      .select("number linkedAt")
      .lean();
    if (record?.number === number && record?.linkedAt) return;
    await this.model.updateOne(
      { shopkeeperId: id },
      { $set: { number, linkedAt: new Date() } },
    );
  }

  private async recordUnlinked(id: string) {
    await this.model.updateOne(
      { shopkeeperId: id },
      { $set: { number: null, linkedAt: null } },
    );
  }

  /**
   * The WhatsApp Web version to announce, fetched once and shared.
   *
   * Asked for rather than pinned: WhatsApp refuses clients it considers too
   * old, and a pinned version becomes a silent outage months later. Cached,
   * because a restore of every shop must not be one HTTP call per shop, and
   * single-flight, so shops connecting together share one request. Bounded,
   * because the call has no useful timeout of its own and `starting` is held
   * while it runs. On failure the version is omitted and Baileys uses its
   * bundled one; the failure is remembered briefly so the next shops do not
   * each wait out the same timeout.
   */
  private async baileysVersion(): Promise<WAVersion | null> {
    if (this.version && this.version.until > Date.now()) {
      return this.version.value;
    }
    if (!this.versionInFlight) {
      this.versionInFlight = (async () => {
        try {
          const result = await withTimeout(
            fetchLatestBaileysVersion({ timeout: VERSION_FETCH_TIMEOUT_MS }),
            VERSION_FETCH_TIMEOUT_MS,
            "fetchLatestBaileysVersion",
          );
          // Baileys reports a failed fetch in the result rather than throwing,
          // returning its bundled version — which omitting `version` gives us.
          if (result.error || !result.version) {
            throw result.error ?? new Error("no version in the response");
          }
          this.version = {
            value: result.version,
            until: Date.now() + VERSION_TTL_MS,
          };
          return result.version;
        } catch (err) {
          this.logger.warn(
            `Could not fetch the current WhatsApp version (${safeDescribe(err)}); using the bundled one.`,
          );
          this.version = {
            value: null,
            until: Date.now() + VERSION_FAILURE_TTL_MS,
          };
          return null;
        } finally {
          this.versionInFlight = null;
        }
      })();
    }
    return this.versionInFlight;
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

function assertShopId(shopId: string): string {
  const id = String(shopId ?? "");
  if (!SHOP_ID.test(id)) throw new BadRequestException("Invalid shop id.");
  return id;
}

function maxSessions(): number {
  return Number(process.env.WHATSAPP_MAX_SHOP_SESSIONS) || 100;
}

/**
 * Calling codes for the countries shops are in. The Shopkeeper record stores
 * `country` as a code ("IN", "SG") in practice, but names have been seen in
 * older rows, so both are accepted.
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

function callingCodeFor(country?: string): string | null {
  const key = String(country ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return CALLING_CODES[key] ?? null;
}

/**
 * Baileys' `ILogger`, implemented directly so pino (not a dependency of this
 * app) is not needed, and routed into Nest's logger when switched on.
 *
 * `level` is a pino level name because Baileys reads it (`logger.level ===
 * 'trace'`) to decide whether to build expensive debug output.
 */
const LOG_LEVELS: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

function makeBaileysLogger(requested: string): BaileysLogger {
  const level = requested in LOG_LEVELS ? requested : "silent";
  const threshold = LOG_LEVELS[level];
  const sink = new Logger("Baileys");
  const at =
    (rank: number, write: (line: string) => void) =>
    (obj: unknown, msg?: string) => {
      if (rank < threshold) return;
      write(formatLogLine(obj, msg));
    };
  const logger: BaileysLogger = {
    level,
    // Baileys asks for child loggers with bindings ({ class: … }); they add
    // nothing worth the allocation here, so every child is this logger.
    child: () => logger,
    trace: at(LOG_LEVELS.trace, (line) => sink.verbose(line)),
    debug: at(LOG_LEVELS.debug, (line) => sink.debug(line)),
    info: at(LOG_LEVELS.info, (line) => sink.log(line)),
    warn: at(LOG_LEVELS.warn, (line) => sink.warn(line)),
    error: at(LOG_LEVELS.error, (line) => sink.error(line)),
  };
  return logger;
}

/**
 * One Baileys log call as a line, with phone numbers masked. Baileys logs
 * message keys and node attributes verbatim, and those carry customers' JIDs
 * — full numbers — at `warn` and `error` too, not only at `debug`.
 */
function formatLogLine(obj: unknown, msg?: string): string {
  let line: string;
  if (typeof obj === "string") {
    line = msg ? `${obj} ${msg}` : obj;
  } else {
    let detail = "";
    try {
      detail = JSON.stringify(obj) ?? "";
    } catch {
      detail = "[unserialisable]";
    }
    if (detail.length > 500) detail = `${detail.slice(0, 500)}…`;
    line = msg ? `${msg} ${detail}` : detail;
  }
  return maskDigits(line);
}

/** withTimeout's rejection, told apart from the promise's own failure: the
 * work may still be in flight. */
class TimeoutError extends Error {}

/** Reject if a promise has not settled in time. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new TimeoutError(`${what} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err as Error);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/** Baileys wraps failures in Boom errors; the code is what says whether this
 * was a logout, a replaced session, or a dropped connection. */
function statusCodeOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as {
    output?: { statusCode?: number };
    status?: number;
    code?: number;
  };
  const code = e.output?.statusCode ?? e.status ?? e.code;
  return typeof code === "number" ? code : undefined;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * describe(), with anything that looks like a phone number cut to its last
 * four digits. Baileys' errors sometimes carry a JID, and those are the
 * shop's customers' numbers — they do not belong in the server log.
 */
function safeDescribe(err: unknown): string {
  return maskDigits(describe(err));
}

/** Any run of seven or more digits — a phone number, or a JID's user part —
 * cut to its last four. */
function maskDigits(text: string): string {
  return text.replace(/\d{7,}/g, (digits) => `…${digits.slice(-4)}`);
}

/** A phone number for a log line: the last four digits only. */
function mask(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "an unknown number";
  return `…${digits.slice(-4)}`;
}
