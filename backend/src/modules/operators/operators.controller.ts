import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ForbiddenException,
  Req,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OperatorsService } from "./operators.service";
import { CreateOperatorDto } from "./dto/create-operator.dto";
import { UpdateOperatorDto } from "./dto/update-operator.dto";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";
import { SubscriptionAccessService } from "../../common/subscription/subscription-access.service";

/**
 * Every route here is keyed on an id taken from the URL — an owner's id or an
 * operator's — and those ids leak: the shop id shows up in storefront links and
 * in any JWT a customer can decode. A valid token alone is therefore not
 * enough; the record has to belong to the caller.
 *
 * Extra seats are also a paid add-on, so the whole controller sits behind the
 * "operators" plan key (see frontend/src/lib/planModules.ts).
 */
@Controller("operators")
@UseGuards(AuthGuard("jwt"), SubscriptionGuard)
@RequiresFeature("operators")
export class OperatorsController {
  constructor(
    private readonly operatorsService: OperatorsService,
    private readonly subscriptionAccess: SubscriptionAccessService,
  ) {}

  /**
   * The JWT `sub` (mapped to `userId` by JwtStrategy) is always the OWNER's id.
   * An operator-minted token carries the parent shopkeeper's id plus an
   * `operatorId`, so operators pass their owner's checks with no special case.
   * That is right for tenancy — an operator does act inside its parent shop —
   * but it says nothing about authority, so the write routes below need
   * assertOwnerAccount on top of it.
   */
  private callerId(req: any): string {
    const id = String(req?.user?.userId || "");
    if (!id) throw new ForbiddenException("Not your account");
    return id;
  }

  private assertOwner(req: any, ownerId: string) {
    if (this.callerId(req) !== String(ownerId)) {
      throw new ForbiddenException("Not your account");
    }
  }

  // fetch/update/delete only carry the operator's own id, so ownership has to
  // be read off the stored record before the read or write is allowed.
  private async assertOwnsOperator(req: any, operatorId: string) {
    const { data } = await this.operatorsService.findOne(operatorId);
    const owner = String(data?.shopkeeperId || data?.organizerId || "");
    if (!owner || owner !== this.callerId(req)) {
      throw new ForbiddenException("Not your operator");
    }
  }

  /**
   * Seats may only be created, edited or deleted by the shop OWNER — a token
   * with no `operatorId`. An operator's token carries the parent shop's id, so
   * it clears every ownership check above; without this an operator restricted
   * to, say, Kiosk could mint itself a second seat with every tab enabled and
   * escalate to full shop access.
   *
   * `accessTabs` cannot express this: its finest grain is the "settings" tab,
   * which is the very tab the operator editor lives on, so gating on it would
   * still let any settings-granted operator escalate. Reads stay open (the
   * Settings page lists the shop's seats); only writes are owner-only.
   */
  private assertOwnerAccount(req: any) {
    if (req?.user?.operatorId) {
      throw new ForbiddenException(
        "Only the shop owner can add, edit or remove operators",
      );
    }
  }

  /**
   * AdminGuard is the usual building block for an admin-only route, but it
   * injects JwtService and OperatorsModule does not import JwtModule. The
   * passport guard on the controller has already authenticated the caller, so
   * the role check is the only piece left to do by hand.
   */
  private assertAdmin(req: any) {
    // Same normalisation AdminGuard does: roles is normally an array
    // (["admin"]) but tolerate a single string rather than silently 403.
    const raw = req?.user?.roles;
    const roles = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const isAdmin = roles.some((r: any) => String(r).toLowerCase() === "admin");
    if (!isAdmin) {
      throw new ForbiddenException("Admin access required");
    }
  }

