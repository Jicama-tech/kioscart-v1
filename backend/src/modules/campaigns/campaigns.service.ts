import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { readFile } from "fs/promises";
import { SubscriptionAccessService } from "../../common/subscription/subscription-access.service";
import {
  CampaignMessageContent,
  ShopWhatsappService,
} from "../whatsapp/shop-whatsapp.service";
import {
  CampaignCreator,
  CampaignRecipient,
  CampaignStatus,
  RecipientStatus,
  WhatsappCampaign,
} from "./entities/whatsapp-campaign.entity";
import { CampaignRequestDto } from "./dto/campaign-request.dto";
import {
  assertOneAudience,
  assertShopId,
  CampaignAudienceService,
  IMAGE_MISSING_WARNING,
  imageMimetype,
  MAX_SENDABLE,
  maskPhone,
  resolveUploadPath,
  SKIP,
} from "./campaign-audience";
import { validate } from "./campaign-template";

/**
 * Personalised WhatsApp campaigns, sent from the shop's own linked number.
 *
 * PACE IS THE WHOLE DESIGN. The shop's number is a real WhatsApp account
 * linked as a device, and WhatsApp bans accounts that behave like bulk
 * senders: a burst of messages to numbers that never wrote first is the
 * exact signature. So a campaign is not a loop over sendMessage. It waits
 * 6–15 s (jittered) after every message and 30–60 s after every twentieth,
 * asks WhatsApp whether each number exists before messaging it, stops the
 * moment the session drops, and stops for the day at a per-shop cap. Losing
 * the number would cost the shop its WhatsApp account, not just this
 * feature — which is why production can only make the pacing slower (see
 * pacing()).
 *
 * ONE CAMPAIGN PER SHOP AT A TIME, and a ceiling on campaigns running across
 * the whole server. Two campaigns from one shop interleaving would double the
 * send rate the pacing exists to hold down. The slot is claimed synchronously,
 * before the first await, because the audience build awaits several times and
 * a second request landing in one of those gaps would otherwise pass the same
 * check (the lesson singadvisor's broadcast service learned the hard way).
 *
 * The runner lives in this process's memory. A restart loses the loop, so on
 * boot anything left `queued`/`sending` is marked `paused`, and a resume picks
 * up where it stopped: each recipient is marked as taken before its message
 * goes out and its outcome is written right after. The one message that can
 * fall between the two — WhatsApp took it, then the process died or the write
 * failed — is closed as failed on the next run and NOT sent again: at most
 * once, because a duplicate marketing message is worse than a missed one (see
 * CampaignRecipient.attemptAt). That reconciliation assumes ONE backend
 * process (the deploy runs pm2 in fork mode); a second instance would pause
 * the first one's live campaigns, so gate it on an owner/lease field before
 * scaling out.
 */

/** What the shop's pages are shown about one campaign. */
export type CampaignSummary = {
  id: string;
  createdAt: Date | null;
  status: CampaignStatus;
  total: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  templatePreview: string;
  productName: string;
  hasImage: boolean;
  lastError: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdByName: string;
};

export type CampaignDetail = CampaignSummary & {
  template: string;
  recipients: Array<{
    customerId: string;
    name: string;
    phone: string;
    status: RecipientStatus;
    reason: string | null;
    sentAt: Date | null;
  }>;
};

export type CampaignPreview = {
  total: number;
  willSend: number;
  willSkip: number;
  skipped: Record<string, number>;
  unknownPlaceholders: string[];
  hasImage: boolean;
  warnings: string[];
  estimatedMinutes: number;
  dailyRemaining: number;
  connected: boolean;
  samples: Array<{ customerId: string; name: string; phone: string; text: string }>;
};

/** Held in the per-shop slot from the moment create() decides to start until
 * the campaign has an id to hold it under. */
const CLAIMING = "CLAIMING";

const DAY_MS = 24 * 60 * 60 * 1000;
const SAMPLE_COUNT = 20;

/** How long cancel() waits for the runner to notice, so its answer usually
 * already says `cancelled`. The dashboard polls either way. */
const CANCEL_SETTLE_MS = 2_500;

/** The two plan keys a campaign needs to keep sending. */
const CAMPAIGN_FEATURES = ["crmMarketingCampaign", "whatsappConnect"];

// The sentences the dashboard shows. Fixed English, because it translates
// them by looking the exact text up in the Hindi and Gujarati dictionaries.
const MSG = {
  unknown: (keys: string[]) =>
    `Your message uses unknown placeholders: ${keys.map((k) => `{{${k}}}`).join(", ")}.`,
  nobody: "Nobody in this selection can receive a WhatsApp message.",
  tooMany: `A campaign can go to at most ${MAX_SENDABLE} customers. Select fewer customers.`,
  notLinked: "Link your WhatsApp in Settings › WhatsApp before sending a campaign.",
  busyShop: "A campaign is already sending. Wait for it to finish or stop it first.",
  busyServer: "Campaign sending is busy right now. Try again in a few minutes.",
  notFound: "Campaign not found.",
  notPaused: "Only a paused campaign can be resumed.",
  disconnected:
    "WhatsApp disconnected. Reconnect it in Settings › WhatsApp, then resume.",
  planLost: "This plan no longer includes WhatsApp campaigns.",
  dailyLimit: (limit: number) =>
    `Daily limit reached (${limit} messages). Resume tomorrow.`,
  restarted:
    "The server restarted while this campaign was sending. Resume to continue.",
  crashed: "Sending stopped because of a server error. Resume to try again.",
} as const;

