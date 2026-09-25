import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ShopkeepersService } from "./shopkeepers.service";
import { CreateShopkeeperDto } from "./dto/createShopkeeper.dto";
import { AuthGuard } from "@nestjs/passport";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../auth/guards/admin.guard";
import { diskStorage } from "multer";
import { extname } from "path";
import { FileInterceptor } from "@nestjs/platform-express";
import { CreateRazorpayLinkedAccountDto } from "./dto/razorpay.dto";
import { CreateRazorpayStakeholderDto } from "./dto/razorpay-stakeholder.dto";
import { SaveDirectKeysDto, ToggleDirectDto } from "./dto/razorpay-direct.dto";
import { UpdateShopkeeperDto } from "./dto/updateShopkeeper.dto";

function qrStorage() {
  return diskStorage({
    destination: (_req, _file, cb) => cb(null, "./uploads/shopkeeperPayment"),
    filename: (req, file, cb) => {
      // filename pattern: <shopkeeperId>-<timestamp>.<ext>
      const id = req.params?.id || "unknown";
      const ts = Date.now();
      const ext = extname(file.originalname || "") || ".png";
      cb(null, `${id}-${ts}${ext}`);
    },
  });
}

/**
 * Same passport-jwt verification as AuthGuard("jwt"), except a missing,
 * malformed or expired token leaves req.user undefined instead of raising 401.
 * The two lookup routes below have to stay open to anonymous shoppers (the
 * storefront and checkout read shop details before anyone signs in), so they
 * verify whoever *did* send a token and fall back to a public projection for
 * everyone else.
 */
@Injectable()
class OptionalJwtGuard extends AuthGuard("jwt") {
  handleRequest(_err: any, user: any): any {
    return user || null;
  }
}

@Controller("shopkeepers")
export class ShopkeepersController {
  constructor(private shopkeepersService: ShopkeepersService) {}

  /**
   * The subscription and profile routes below take a shop id from the URL, and
   * shop ids are public — they sit in cart and storefront links — so a valid
   * token alone proves nothing. The record has to belong to the caller.
   *
   * The JWT subject is always the owning shopkeeper: an operator token is
   * minted with the parent owner's id (auth.controller mintShopkeeperToken),
   * so operators pass their owner's checks without a separate branch.
   * `userId` comes from the passport strategy, `sub` from the raw payload that
   * JwtAuthGuard/AdminGuard attach — accept either, as the rest of this file does.
   *
   * Platform admins are let through so support can repair a shop's plan.
   */
  private isSelfOrAdmin(req: any, shopkeeperId: string): boolean {
    const roles = Array.isArray(req?.user?.roles) ? req.user.roles : [];
    if (roles.some((r: any) => String(r).toLowerCase() === "admin")) return true;

    const callerId = String(req?.user?.userId || req?.user?.sub || "");
    return !!callerId && callerId === String(shopkeeperId);
  }

  private assertSelfOrAdmin(req: any, shopkeeperId: string) {
    if (!this.isSelfOrAdmin(req, shopkeeperId)) {
      throw new ForbiddenException("Not your shop");
    }
  }