  // ✅ Create operator for a Shopkeeper
  // POST /operators/shopkeeper/:shopkeeperId
  @Post("create-by-shopkeeper/:shopkeeperId")
  async createByShopkeeper(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Body() createOperatorDto: CreateOperatorDto,
  ) {
    this.assertOwnerAccount(req);
    this.assertOwner(req, shopkeeperId);

    // Seats are sold by the plan as { operators: { enabled, limit } }; limit 0
    // means uncapped. findByShopkeeperId already filters out soft-deleted rows,
    // so deleting an operator genuinely frees the seat.
    const limit = await this.subscriptionAccess.limitFor(
      shopkeeperId,
      "operators",
    );
    if (limit > 0) {
      const { data } = await this.operatorsService.findByShopkeeperId(
        shopkeeperId,
      );
      const used = Array.isArray(data) ? data.length : 0;
      if (used >= limit) {
        throw new ForbiddenException({
          statusCode: 403,
          error: "FeatureLimitReached",
          feature: "operators",
          limit,
          used,
          message: `Your plan includes ${limit} operator seat${
            limit === 1 ? "" : "s"
          } and ${used} ${used === 1 ? "is" : "are"} already in use. Remove an operator or upgrade your plan to add more.`,
        });
      }
    }

    return this.operatorsService.createByShopkeeper(
      createOperatorDto,
      shopkeeperId,
    );
  }

  // ✅ Create operator for an Organizer
  // POST /operators/organizer/:organizerId
  @Post("create-by-organizer/:organizerId")
  createByOrganizer(
    @Req() req: any,
    @Param("organizerId") organizerId: string,
    @Body() createOperatorDto: CreateOperatorDto,
  ) {
    // No seat check here: the plan catalog and SubscriptionAccessService are
    // both keyed on shopkeepers, so limitFor() would always read 0 (uncapped)
    // for an organizer id and the cap would be theatre.
    this.assertOwnerAccount(req);
    this.assertOwner(req, organizerId);
    return this.operatorsService.createByOrganizer(
      createOperatorDto,
      organizerId,
    );
  }

  // ✅ Get all operators (admin)
  // GET /operators
  @Get()
  findAll(@Req() req: any) {
    // Cross-shop listing — every operator on the platform, so admin only.
    this.assertAdmin(req);
    return this.operatorsService.findAll();
  }

  // ✅ Get all operators by Shopkeeper ID
  // GET /operators/shopkeeper/:shopkeeperId
  @Get("get-by-shopkeeper/:shopkeeperId")
  findByShopkeeperId(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
  ) {
    this.assertOwner(req, shopkeeperId);
    return this.operatorsService.findByShopkeeperId(shopkeeperId);
  }

  // ✅ Get all operators by Organizer ID
  // GET /operators/organizer/:organizerId
  @Get("get-by-organizer/:organizerId")
  findByOrganizerId(
    @Req() req: any,
    @Param("organizerId") organizerId: string,
  ) {
    this.assertOwner(req, organizerId);
    return this.operatorsService.findByOrganizerId(organizerId);
  }

  // ✅ Get one operator by ID
  // GET /operators/:id
  @Get("fetch/:id")
  async findOne(@Req() req: any, @Param("id") id: string) {
    await this.assertOwnsOperator(req, id);
    return this.operatorsService.findOne(id);
  }

  // ✅ Update operator by ID
  // PATCH /operators/:id
  @Patch("update-operator/:id")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() updateOperatorDto: UpdateOperatorDto,
  ) {
    this.assertOwnerAccount(req);
    await this.assertOwnsOperator(req, id);
    // Re-parenting an operator would hand it to another shop and defeat the
    // check above, so the owning ids are never taken from the body.
    delete (updateOperatorDto as any).shopkeeperId;
    delete (updateOperatorDto as any).organizerId;
    return this.operatorsService.update(id, updateOperatorDto);
  }

  // ✅ Delete operator by ID
  // DELETE /operators/:id
  @Delete("delete-operator/:id")
  async remove(@Req() req: any, @Param("id") id: string) {
    this.assertOwnerAccount(req);
    await this.assertOwnsOperator(req, id);
    return this.operatorsService.remove(id);
  }
}
