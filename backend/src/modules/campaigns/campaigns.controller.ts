import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";
import { TabsGuard } from "../../common/tabs/tabs.guard";
import { Tabs } from "../../common/tabs/tabs.decorator";
import { CampaignRequestDto } from "./dto/campaign-request.dto";
import { SetOptOutDto } from "./dto/opt-out.dto";
import { CampaignCreator } from "./entities/whatsapp-campaign.entity";
import {
  CampaignDetail,
  CampaignPreview,
  CampaignSummary,
  CampaignsService,
} from "./campaigns.service";
import { CampaignAudienceService } from "./campaign-audience";

/**
 * CRM › WhatsApp Campaign: personalised messages from the shop's own linked
 * number to the shop's own customers.
 *
 * The shop is always the one in the token — never an id from the URL or the
 * body — and the audience is customer ids the server checks belong to it.
 * A route that let a caller name the shop, or post phone numbers, would let
 * anyone use a shop's WhatsApp to message anyone.
 *
 * Three guards, in order: a valid login; the plan; and, for operators, the
 * `crm` access tab, re-read from the database on every request.
 *
 * The plan is required per route. Previewing needs the campaign feature only,
 * so a shop can write and check a campaign before linking WhatsApp; sending
 * and resuming need the WhatsApp add-on too. Reading history, stopping a
 * campaign and the opt-out list stay open after a plan lapses: a shop must
 * always be able to stop sending and to honour a customer's "no more
 * messages".
 */
@Controller("campaigns/whatsapp")
@UseGuards(AuthGuard("jwt"), SubscriptionGuard, TabsGuard)
@Tabs("crm")
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly audience: CampaignAudienceService,
  ) {}

  /**
   * The shop this request acts for. Operators carry their parent shop's id as
   * `userId` and the "shopkeeper" role, so they resolve to the shop too; other
   * account types have no customers to message.
   */
  private shopIdOf(req: any): string {
    const raw = req?.user?.roles;
    const roles: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const isShop = roles.some((r) => String(r).toLowerCase() === "shopkeeper");
    const id = String(req?.user?.userId || "");
    if (!isShop || !id) {
      throw new ForbiddenException(
        "Only a shop account can send WhatsApp campaigns.",
      );
    }
    return id;
  }

  /** Who is starting it — the owner, or which operator — for the history. */
  private creatorOf(req: any): CampaignCreator {
    return {
      userId: String(req?.user?.userId || ""),
      operatorId: req?.user?.operatorId ? String(req.user.operatorId) : null,
      name: String(req?.user?.name || ""),
    };
  }

  @Post("preview")
  @HttpCode(200)
  @RequiresFeature("crmMarketingCampaign")
  preview(
    @Req() req: any,
    @Body() dto: CampaignRequestDto,
  ): Promise<CampaignPreview> {
    return this.campaigns.preview(this.shopIdOf(req), dto);
  }

  @Post()
  @RequiresFeature("crmMarketingCampaign", "whatsappConnect")
  create(
    @Req() req: any,
    @Body() dto: CampaignRequestDto,
  ): Promise<CampaignSummary> {
    return this.campaigns.create(this.shopIdOf(req), dto, this.creatorOf(req));
  }

  @Get()
  list(@Req() req: any): Promise<CampaignSummary[]> {
    return this.campaigns.list(this.shopIdOf(req));
  }

  // Declared before `:id`, which would otherwise read "opt-outs" as an id.
  @Get("opt-outs")
  optOuts(@Req() req: any): Promise<{ customerIds: string[] }> {
    return this.audience.listOptOuts(this.shopIdOf(req));
  }

  @Put("opt-outs/:customerId")
  setOptOut(
    @Req() req: any,
    @Param("customerId") customerId: string,
    @Body() dto: SetOptOutDto,
  ): Promise<{ customerId: string; optedOut: boolean }> {
    return this.audience.setOptOut(
      this.shopIdOf(req),
      customerId,
      dto.optedOut,
    );
  }

  @Get(":id")
  detail(@Req() req: any, @Param("id") id: string): Promise<CampaignDetail> {
    return this.campaigns.detail(this.shopIdOf(req), id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Req() req: any, @Param("id") id: string): Promise<CampaignSummary> {
    return this.campaigns.cancel(this.shopIdOf(req), id);
  }

  @Post(":id/resume")
  @HttpCode(200)
  @RequiresFeature("crmMarketingCampaign", "whatsappConnect")
  resume(@Req() req: any, @Param("id") id: string): Promise<CampaignSummary> {
    return this.campaigns.resume(this.shopIdOf(req), id);
  }
}