  /**
   * What an anonymous visitor is allowed to see of a shop. The stored document
   * also carries the owner's personal e-mail, business e-mail, plan and billing
   * history and the whole Razorpay KYC block (PAN, bank account, IFSC, uploaded
   * document ids, encrypted key secret) — a shopper needs none of it, so
   * callers who have not proven they are this shop get this projection instead
   * of the document.
   *
   * Every field here is one a public storefront or checkout actually reads; see
   * cartPage, paymentPage, productDetailDialog, StorefrontTemplate and
   * KioskCheckoutDialog. Dropping one silently breaks checkout, so add rather
   * than trim when a storefront starts needing a new field.
   */
  private toPublicShopView(shop: any) {
    if (!shop) return shop;
    const s = typeof shop?.toObject === "function" ? shop.toObject() : shop;
    const rzp = s.razorpay;
    return {
      _id: s._id,
      shopName: s.shopName,
      address: s.address, // pickup address shown on the checkout screen
      whatsappNumber: s.whatsappNumber, // where the order message is sent
      phone: s.phone, // the SG PayNow QR is generated from this number
      country: s.country, // drives currency and the tax/QR variants
      GSTNumber: s.GSTNumber, // printed on the customer's own receipt
      hasDocVerification: s.hasDocVerification,
      paymentURL: s.paymentURL, // payment QR image the shopper scans
      dynamicQR: s.dynamicQR,
      taxPercentage: s.taxPercentage,
      discountPercentage: s.discountPercentage,
      deliveryEnabled: s.deliveryEnabled,
      deliveryRules: s.deliveryRules,
      pickupDateRequired: s.pickupDateRequired,
      pickupMinDays: s.pickupMinDays,
      pickupMessage: s.pickupMessage,
      shopClosedFromDate: s.shopClosedFromDate,
      shopClosedToDate: s.shopClosedToDate,
      // Only the flags checkout needs to decide whether to offer Razorpay.
      // directKeyId is the publishable half of the key pair (it is handed to
      // the browser by the checkout flow anyway); the secret, bank and KYC
      // fields sitting next to it in the sub-document never leave the server.
      razorpay: rzp
        ? {
            mode: rzp.mode,
            status: rzp.status,
            accountId: rzp.accountId,
            directKeyId: rzp.directKeyId,
            directEnabled: rzp.directEnabled,
          }
        : null,
    };
  }

  @Post()
  async create(@Body() body: CreateShopkeeperDto) {
    return this.shopkeepersService.create(body);
  }

  // Whole-fleet dump (every shop's contact and billing row), so admin-only.
  @Get("get-all-shopkeepers")
  @UseGuards(AdminGuard)
  async list() {
    try {
      return await this.shopkeepersService.list();
    } catch (error) {
      throw error;
    }
  }

  // Must stay above @Get(":email"): Nest matches in declaration order, so the
  // wildcard below was swallowing /shopkeepers/profile and serving it
  // unauthenticated as a lookup for the literal e-mail "profile".
  @Get("profile")
  @UseGuards(AuthGuard("jwt"))
  async getProfile(@Req() req: any) {
    try {
      const shopkeeperId = req.user.userId || req.user.sub;
      return await this.shopkeepersService.get(shopkeeperId);
    } catch (error) {
      throw error;
    }
  }

  // Anyone may look a shop up by e-mail (it is how a storefront link resolves),
  // but the e-mail in the URL proves nothing about the caller, so a stranger
  // gets the public projection. Identity is checked against the record's own
  // id, since that is what a shopkeeper token carries.
  @Get(":email")
  @UseGuards(OptionalJwtGuard)
  async getByEmail(@Param("email") email: string, @Req() req: any) {
    try {
      const result = await this.shopkeepersService.getByEmail(email);
      if (!result) return result;
      if (this.isSelfOrAdmin(req, String(result.data?._id ?? ""))) return result;
      return { ...result, data: this.toPublicShopView(result.data) };
    } catch (error) {
      throw error;
    }
  }

  // OTP-based shopkeeper authentication has been removed — sign-in is now
  // Google-only via /auth/google-shopkeeper (operator-aware). The legacy
  // request-otp / verify-otp / resend-otp / login endpoints are retired.

  @Post("razorpay/setup")
  @UseGuards(AuthGuard("jwt"))
  async setupRazorpay(
    @Body() dto: CreateRazorpayLinkedAccountDto,
    @Req() req: any,
  ) {
    const shopkeeperId = req.user.userId || req.user.sub;
    return this.shopkeepersService.createRazorpayLinkedAccount(
      shopkeeperId,
      dto,
    );
  }

  /** One-click enable: switch shop to platform mode. All checkout payments
   *  from this shop will collect into KiosCart's master Razorpay account. */
  @Post("razorpay/enable-platform")
  @UseGuards(AuthGuard("jwt"))
  async enableRazorpayPlatform(@Req() req: any) {
    const shopkeeperId = req.user.userId || req.user.sub;
    return this.shopkeepersService.enableRazorpayPlatformMode(shopkeeperId);
  }

  @Get("razorpay/platform-status")
  @UseGuards(AuthGuard("jwt"))
  async getRazorpayPlatformStatus(@Req() req: any) {
    const shopkeeperId = req.user.userId || req.user.sub;
    return this.shopkeepersService.getRazorpayPlatformStatus(shopkeeperId);
  }