/** Why one message was not delivered — recipient reasons, like SKIP. (A
 * session that drops before the send no longer fails the customer: the row
 * stays pending and the campaign pauses, so a resume still reaches them.) */
const FAIL = {
  notSent: "WhatsApp did not send the message.",
  /** Taken for sending, outcome never recorded — see attemptAt. */
  unknown:
    "Sending was interrupted and this message may have gone out, so it was not sent again.",
} as const;

/** Waits between tries at writing down one recipient's outcome. */
const RECORD_RETRY_MS = [500, 2_000, 5_000];

/**
 * The pacing, read per use because main.ts loads .env after the imports.
 *
 * Every value can be overridden by environment (WHATSAPP_CAMPAIGN_MIN_GAP_MS
 * and friends) so a test can run a campaign in milliseconds. In production an
 * override can only make it SLOWER: a typo'd or copied-over test value must
 * never turn a shop's number into a bulk sender.
 */
function pacing() {
  const prod = process.env.NODE_ENV === "production";
  const ms = (name: string, fallback: number) => {
    const raw = process.env[name];
    const value = raw === undefined || raw === "" ? NaN : Number(raw);
    if (!Number.isFinite(value) || value < 0) return fallback;
    return prod ? Math.max(value, fallback) : value;
  };
  const minGap = ms("WHATSAPP_CAMPAIGN_MIN_GAP_MS", 6_000);
  const minPause = ms("WHATSAPP_CAMPAIGN_MIN_PAUSE_MS", 30_000);
  const everyRaw = ms("WHATSAPP_CAMPAIGN_PAUSE_EVERY", 20);
  // A longer pause after every N messages: in production N may only shrink.
  const pauseEvery = Math.max(
    1,
    Math.round(prod ? Math.min(everyRaw, 20) : everyRaw),
  );
  return {
    minGap,
    maxGap: Math.max(minGap, ms("WHATSAPP_CAMPAIGN_MAX_GAP_MS", 15_000)),
    minPause,
    maxPause: Math.max(minPause, ms("WHATSAPP_CAMPAIGN_MAX_PAUSE_MS", 60_000)),
    pauseEvery,
  };
}

/**
 * Messages one shop may send in campaigns per rolling 24 hours. 100 by
 * default: campaigns go out from the shopkeeper's own linked number, and a
 * low daily volume is one of the strongest protections against WhatsApp
 * restricting it. WHATSAPP_CAMPAIGN_DAILY_LIMIT overrides it.
 */
function dailyLimit(): number {
  return Number(process.env.WHATSAPP_CAMPAIGN_DAILY_LIMIT) || 100;
}

/** Campaigns sending at once across the whole server. */
function maxRunning(): number {
  return Number(process.env.WHATSAPP_CAMPAIGN_MAX_RUNNING) || 10;
}

