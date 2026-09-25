import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";
import { TabsGuard } from "../../common/tabs/tabs.guard";
import { Tabs } from "../../common/tabs/tabs.decorator";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { SendWhatsappDto } from "./dto/send-whatsapp.dto";
import {
  ShopWhatsappService,
  ShopWhatsappState,
} from "./shop-whatsapp.service";

/** Minimum gap between two test messages from the same shop. */
const TEST_SEND_COOLDOWN_MS = 5_000;
/** Minimum gap between two switch-ons or link attempts from the same shop.
 * Each one can open a fresh WhatsApp login from the server's single IP. */
const CONNECT_COOLDOWN_MS = 3_000;

/**
 * Settings › WhatsApp: a shop links ITS OWN number and switches it on or off.
 *
 * The shop is always the one in the token — never an id from the URL or the
 * body. The QR is a pairing credential: whoever scans it links their phone as
 * the shop's sender, so being able to ask for another shop's QR would be a
 * takeover. There is deliberately no route here that names a shop.
 *
 * Three guards, in order: a valid login (the passport strategy, because
 * SubscriptionGuard reads `req.user.userId`); the plan, since this is a paid
 * add-on that is off unless the plan switches it on (OPT_IN_FEATURES); and,
 * for operators, the `whatsapp` access tab, re-read from the database so that
 * revoking it takes effect immediately. An operator who holds the tab gets
 * the whole panel — pairing included — exactly as the owner does.
 *
 * The plan is required per route, not for the whole controller: starting or
 * using a session needs it, but reading the status, switching off and
 * unlinking must keep working after the add-on lapses. Otherwise a shop that
 * stopped paying could not take its own phone off the server.
 *
 * The on/off switch lives here rather than with the other shop settings
 * because flipping it has to do two things at once: persist the flag AND open
 * or close the socket.
 */
@Controller("whatsapp")
@UseGuards(AuthGuard("jwt"), SubscriptionGuard, TabsGuard)
@Tabs("whatsapp")
export class ShopWhatsappController {
  /** Last test send per shop. In memory, which is enough for a courtesy limit
   * on a button — it is not what protects the number from bulk sending. */
  private readonly lastTestSend = new Map<string, number>();
  /** Last switch-on / link attempt per shop — see CONNECT_COOLDOWN_MS. */
  private readonly lastConnect = new Map<string, number>();

  constructor(
    private readonly whatsapp: ShopWhatsappService,
    @InjectModel(Shopkeeper.name)
    private readonly shopModel: Model<Shopkeeper>,
  ) {}

  /**
   * The shop this request acts for. Operators carry their parent shop's id as
   * `userId` and the "shopkeeper" role, so they resolve to the shop too; other
   * account types (organizers, buyers) have no shop to link.
   */
  private shopIdOf(req: any): string {
    const raw = req?.user?.roles;
    const roles: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const isShop = roles.some((r) => String(r).toLowerCase() === "shopkeeper");
    const id = String(req?.user?.userId || "");
    if (!isShop || !id) {
      throw new ForbiddenException("Only a shop account can link WhatsApp.");
    }
    return id;
  }

  /** The session as it stands. Polled by the panel while a QR is up, because
   * the QR rotates and a stale one simply does not scan. */
  @Get("status")
  status(@Req() req: any): Promise<ShopWhatsappState> {
    return this.whatsapp.getState(this.shopIdOf(req));
  }

  /** Switch on: persist the flag, then open a session. A phone linked before
   * reconnects silently; an unlinked shop gets a QR, since a person just
   * clicked and is looking at the panel. */
  @Post("enable")
  @RequiresFeature("whatsappConnect")
  async enable(@Req() req: any): Promise<ShopWhatsappState> {
    const id = this.shopIdOf(req);
    this.throttle(this.lastConnect, id, CONNECT_COOLDOWN_MS);
    await this.whatsapp.setEnabled(id, true);
    await this.whatsapp.connect(id, { interactive: true });
    return this.whatsapp.getState(id);
  }

  /** Switch off. Closes the socket but KEEPS the pairing, so switching back
   * on does not need the phone again. Unlinking is a separate, louder action
   * — see disconnect(). */
  @Post("disable")
  async disable(@Req() req: any): Promise<ShopWhatsappState> {
    const id = this.shopIdOf(req);
    await this.whatsapp.setEnabled(id, false);
    await this.whatsapp.suspend(id);
    return this.whatsapp.getState(id);
  }

  /** "Show QR code" / "Reconnect": a fresh attempt, and the only way to get a
   * new QR after one expired unscanned. */
  @Post("connect")
  @RequiresFeature("whatsappConnect")
  async connect(@Req() req: any): Promise<ShopWhatsappState> {
    const id = this.shopIdOf(req);
    if (!(await this.whatsapp.isSwitchedOn(id))) {
      throw new BadRequestException("Turn WhatsApp on first.");
    }
    this.throttle(this.lastConnect, id, CONNECT_COOLDOWN_MS);
    await this.whatsapp.connect(id, { interactive: true });
    return this.whatsapp.getState(id);
  }

  /** Unlink the phone and delete the pairing. The next link starts from a
   * new QR. */
  @Post("disconnect")
  async disconnect(@Req() req: any): Promise<ShopWhatsappState> {
    const id = this.shopIdOf(req);
    await this.whatsapp.disconnect(id);
    return this.whatsapp.getState(id);
  }

  /** Prove a freshly linked phone can actually send. */
  @Post("send")
  @RequiresFeature("whatsappConnect")
  async send(
    @Req() req: any,
    @Body() dto: SendWhatsappDto,
  ): Promise<{ ok: true }> {
    const id = this.shopIdOf(req);
    this.throttle(
      this.lastTestSend,
      id,
      TEST_SEND_COOLDOWN_MS,
      "Please wait a few seconds before sending another test.",
    );

    // A number typed without a country code is read as local to the shop.
    const shop = await this.shopModel.findById(id).select("country").lean();
    await this.whatsapp.sendText(id, dto.phone, dto.message, shop?.country);
    return { ok: true };
  }

  /**
   * Refuse with 429 if this shop used `stamps` less than `gapMs` ago. Stamped
   * before the work runs, so a burst of clicks is one attempt even when the
   * first is still in flight or fails.
   */
  private throttle(
    stamps: Map<string, number>,
    id: string,
    gapMs: number,
    message = "Please wait a few seconds before trying again.",
  ) {
    const now = Date.now();
    if (now - (stamps.get(id) ?? 0) < gapMs) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
    stamps.set(id, now);
    // Keeps the map from growing with every shop that ever clicked.
    if (stamps.size >= 500) {
      for (const [shopId, at] of stamps) {
        if (now - at >= gapMs) stamps.delete(shopId);
      }
    }
  }
}