  @Get("razorpay/status/:accountId")
  @UseGuards(AuthGuard("jwt"))
  async getRazorpayStatus(@Param("accountId") accountId: string) {
    return this.shopkeepersService.checkRazorpayAccountStatus(accountId);
  }

  @Post("razorpay/stakeholder")
  @UseGuards(AuthGuard("jwt"))
  async createRazorpayStakeholder(
    @Body() dto: CreateRazorpayStakeholderDto,
    @Req() req: any,
  ) {
    return this.shopkeepersService.createRazorpayStakeholder(
      req.user.userId || req.user.sub,
      dto,
    );
  }

  @Post("razorpay/documents/:slot")
  @UseGuards(AuthGuard("jwt"))
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype.startsWith("image/") ||
          file.mimetype === "application/pdf";
        cb(
          ok ? null : new BadRequestException("Only images or PDF allowed"),
          ok,
        );
      },
    }),
  )
  async uploadRazorpayKycDocument(
    @Param("slot") slot: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const allowed = ["panFront", "addressProof", "cancelledCheque", "gstCert"];
    if (!allowed.includes(slot)) {
      throw new BadRequestException(`Invalid document slot: ${slot}`);
    }
    return this.shopkeepersService.uploadRazorpayKycDocument(
      req.user.userId || req.user.sub,
      slot as any,
      file as any,
    );
  }

  @Post("razorpay/submit-for-review")
  @UseGuards(AuthGuard("jwt"))
  async submitRazorpayForReview(@Req() req: any) {
    return this.shopkeepersService.submitRazorpayForReview(
      req.user.userId || req.user.sub,
    );
  }

  /** Direct mode: shopkeeper saves their own Razorpay account keys. */
  @Post("razorpay/direct/save")
  @UseGuards(AuthGuard("jwt"))
  async saveRazorpayDirectKeys(
    @Body() body: SaveDirectKeysDto,
    @Req() req: any,
  ) {
    const shopkeeperId = req.user.userId || req.user.sub;
    return this.shopkeepersService.saveDirectRazorpayKeys(
      shopkeeperId,
      body.keyId,
      body.keySecret,
    );
  }

  @Get("razorpay/direct/status")
  @UseGuards(AuthGuard("jwt"))
  async getRazorpayDirectStatus(@Req() req: any) {
    const shopkeeperId = req.user.userId || req.user.sub;
    return this.shopkeepersService.getDirectRazorpayStatus(shopkeeperId);
  }

  @Post("razorpay/direct/toggle")
  @UseGuards(AuthGuard("jwt"))
  async toggleRazorpayDirect(
    @Body() body: ToggleDirectDto,
    @Req() req: any,
  ) {
    const shopkeeperId = req.user.userId || req.user.sub;
    return this.shopkeepersService.setDirectRazorpayEnabled(
      shopkeeperId,
      !!body.enabled,
    );
  }

  @Post("register")
  async register(@Body() body: CreateShopkeeperDto) {
    try {
      return await this.shopkeepersService.register(body);
    } catch (error) {
      throw error;
    }
  }

  // Shop ids travel in storefront and cart links, so this has to answer
  // anonymous shoppers — but with the storefront/checkout fields only. The
  // owner (or an admin) presenting a token still gets the whole record, which
  // is what the dashboard and settings screens load.
  //
  // NOTE: the path is declared with a capital S while every caller uses
  // lowercase; it only resolves because the router matches case-insensitively.
  // Renaming it means touching all of those callers, so it is left alone here.
  @Get("Shopkeeper-detail/:id")
  @UseGuards(OptionalJwtGuard)
  async getShopkeeperDetail(@Param("id") id: string, @Req() req: any) {
    try {
      const result = await this.shopkeepersService.get(id);
      if (this.isSelfOrAdmin(req, id)) return result;
      return { ...result, data: this.toPublicShopView(result.data) };
    } catch (error) {
      // Unchanged from before: an unknown id answers empty rather than 404.
    }
  }

  // Rewrites tax, branding and payment fields. Guards run before interceptors,
  // so an unauthenticated caller is rejected before multer stores the upload.
  @Patch("profile/:id")
  @UseGuards(AuthGuard("jwt"))
  @UseInterceptors(
    FileInterceptor("paymentURL", {
      storage: qrStorage(),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          return cb(
            new BadRequestException("Only image files are allowed"),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateProfile(
    @Param("id") id: string,
    @UploadedFile() paymentURL: Express.Multer.File,
    @Body() body: any, // or UpdateShopkeeperDto if you bind DTO validation
    @Req() req: any,
  ) {
    this.assertSelfOrAdmin(req, id);

    // Construct public URL if a file was uploaded.
    // main.ts serves /uploads, so this becomes accessible at http://localhost:3000/uploads/...
    const paymentQrPublicUrl = paymentURL?.filename
      ? `/uploads/shopkeeperPayment/${paymentURL.filename}`
      : null;

    return this.shopkeepersService.updateProfile(id, body, paymentQrPublicUrl);
  }

  @Get("profile/:whatsAppNumber")
  async getProfileByWhatsAppNumber(
    @Param("whatsAppNumber") whatsAppNumber: string,
  ) {
    try {
      return await this.shopkeepersService.whatsAppNumberExists(whatsAppNumber);
    } catch (error) {
      throw error;
    }
  }

  @Post("create-shopkeeper-by-organizer/:organizerId")
  async createUserByOrganizer(
    @Body() createUserDto: CreateShopkeeperDto,
    @Param("organizerId") organizerId: string,
  ) {
    try {
      return await this.shopkeepersService.createShopkeeperByOrganizer(
        createUserDto,
        organizerId,
      );
    } catch (error) {
      throw error;
    }
  }

  @Patch("update-shopkeeper-by-organizer/:organizerId/:shopkeeperId")
  async updateUserByOrganizer(
    @Param("organizerId") organizerId: string,
    @Param("shopkeeperId") shopkeeperId: string,
    @Body() updateUserDto: UpdateShopkeeperDto,
  ) {
    try {
      return await this.shopkeepersService.updateShopkeeperByOrganizer(
        shopkeeperId,
        updateUserDto,
        organizerId,
      );
    } catch (error) {
      throw error;
    }
  }

  @Get("fetch-shopkeepers-by-organizer/:organizerId")
  async fetchUsersByorganizerId(@Param("organizerId") organizerId: string) {
    try {
      return await this.shopkeepersService.fetchShopkeeperByOrganizerId(
        organizerId,
      );
    } catch (error) {
      throw error;
    }
  }

  // Returns the plan plus the full module matrix — i.e. exactly what the shop
  // has paid for — so it is the owner's business and nobody else's.
  @Get("subscription/:id")
  @UseGuards(AuthGuard("jwt"))
  async getSubscription(@Param("id") id: string, @Req() req: any) {
    this.assertSelfOrAdmin(req, id);
    return this.shopkeepersService.getSubscription(id);
  }

  // Unguarded this was a straight paywall bypass: anyone could move any shop
  // onto any active plan. A shopkeeper may switch their own plan, nobody else's.
  @Patch("add-subscription-plan/:id/plan/:planId")
  @UseGuards(AuthGuard("jwt"))
  async addSubscriptionPlan(
    @Param("id") id: string,
    @Param("planId") planId: string,
    @Req() req: any,
  ) {
    this.assertSelfOrAdmin(req, id);
    return this.shopkeepersService.addSubscriptionPlan(id, planId);
  }

  @Patch("cancel-subscription/:id")
  @UseGuards(AuthGuard("jwt"))
  async cancelSubscription(@Param("id") id: string, @Req() req: any) {
    this.assertSelfOrAdmin(req, id);
    return this.shopkeepersService.cancelSubscription(id);
  }

  // Fleet-wide maintenance sweep: downgrades every expired shop and prunes
  // their products to the default plan's limit. Platform operation, not a
  // shopkeeper one.
  @Post("check-expired-subscriptions")
  @UseGuards(AdminGuard)
  async checkExpiredSubscriptions() {
    return this.shopkeepersService.checkAndDowngradeExpired();
  }
}
