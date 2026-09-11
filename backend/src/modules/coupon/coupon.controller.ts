import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ForbiddenException,
  Req,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CouponService } from "./coupon.service";
import { CreateCouponDto } from "./dto/create-coupon.dto";
import { UpdateCouponDto } from "./dto/update-coupon.dto";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";

/**
 * Guards are per-route rather than on the controller: the two customer-facing
 * routes at the bottom (coupon lookup at checkout, and the shop's list of live
 * coupons) are hit by shoppers who are not logged in as the shop, so the
 * storefront breaks the moment a token is required there.
 *
 * Everything that writes a coupon or reads the full (including expired and
 * deactivated) list is shop management and is gated on the "coupons" plan key —
 * see frontend/src/lib/planModules.ts.
 */
@Controller("coupons")
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  /**
   * The JWT `sub` (mapped to `userId` by JwtStrategy) is the owning shopkeeper
   * or organizer. Operator-minted tokens carry the parent owner's id, so an
   * operator passes their owner's checks without a special case.
   */
  private callerId(req: any): string {
    const id = String(req?.user?.userId || "");
    if (!id) throw new ForbiddenException("Not your account");
    return id;
  }

  private assertOwner(req: any, ownerId: string) {
    if (this.callerId(req) !== String(ownerId)) {
      throw new ForbiddenException("Not your coupons");
    }
  }

  /**
   * AdminGuard is the usual building block here, but it injects JwtService and
   * CouponModule does not import JwtModule. The passport guard on the route has
   * already authenticated the caller, so only the role check is left.
   */
  private isAdmin(req: any): boolean {
    // Same normalisation as AdminGuard: roles is normally an array (["admin"])
    // but a bare string is accepted defensively.
    const raw = req?.user?.roles;
    const roles = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return roles.some((r: any) => String(r).toLowerCase() === "admin");
  }

  // The id-only routes carry no owner, so ownership is read off the stored
  // coupon. Platform admins are deliberately allowed through to every coupon —
  // ownerless GLOBAL ones, which nobody else can reach, and tenant-owned ones,
  // which they need for support and abuse handling.
  private async assertOwnsCoupon(req: any, id: string) {
    const coupon = await this.couponService.findOne(id);
    const owner = String(coupon.shopkeeperId || coupon.organizerId || "");
    if (owner && owner === this.callerId(req)) return coupon;
    if (this.isAdmin(req)) return coupon;
    throw new ForbiddenException("Not your coupon");
  }

  /* ================= CREATE COUPON ================= */
  @Post("create-coupon")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("coupons")
  create(@Req() req: any, @Body() createCouponDto: CreateCouponDto) {
    // Both scope ids arrive in the body, so both are set from the token rather
    // than trusted: the id for the declared scope is overwritten and the other
    // one is dropped. Clearing the unused id matters as much as setting the
    // used one — a body carrying the *other* scope's id would otherwise plant a
    // live coupon on another tenant, since only the declared scope is checked.
    if (createCouponDto.appliesTo === "ORGANIZER") {
      createCouponDto.organizerId = this.callerId(req);
      delete (createCouponDto as any).shopkeeperId;
    } else if (createCouponDto.appliesTo === "GLOBAL") {
      // Platform-wide discount: valid on every shop, so it is not a shop's to
      // create, and it belongs to no tenant.
      if (!this.isAdmin(req)) {
        throw new ForbiddenException(
          "Platform-wide coupons can only be created by an admin",
        );
      }
      delete (createCouponDto as any).shopkeeperId;
      delete (createCouponDto as any).organizerId;
    } else {
      createCouponDto.shopkeeperId = this.callerId(req);
      delete (createCouponDto as any).organizerId;
    }
    return this.couponService.create(createCouponDto);
  }

  /* ================= GET ALL COUPONS ================= */
  @Get("get-all-coupons")
  @UseGuards(AuthGuard("jwt"))
  findAll(@Req() req: any) {
    // Every coupon on the platform, across all shops — admin only. No plan gate
    // here: an admin has no plan of their own to check.
    if (!this.isAdmin(req)) {
      throw new ForbiddenException("Admin access required");
    }
    return this.couponService.findAll();
  }

  /* ================= GET COUPONS BY SHOPKEEPER ================= */
  // PUBLIC on purpose: this is the shopper's list of currently-valid coupons on
  // the cart page (frontend cartPage.tsx fetches it with no token), and it only
  // ever returns active, unexpired coupons for that one shop.
  @Get("shopkeeper/:shopkeeperId")
  findByShopkeeper(@Param("shopkeeperId") shopkeeperId: string) {
    return this.couponService.findByShopkeeper(shopkeeperId);
  }

  // The shopkeeper's own management list: unlike the route above it includes
  // expired and deactivated coupons, so it is owner-only.
  @Get("shopkeeper-coupons/:shopkeeperId")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("coupons")
  findForShopkeeper(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
  ) {
    this.assertOwner(req, shopkeeperId);
    return this.couponService.findForShopkeeper(shopkeeperId);
  }

  /* ================= GET COUPONS BY ORGANIZER ================= */
  @Get("organizer/:organizerId")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("coupons")
  findByOrganizer(@Req() req: any, @Param("organizerId") organizerId: string) {
    this.assertOwner(req, organizerId);
    return this.couponService.findByOrganizer(organizerId);
  }

  /* ================= GET SINGLE COUPON ================= */
  @Get("get-coupon/:id")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("coupons")
  async findOne(@Req() req: any, @Param("id") id: string) {
    return this.assertOwnsCoupon(req, id);
  }

  /* ================= UPDATE COUPON ================= */
  @Patch("update-coupon/:id")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("coupons")
  async update(
    @Req() req: any,
    @Param("id") id: string,
    @Body() updateCouponDto: UpdateCouponDto,
  ) {
    await this.assertOwnsCoupon(req, id);
    // Scope is ownership: letting a PATCH move a coupon onto another shop would
    // undo the check above, so those keys never pass through an update.
    delete (updateCouponDto as any).shopkeeperId;
    delete (updateCouponDto as any).organizerId;
    delete (updateCouponDto as any).appliesTo;
    return this.couponService.update(id, updateCouponDto);
  }

  /* ================= DELETE COUPON (SOFT DELETE) ================= */
  @Delete("delete-coupon/:id")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("coupons")
  async remove(@Req() req: any, @Param("id") id: string) {
    await this.assertOwnsCoupon(req, id);
    return this.couponService.remove(id);
  }

  /* ================= VALIDATE / APPLY COUPON ================= */
  // PUBLIC on purpose: a shopper applies a coupon at checkout without ever
  // holding a shopkeeper token.
  @Post("validate")
  validateCoupon(
    @Body("code") code: string,
    @Body("orderAmount") orderAmount: number,
  ) {
    return this.couponService.validateCoupon(code, orderAmount);
  }

  // PUBLIC on purpose — same reason as /validate, for event coupons.
  @Post("Validate-Event-Coupon")
  validateEventCoupon(
    @Body("code") code: string,
    @Body("orderAmount") orderAmount: number,
    @Body("eventId") eventId: string,
  ) {
    return this.couponService.validateEventCoupon(code, eventId, orderAmount);
  }
}