function between(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

@Injectable()
export class CampaignsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignsService.name);

  /** shopId → the campaign sending for it, or CLAIMING. Its size is the
   * number of campaigns running on this server. */
  private readonly slots = new Map<string, string>();
  /** Campaigns asked to stop; the runner acts on it before the next message. */
  private readonly cancelRequested = new Set<string>();
  /** Wakes a runner that is waiting out a gap, so a stop is not held up by
   * a minute-long pause. */
  private readonly wakers = new Map<string, () => void>();
  /** shopId → when its last campaign message was handed to WhatsApp, from
   * whichever campaign. The pacing gap is per shop, not per run. */
  private readonly lastSendAt = new Map<string, number>();
  /** RECORD_RETRY_MS; a field so a test can shorten it. */
  private readonly recordRetryMs: number[] = RECORD_RETRY_MS;
  private shuttingDown = false;

  constructor(
    @InjectModel(WhatsappCampaign.name)
    private readonly model: Model<WhatsappCampaign>,
    private readonly audience: CampaignAudienceService,
    private readonly whatsapp: ShopWhatsappService,
    private readonly access: SubscriptionAccessService,
  ) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Campaigns the last process was part-way through are paused, not failed:
   * the loop is gone, but who has and has not been messaged is on the record,
   * so the shopkeeper can resume. Never allowed to stop the app booting.
   */
  async onModuleInit() {
    try {
      const res = await this.model.updateMany(
        { status: { $in: ["queued", "sending"] } },
        { $set: { status: "paused", lastError: MSG.restarted } },
      );
      if (res.modifiedCount > 0) {
        this.logger.warn(
          `Paused ${res.modifiedCount} WhatsApp campaign(s) left mid-send by a restart.`,
        );
      }
    } catch (err) {
      this.logger.warn(`Could not reconcile interrupted campaigns: ${describe(err)}`);
    }
  }

  /** On shutdown, sleeping runners are woken so the process is not held
   * open by a pacing timer; the boot above pauses what they leave behind. */
  onModuleDestroy() {
    this.shuttingDown = true;
    for (const wake of [...this.wakers.values()]) wake();
  }

  // ── Reading ──────────────────────────────────────────────────────────────

  async list(shopId: string): Promise<CampaignSummary[]> {
    const id = assertShopId(shopId);
    const docs = await this.model
      .find({ shopkeeperId: id })
      .select("-recipients")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return docs.map((doc) => toSummary(doc));
  }

  async detail(shopId: string, campaignId: string): Promise<CampaignDetail> {
    const doc = await this.findOwn(shopId, campaignId, true);
    return {
      ...toSummary(doc),
      template: doc.template,
      // The full number never leaves the server; the text is on the record
      // but the list does not need it.
      recipients: (doc.recipients ?? []).map((r) => ({
        customerId: r.customerId,
        name: r.name,
        phone: maskPhone(r.phone),
        status: r.status,
        reason: r.reason ?? null,
        sentAt: r.sentAt ?? null,
      })),
    };
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  /**
   * Exactly what a campaign would do, without sending anything: who is
   * skipped and why, and the real text of the first customers' messages
   * (same renderer, same seed, same names as the send). Works without a
   * linked WhatsApp, so a shop can write and check a campaign first.
   */
  async preview(shopId: string, dto: CampaignRequestDto): Promise<CampaignPreview> {
    const id = assertShopId(shopId);
    assertOneAudience(dto);
    // Only the samples' texts are built: the composer asks for a preview
    // after every edit, and the rest of the audience is only counted (every
    // row is still measured, so "Message too long" counts are exact).
    const built = await this.audience.build(id, dto, { samples: SAMPLE_COUNT });
    const skipped: Record<string, number> = {};
    for (const row of built.rows) {
      if (row.status === "skipped" && row.reason) {
        skipped[row.reason] = (skipped[row.reason] ?? 0) + 1;
      }
    }
    const warnings = [...built.warnings];
    if (built.truncated || built.willSend > MAX_SENDABLE) {
      warnings.push(MSG.tooMany);
    }
    const sentToday = (await this.sentTimesSince(id, Date.now() - DAY_MS)).length;
    return {
      total: built.rows.length,
      willSend: built.willSend,
      willSkip: built.rows.length - built.willSend,
      skipped,
      unknownPlaceholders: validate(dto.template).unknown,
      hasImage: built.hasImage,
      warnings,
      estimatedMinutes: estimateMinutes(built.willSend),
      dailyRemaining: Math.max(0, dailyLimit() - sentToday),
      connected: this.whatsapp.isConnected(id),
      samples: built.rows
        .filter((r) => r.status === "pending")
        .slice(0, SAMPLE_COUNT)
        .map((r) => ({
          customerId: r.customerId,
          name: r.name,
          phone: maskPhone(r.phone),
          text: r.text,
        })),
    };
  }

  // ── Starting, stopping, resuming ─────────────────────────────────────────

  /**
   * Create the campaign and start sending. Returns as soon as it is under
   * way; the loop runs on after the response and the dashboard polls it —
   * a request held open for the hour a campaign can take would be cut off by
   * the proxy long before.
   */
  async create(
    shopId: string,
    dto: CampaignRequestDto,
    createdBy: CampaignCreator,
  ): Promise<CampaignSummary> {
    const id = assertShopId(shopId);
    const { unknown } = validate(dto.template);
    if (unknown.length) throw new BadRequestException(MSG.unknown(unknown));
    assertOneAudience(dto);
    if (!this.whatsapp.isConnected(id)) {
      throw new BadRequestException(MSG.notLinked);
    }
    this.claim(id, CLAIMING);

    let handedOff = false;
    try {
      // build() leaves the texts unbuilt when the audience is over
      // MAX_SENDABLE, so refusing it here costs no rendering.
      const built = await this.audience.build(id, dto);
      if (built.truncated || built.willSend > MAX_SENDABLE) {
        throw new BadRequestException(MSG.tooMany);
      }
      if (built.willSend === 0) throw new BadRequestException(MSG.nobody);
      const doc = await this.model.create({
        shopkeeperId: id,
        createdBy: {
          userId: String(createdBy?.userId ?? id),
          operatorId: createdBy?.operatorId || null,
          name: String(createdBy?.name ?? ""),
        },
        template: dto.template,
        productId: built.productId,
        productName: built.productName,
        includePriceList: !!dto.includePriceList && !!built.productId,
        variantIds: dto.variantIds ?? [],
        attachProductImage: !!dto.attachProductImage && !!built.productId,
        imagePath: built.imagePath,
        status: "queued",
        total: built.rows.length,
        sentCount: 0,
        failedCount: 0,
        skippedCount: built.rows.length - built.willSend,
        pendingCount: built.willSend,
        lastError: built.warnings[0] ?? null,
        startedAt: new Date(),
        recipients: built.rows,
      });
      const campaignId = String(doc._id);
      this.slots.set(id, campaignId);
      // Only a cancel could have moved it off `queued` this fast, and then
      // there is nothing to start.
      handedOff = await this.startRunner(id, campaignId, ["queued"]);
      return toSummary(await this.model.findById(campaignId).select("-recipients").lean());
    } finally {
      // Nothing took the slot over — a rejected audience, a failed insert —
      // so it is given back here. Once the runner has it, the runner's own
      // `finally` releases it.
      if (!handedOff) this.release(id);
    }
  }

  /** Carry on from where a paused campaign stopped. */
  async resume(shopId: string, campaignId: string): Promise<CampaignSummary> {
    const id = assertShopId(shopId);
    const doc = await this.findOwn(id, campaignId, false);
    if (doc.status !== "paused") throw new BadRequestException(MSG.notPaused);
    if (!this.whatsapp.isConnected(id)) {
      throw new BadRequestException(MSG.notLinked);
    }
    // Synchronous from the check to the claim: no await in between, so two
    // resumes (or a resume and a create) cannot both pass.
    this.claim(id, campaignId);
    let handedOff = false;
    try {
      handedOff = await this.startRunner(id, campaignId, ["paused"]);
    } finally {
      if (!handedOff) this.release(id);
    }
    // Stopped (or resumed elsewhere) between the read above and the flip.
    if (!handedOff) throw new BadRequestException(MSG.notPaused);
    return toSummary(await this.model.findById(campaignId).select("-recipients").lean());
  }

  /**
   * Stop a campaign. One that is sending stops after the message in flight —
   * the runner owns its recipients while it runs, so it is asked, not
   * overridden. One that is not running — paused, or a `queued` one whose
   * start never happened — is closed here. Either way every recipient still
   * pending becomes `skipped` "Campaign stopped".
   */
  async cancel(shopId: string, campaignId: string): Promise<CampaignSummary> {
    const id = assertShopId(shopId);
    const doc = await this.findOwn(id, campaignId, false);
    const open: CampaignStatus[] = ["queued", "sending", "paused"];
    if (open.includes(doc.status)) {
      if (this.slots.get(id) === campaignId) {
        await this.askRunnerToStop(id, campaignId);
      } else if (!(await this.stopRemaining(campaignId, open))) {
        // The status moved under us — a resume started the runner between
        // the read and the write. It is running now, so ask it instead.
        if (this.slots.get(id) === campaignId) {
          await this.askRunnerToStop(id, campaignId);
        }
      }
      // The runner can end in a pause while the stop is landing — the plan
      // check, a dropped session, the daily cap or a crash decided it a
      // moment before — and its `finally` drops the stop request. Answering
      // "stopped" over a campaign that is really paused, with its customers
      // still pending for the next Resume, is the one outcome a Stop must
      // not have. So once no runner holds it, finish the stop here (a no-op
      // when the runner already closed it). Safe even if a resume slips in
      // first: a runner never sends on a closed campaign (it
      // takes each row only while the campaign is `sending`, so one resumed
      // in that instant stops without sending).
      if (this.slots.get(id) !== campaignId) {
        await this.stopRemaining(campaignId, open);
      }
    }
    return toSummary(await this.model.findById(campaignId).select("-recipients").lean());
  }

  // ── The runner ───────────────────────────────────────────────────────────

  /**
   * Take the shop's slot, or refuse. Called with no await since the checks
   * that lead to it, which is what makes it single-flight.
   */
  private claim(shopId: string, holder: string) {
    if (this.slots.has(shopId)) throw new ConflictException(MSG.busyShop);
    if (this.slots.size >= maxRunning()) {
      throw new HttpException(MSG.busyServer, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.slots.set(shopId, holder);
  }

  private release(shopId: string, campaignId?: string) {
    const holder = this.slots.get(shopId);
    if (holder === undefined) return;
    if (campaignId === undefined || holder === campaignId || holder === CLAIMING) {
      this.slots.delete(shopId);
    }
  }

  /**
   * Flip the campaign to `sending` — only from the statuses given, so a
   * cancel that got there first wins — and start the loop without awaiting
   * it. The slot must already be held for this campaign.
   */
  private async startRunner(
    shopId: string,
    campaignId: string,
    from: CampaignStatus[],
  ): Promise<boolean> {
    const res = await this.model.updateOne(
      { _id: campaignId, status: { $in: from } },
      { $set: { status: "sending", finishedAt: null } },
    );
    if (res.matchedCount === 0) return false;
    void this.run(shopId, campaignId).catch((err) => {
      // run() handles its own errors; this is the last line of defence.
      this.logger.error(`Campaign ${campaignId} died: ${describe(err)}`);
    });
    return true;
  }

  /** The send loop. Never throws; releases the slot whatever happens. */
  private async run(shopId: string, campaignId: string): Promise<void> {
    const id = campaignId;
    try {
      const campaign = await this.model.findById(id).lean();
      if (!campaign) {
        this.logger.error(`Campaign ${id} vanished before it could start.`);
        return;
      }

      // Read ONCE for the whole campaign: the file does not change mid-send,
      // and re-reading it for every recipient is hundreds of disk reads for
      // the same bytes.
      const image = campaign.imagePath
        ? await loadImage(campaign.imagePath)
        : null;
      const warning =
        campaign.attachProductImage && !image ? IMAGE_MISSING_WARNING : null;
      // A resume clears the reason it was paused for; a missing photo is
      // still worth saying.
      await this.model.updateOne(
        { _id: id, status: "sending" },
        { $set: { lastError: warning } },
      );

      const recipients = campaign.recipients ?? [];
      // Before anything is sent, settle what the campaign's time on hold
      // changed: a row the last run took but never recorded, and customers
      // who opted out since.
      await this.sweep(shopId, id, recipients);

      const pace = pacing();
      const sentTimes = await this.sentTimesSince(shopId, Date.now() - DAY_MS);
      let lastPending = -1;
      recipients.forEach((r, i) => {
        if (r.status === "pending") lastPending = i;
      });
      let sentThisRun = 0;

      for (let i = 0; i < recipients.length; i += 1) {
        const r = recipients[i];
        if (r.status !== "pending") continue;

        // Before the checks, so they are fresh when it ends.
        await this.waitForShopGap(shopId, id, pace.minGap);

        const stop = await this.stopReason(shopId, id, sentTimes);
        if (stop === "cancel") {
          await this.stopRemaining(id, ["sending"]);
          this.logger.log(`Campaign ${id} stopped by the shop.`);
          return;
        }
        if (stop === "shutdown") return;
        if (stop) {
          await this.pause(id, stop);
          return;
        }

        // Asked again right before every message, not only when the campaign
        // was built: a campaign can take days (it pauses at the daily cap),
        // and a customer who asked the shop to stop in the meantime must not
        // get the rest of it. Outside the send's try on purpose: if the
        // question cannot be answered, the outer catch pauses the campaign
        // rather than sending on without it.
        if (await this.audience.isOptedOut(shopId, r.customerId, r.phone)) {
          await this.record(id, i, "skipped", SKIP.optedOut);
          continue;
        }

        // Taken BEFORE anything goes out, so a crash or a lost write after
        // WhatsApp took the message cannot lead to sending it again (see
        // attemptAt). Only while the campaign is `sending`, which also keeps
        // this runner from sending on a campaign stopped under it.
        if (!(await this.takeRow(id, i))) {
          const now = await this.model.findById(id).select("status").lean();
          if (now?.status !== "sending") {
            this.logger.log(`Campaign ${id} was closed while sending; stopping.`);
            return;
          }
          throw new Error(`recipient ${i} could not be taken for sending`);
        }

        // What happened, decided first; writing it down comes after, outside
        // this try. Inside it, a bookkeeping write that failed AFTER Mongo
        // applied it would be caught and re-recorded as a failed send — one
        // message counted twice, and a message that went out filed as one
        // that did not.
        let outcome: "sent" | "failed" | "skipped" | "unsent";
        let reason: string | null = null;
        try {
          const exists = await this.whatsapp.isOnWhatsapp(shopId, r.phone);
          if (!exists) {
            outcome = "skipped";
            reason = SKIP.notOnWhatsapp;
          } else {
            await this.whatsapp.sendCampaignMessage(
              shopId,
              r.phone,
              contentFor(r.text, image),
            );
            outcome = "sent";
          }
        } catch (err) {
          if (err instanceof BadRequestException) {
            // Refused before anything went out — both calls check the
            // session before touching the socket, and only a send that got
            // that far fails differently. Either the session dropped since
            // stopReason looked (mid-lookup, or during the lookup's
            // fail-open), or the number cannot be addressed.
            if (!this.whatsapp.isConnected(shopId)) {
              outcome = "unsent";
            } else {
              outcome = "skipped";
              reason = SKIP.invalid;
            }
          } else {
            outcome = "failed";
            reason = FAIL.notSent;
          }
          this.logger.warn(
            `Campaign ${id}: ${maskPhone(r.phone)} ${outcome} — ${describe(err)}`,
          );
        }

        if (outcome === "unsent") {
          // This customer was never messaged, so they are not failed: the row
          // is given back as untaken and pending, and the campaign pauses the
          // way stopReason pauses for a dropped session. A resume retries
          // them. (Not a retry on the spot: a flapping connection would loop
          // on the same customer without any gap.)
          await this.releaseRow(id, i);
          if (this.shuttingDown) return; // the next boot pauses it
          await this.pause(id, MSG.disconnected);
          return;
        }

        // A lookup that said "not on WhatsApp" sent nothing, so nothing to
        // pace. A FAILED send is paced like a sent one: a timeout is not
        // proof the message did not go out, and a failure from WhatsApp
        // throttling is the worst moment to send the next one straight away.
        // For the same reason it counts towards the daily cap.
        if (outcome !== "skipped") {
          this.lastSendAt.set(shopId, Date.now());
          sentTimes.push(Date.now());
        }
        if (outcome === "sent") sentThisRun += 1;

        // Retried; if it still cannot be written the loop stops here (the
        // outer catch pauses the campaign) rather than sending the next
        // message while the record says less than what happened.
        await this.record(id, i, outcome, reason);

        if (outcome === "skipped" || i === lastPending) continue;
        await this.sleep(id, between(pace.minGap, pace.maxGap));
        if (outcome === "sent" && sentThisRun % pace.pauseEvery === 0) {
          await this.sleep(id, between(pace.minPause, pace.maxPause));
        }
      }

      await this.model.updateOne(
        { _id: id, status: "sending" },
        { $set: { status: "completed", finishedAt: new Date() } },
      );
      this.logger.log(`Campaign ${id} finished (${sentThisRun} sent this run).`);
    } catch (err) {
      // Everything outside the per-message try — the reads, the status
      // writes, an outcome that could not be recorded — lands here. Paused
      // rather than failed: the recipients are on the record, so once
      // whatever broke is fixed, a resume carries on.
      this.logger.error(`Campaign ${id} aborted: ${describe(err)}`);
      await this.pause(id, MSG.crashed).catch((writeErr) => {
        this.logger.error(
          `Campaign ${id}: could not record the abort — ${describe(writeErr)}`,
        );
      });
    } finally {
      // Released whatever happened, or this shop could never send again.
      this.release(shopId, id);
      this.cancelRequested.delete(id);
      this.wakers.delete(id);
    }
  }

  /**
   * Checked before every message. Returns null to carry on, "cancel" or
   * "shutdown", or the sentence to pause with.
   */
  private async stopReason(
    shopId: string,
    campaignId: string,
    sentTimes: number[],
  ): Promise<string | null> {
    if (this.shuttingDown) return "shutdown";
    if (this.cancelRequested.has(campaignId)) return "cancel";
    // Carrying on without a session would mark every remaining customer
    // failed when the truth is they were never attempted.
    if (!this.whatsapp.isConnected(shopId)) return MSG.disconnected;
    // A plan that lapses mid-campaign stops it (cached for 30 s, so this is
    // not a query per message).
    for (const feature of CAMPAIGN_FEATURES) {
      const enabled = await this.access.isEnabled(shopId, feature);
      // The await above is where a stop can land, and a stop wins over a
      // pause: the shopkeeper was told the campaign stopped.
      if (this.cancelRequested.has(campaignId)) return "cancel";
      if (this.shuttingDown) return "shutdown";
      if (!enabled) return MSG.planLost;
    }
    const since = Date.now() - DAY_MS;
    while (sentTimes.length && sentTimes[0] < since) sentTimes.shift();
    const limit = dailyLimit();
    if (sentTimes.length >= limit) return MSG.dailyLimit(limit);
    return null;
  }

  /**
   * Record one recipient's outcome immediately — the record exists to
   * survive a crash mid-campaign, and a batch at the end is exactly what a
   * crash loses. Conditional on the row still being pending, so no outcome
   * is ever counted twice.
   */
  private async markRecipient(
    campaignId: string,
    index: number,
    status: "sent" | "failed" | "skipped",
    reason: string | null,
  ) {
    const counter =
      status === "sent" ? "sentCount" : status === "failed" ? "failedCount" : "skippedCount";
    const at = `recipients.${index}`;
    await this.model.updateOne(
      { _id: campaignId, [`${at}.status`]: "pending" },
      {
        $set: {
          [`${at}.status`]: status,
          [`${at}.reason`]: reason,
          [`${at}.sentAt`]: status === "sent" ? new Date() : null,
        },
        $inc: { [counter]: 1, pendingCount: -1 },
      },
    );
  }

  /**
   * markRecipient, retried: once a message has gone out, losing its outcome
   * is how a campaign ends up counting and reporting less than it did. Safe
   * to repeat — the write only applies to a row still pending, so a try that
   * reached Mongo but lost its answer is not counted twice. Throws when every
   * try failed.
   */
  private async record(
    campaignId: string,
    index: number,
    status: "sent" | "failed" | "skipped",
    reason: string | null,
  ) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.markRecipient(campaignId, index, status, reason);
        return;
      } catch (err) {
        if (attempt >= this.recordRetryMs.length) throw err;
        this.logger.warn(
          `Campaign ${campaignId}: recording recipient ${index} (${status}) failed, retrying — ${describe(err)}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, this.recordRetryMs[attempt]),
        );
      }
    }
  }

  /** Mark a pending row as taken for sending (attemptAt), only while the
   * campaign is `sending`. Returns whether it was taken. */
  private async takeRow(campaignId: string, index: number): Promise<boolean> {
    const at = `recipients.${index}`;
    const res = await this.model.updateOne(
      {
        _id: campaignId,
        status: "sending",
        [`${at}.status`]: "pending",
        [`${at}.attemptAt`]: null,
      },
      { $set: { [`${at}.attemptAt`]: new Date() } },
    );
    return res.matchedCount > 0;
  }

  /** Undo takeRow for a row that provably sent nothing, so a resume sends it. */
  private async releaseRow(campaignId: string, index: number) {
    const at = `recipients.${index}`;
    await this.model.updateOne(
      { _id: campaignId, [`${at}.status`]: "pending" },
      { $set: { [`${at}.attemptAt`]: null } },
    );
  }

  /**
   * Pause the running campaign — unless a stop landed first, which wins,
   * including one that lands during the pause write itself: the shopkeeper
   * was told "Campaign stopped", and a campaign that comes back paused with
   * a Resume button keeps its customers pending for the next Resume.
   */
  private async pause(campaignId: string, reason: string) {
    if (!this.cancelRequested.has(campaignId)) {
      await this.model.updateOne(
        { _id: campaignId, status: "sending" },
        { $set: { status: "paused", lastError: reason } },
      );
      this.logger.log(`Campaign ${campaignId} paused: ${reason}`);
      if (!this.cancelRequested.has(campaignId)) return;
    }
    await this.stopRemaining(campaignId, ["sending", "paused"]);
    this.logger.log(`Campaign ${campaignId} stopped by the shop.`);
  }

  /**
   * Run once before a run sends anything, over the rows it loaded (updated in
   * place, so the loop passes the settled ones by):
   *  - a row the last run took but never recorded may have been delivered,
   *    so it is closed as failed, never sent again (see attemptAt);
   *  - a customer who opted out while the campaign waited is skipped now,
   *    so the progress view shows it as soon as the campaign resumes (the
   *    loop asks again before each message regardless).
   */
  private async sweep(
    shopId: string,
    campaignId: string,
    recipients: CampaignRecipient[],
  ) {
    if (!recipients.some((r) => r.status === "pending")) return;
    const optedOut = await this.audience.optOutKeys(shopId);
    for (let i = 0; i < recipients.length; i += 1) {
      const r = recipients[i];
      if (r.status !== "pending") continue;
      let status: "failed" | "skipped";
      let reason: string;
      if (r.attemptAt) {
        status = "failed";
        reason = FAIL.unknown;
      } else if (
        optedOut.ids.has(String(r.customerId)) ||
        optedOut.digits.has(digitsOf(r.phone))
      ) {
        status = "skipped";
        reason = SKIP.optedOut;
      } else {
        continue;
      }
      await this.record(campaignId, i, status, reason);
      r.status = status;
    }
  }

  /**
   * Hold the shop's minimum gap since its last campaign message, whichever
   * campaign sent it. The gaps inside a run already cover it; this is for
   * the first message of a run. Without it a campaign that just finished
   * (there is no gap after the last message) or was stopped (the stop cuts
   * its gap short) could be followed by the next one's first message at
   * once — and create-stop-create in a loop would send every few seconds.
   * Interruptible like any gap; the checks after it see why it ended.
   */
  private async waitForShopGap(shopId: string, campaignId: string, minGap: number) {
    const last = this.lastSendAt.get(shopId);
    if (last === undefined) return;
    const wait = last + minGap - Date.now();
    if (wait > 0) await this.sleep(campaignId, wait);
  }

  /**
   * Close a campaign: every pending recipient becomes skipped "Campaign
   * stopped", in one write, and only if the campaign is still in one of
   * `from` — so a runner that started in the meantime is not overridden.
   * A pending row that was already taken for sending (attemptAt) may have
   * gone out, so it is closed as failed with that said, not as "stopped".
   * Returns whether it applied.
   */
  private async stopRemaining(
    campaignId: string,
    from: string[],
  ): Promise<boolean> {
    const doc = await this.model
      .findById(campaignId)
      .select("status recipients.status recipients.attemptAt")
      .lean();
    if (!doc || !from.includes(doc.status)) return false;
    const set: Record<string, unknown> = {
      status: "cancelled",
      finishedAt: new Date(),
      pendingCount: 0,
    };
    const filter: Record<string, unknown> = {
      _id: campaignId,
      status: doc.status,
    };
    let stopped = 0;
    let unknown = 0;
    (doc.recipients ?? []).forEach((r, i) => {
      if (r.status !== "pending") return;
      if (r.attemptAt) {
        set[`recipients.${i}.status`] = "failed";
        set[`recipients.${i}.reason`] = FAIL.unknown;
        unknown += 1;
      } else {
        set[`recipients.${i}.status`] = "skipped";
        set[`recipients.${i}.reason`] = SKIP.stopped;
        stopped += 1;
      }
      // Only rows still pending at write time, so a row the runner has just
      // recorded is never overwritten or counted twice.
      filter[`recipients.${i}.status`] = "pending";
    });
    const res = await this.model.updateOne(filter, {
      $set: set,
      $inc: { skippedCount: stopped, failedCount: unknown },
    });
    return res.matchedCount > 0;
  }

  /** Flag the running campaign to stop, wake it if it is waiting out a gap,
   * and give it a moment to close itself. */
  private async askRunnerToStop(shopId: string, campaignId: string) {
    this.cancelRequested.add(campaignId);
    this.wakers.get(campaignId)?.();
    const until = Date.now() + CANCEL_SETTLE_MS;
    while (this.slots.get(shopId) === campaignId && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** A pacing wait that a stop (or shutdown) can cut short. */
  private sleep(campaignId: string, ms: number): Promise<void> {
    if (this.cancelRequested.has(campaignId) || this.shuttingDown) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        if (this.wakers.get(campaignId) === done) this.wakers.delete(campaignId);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakers.set(campaignId, done);
    });
  }

  /** When this shop's campaign messages went out (or may have — see
   * messagedAt), oldest first, since `since` — what the rolling daily cap
   * counts. */
  private async sentTimesSince(shopId: string, since: number): Promise<number[]> {
    const from = new Date(since);
    const docs = await this.model
      .find({
        shopkeeperId: shopId,
        // attemptAt covers every message sent since it was introduced;
        // sentAt, the rows recorded before that.
        $or: [
          { "recipients.sentAt": { $gte: from } },
          { "recipients.attemptAt": { $gte: from } },
        ],
      })
      .select("recipients.status recipients.sentAt recipients.attemptAt")
      .lean();
    const times: number[] = [];
    for (const doc of docs) {
      for (const r of doc.recipients ?? []) {
        const at = messagedAt(r);
        if (at !== null && at >= since) times.push(at);
      }
    }
    return times.sort((a, b) => a - b);
  }

  /** A campaign of this shop's, or 404 — whether it does not exist or is
   * another shop's, so ids cannot be probed. */
  private async findOwn(
    shopId: string,
    campaignId: string,
    withRecipients: boolean,
  ): Promise<WhatsappCampaign & { _id: unknown }> {
    const id = assertShopId(shopId);
    if (!/^[a-f0-9]{24}$/i.test(String(campaignId ?? ""))) {
      throw new NotFoundException(MSG.notFound);
    }
    const query = this.model.findOne({ _id: campaignId, shopkeeperId: id });
    if (!withRecipients) query.select("-recipients");
    const doc = await query.lean();
    if (!doc) throw new NotFoundException(MSG.notFound);
    return doc as WhatsappCampaign & { _id: unknown };
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────

function toSummary(doc: any): CampaignSummary {
  return {
    id: String(doc?._id ?? ""),
    createdAt: doc?.createdAt ?? null,
    status: doc?.status,
    total: doc?.total ?? 0,
    sentCount: doc?.sentCount ?? 0,
    failedCount: doc?.failedCount ?? 0,
    skippedCount: doc?.skippedCount ?? 0,
    pendingCount: doc?.pendingCount ?? 0,
    // By code point, so an emoji at the cut is not split in half.
    templatePreview: Array.from(String(doc?.template ?? "")).slice(0, 80).join(""),
    productName: doc?.productName ?? "",
    hasImage: !!doc?.imagePath,
    lastError: doc?.lastError ?? null,
    startedAt: doc?.startedAt ?? null,
    finishedAt: doc?.finishedAt ?? null,
    createdByName: doc?.createdBy?.name ?? "",
  };
}

/**
 * When a recipient's message counts as sent for the daily cap, or null. A
 * failed send and a row taken but never recorded count too, from when they
 * were taken: a timeout is not proof nothing was delivered, and the cap is
 * the ban protection, so it must not undercount. A skip sent nothing.
 */
function messagedAt(r: Partial<CampaignRecipient> | null | undefined): number | null {
  if (!r || r.status === "skipped") return null;
  const when = r.status === "sent" ? (r.sentAt ?? r.attemptAt) : r.attemptAt;
  const at = when ? new Date(when).getTime() : NaN;
  return Number.isFinite(at) ? at : null;
}

/** A stored "+<digits>" as the opt-out list keys it. */
function digitsOf(phone: unknown): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function contentFor(
  text: string,
  image: { bytes: Buffer; mimetype?: string } | null,
): CampaignMessageContent {
  return image
    ? { image: image.bytes, caption: text, mimetype: image.mimetype }
    : { text };
}

/** The product photo's bytes, or null when it is gone or not ours to read
 * (resolveUploadPath) — the campaign then goes out as text. */
async function loadImage(
  stored: string,
): Promise<{ bytes: Buffer; mimetype?: string } | null> {
  const full = resolveUploadPath(stored);
  if (!full) return null;
  try {
    return { bytes: await readFile(full), mimetype: imageMimetype(full) };
  } catch {
    return null;
  }
}

/** Minutes a campaign of `count` messages takes at the configured pacing,
 * on average. The daily cap may stretch it over days; that is shown apart. */
function estimateMinutes(count: number): number {
  if (count <= 0) return 0;
  const pace = pacing();
  const gap = (pace.minGap + pace.maxGap) / 2;
  const pause = (pace.minPause + pace.maxPause) / 2;
  const pauses = Math.floor((count - 1) / pace.pauseEvery);
  // At least a minute: "0 minutes" for a campaign that is about to send
  // reads as "nothing will happen".
  return Math.max(1, Math.ceil(((count - 1) * gap + pauses * pause) / 60_000));
}

/** An error for the log, with anything that looks like a phone number cut to
 * its last four digits. */
function describe(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/\d{7,}/g, (d) => `…${d.slice(-4)}`);
}
