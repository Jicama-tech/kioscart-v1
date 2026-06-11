import {
  BadRequestException,
  Body,
  Controller,
  Get,
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

@Controller("shopkeepers")
export class ShopkeepersController {
  constructor(private shopkeepersService: ShopkeepersService) {}

  @Post()
  async create(@Body() body: CreateShopkeeperDto) {
    return this.shopkeepersService.create(body);
  }

  @Get("get-all-shopkeepers")
  async list() {
    try {
      return await this.shopkeepersService.list();
    } catch (error) {
      throw error;
    }
  }

  @Get(":email")
  async getByEmail(@Param("email") email: string) {
    try {
      return await this.shopkeepersService.getByEmail(email);
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

  @Get("profile")
  @UseGuards(AuthGuard("jwt"))
  async getProfile(@Req() req: any) {
    try {
      const shopkeeperId = req.user.sub;
      return await this.shopkeepersService.get(shopkeeperId);
    } catch (error) {
      throw error;
    }
  }

  @Post("register")
  async register(@Body() body: CreateShopkeeperDto) {
    try {
      return await this.shopkeepersService.register(body);
    } catch (error) {
      throw error;
    }
  }

  @Get("Shopkeeper-detail/:id")
  async getShopkeeperDetail(@Param("id") id: string) {
    try {
      console.log(id, "Vansh ");
      return await this.shopkeepersService.get(id);
    } catch (error) {}
  }

  @Patch("profile/:id")
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
  ) {
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

  @Get("subscription/:id")
  async getSubscription(@Param("id") id: string) {
    return this.shopkeepersService.getSubscription(id);
  }

  @Patch("add-subscription-plan/:id/plan/:planId")
  async addSubscriptionPlan(
    @Param("id") id: string,
    @Param("planId") planId: string,
  ) {
    return this.shopkeepersService.addSubscriptionPlan(id, planId);
  }

  @Patch("cancel-subscription/:id")
  async cancelSubscription(@Param("id") id: string) {
    return this.shopkeepersService.cancelSubscription(id);
  }

  @Post("check-expired-subscriptions")
  async checkExpiredSubscriptions() {
    return this.shopkeepersService.checkAndDowngradeExpired();
  }
}
