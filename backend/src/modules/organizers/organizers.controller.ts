import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
  Req,
  UseInterceptors,
  ParseUUIDPipe,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { OrganizersService } from "./organizers.service";
import { LocalDto } from "../auth/dto/local.dto";
import { LoginDto } from "../admin/dto/login.dto";
import { AuthGuard } from "@nestjs/passport";
import { AdminGuard } from "../auth/guards/admin.guard";
import { CreateOrganizerDto } from "./dto/createOrganizer.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { UpdateOrganizerDto } from "./dto/updateOrganizer.dto";
import { diskStorage } from "multer";
import { extname } from "path";

function qrStorage() {
  return diskStorage({
    destination: (_req, _file, cb) => cb(null, "./uploads/organizerPayments"),
    filename: (req, file, cb) => {
      // filename pattern: <shopkeeperId>-<timestamp>.<ext>
      const id = req.params?.id || "unknown";
      const ts = Date.now();
      const ext = extname(file.originalname || "") || ".png";
      cb(null, `${id}-${ts}${ext}`);
    },
  });
}

@Controller("organizers")
export class OrganizersController {
  constructor(private organizersService: OrganizersService) {}

  /**
   * `:id` on the organizer-scoped routes is the organizer being read or
   * changed, so the caller must be that organizer. An operator's token is
   * minted under the parent organizer's id (sub -> userId in jwt.strategy,
   * with operatorId alongside), so this one comparison covers operators too.
   * Admins pass regardless — the admin console manages organizers on their
   * behalf.
   */
  private assertSelfOrAdmin(req: any, id: string) {
    const rawRoles = req?.user?.roles;
    const roles = Array.isArray(rawRoles)
      ? rawRoles
      : rawRoles
        ? [rawRoles]
        : [];
    if (roles.some((r: any) => String(r).toLowerCase() === "admin")) return;

    const callerId = String(req?.user?.userId || "");
    if (!callerId || callerId !== String(id || "")) {
      throw new ForbiddenException("Not your organizer account");
    }
  }

  // Raw insert with an arbitrary body — it can set approved/subscribed
  // directly, so it stays admin-only. Public signup goes through
  // POST /organizers/register, which forces pending + unapproved.
  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() body: any) {
    return this.organizersService.create(body);
  }

  @Post("register")
  async register(@Body() dto: CreateOrganizerDto) {
    return await this.organizersService.registerOrganizer(dto);
  }

  // New endpoint to request an OTP
  @Post("request-otp")
  async requestOTP(@Body("businessEmail") email: string) {
    return this.organizersService.requestOTP(email);
  }

  // New endpoint to verify the OTP and log in
  @Post("login")
  async verifyOTP(
    @Body("businessEmail") email: string,
    @Body("otp") otp: string,
  ) {
    return this.organizersService.verifyOTP(email, otp);
  }

  // New endpoint to resend the OTP
  @Post("resend-otp")
  async resendOTP(@Body("businessEmail") email: string) {
    return this.organizersService.resendOTP(email);
  }

  @Get("events")
  @UseGuards(AuthGuard("jwt"))
  async list(@Req() req) {
    try {
      const organizerId = req.user.userId;
      return this.organizersService.list(organizerId);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get("dashboard-data")
  @UseGuards(AuthGuard("jwt"))
  async getDashboardData(@Req() req) {
    try {
      const organizerId = req.user.userId;
      return this.organizersService.getDashboardDataForOrganizer(organizerId);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get(":email")
  @UseGuards(AuthGuard("jwt"))
  async getByEmail(@Req() req, @Param("email") email: string) {
    try {
      const result = await this.organizersService.findByEmail(email);
      // Returns the whole organizer record (payment QR, GST, subscription),
      // so it is a self-lookup only. Checked on the record's id rather than
      // its email because an operator's token carries the operator's own
      // email but the parent organizer's id.
      this.assertSelfOrAdmin(req, String((result as any)?.data?._id ?? ""));
      return result;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Get("profile-get/:id")
  @UseGuards(AuthGuard("jwt"))
  async getProfile(@Req() req, @Param("id") id: string) {
    try {
      this.assertSelfOrAdmin(req, id);
      return this.organizersService.getProfile(id);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  // Approval is the admin's call — organizers must not be able to flip their
  // own approved flag (the admin console uses PATCH /admin/approve/:id).
  @Patch(":id/approve")
  @UseGuards(AdminGuard)
  async approve(@Param("id") id: string) {
    return this.organizersService.approve(id);
  }

  @Patch("profile/:id")
  // Guards run before interceptors, so an unauthorized caller never gets a
  // QR image written to ./uploads/organizerPayments.
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
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
    }),
  )
  async updateProfile(
    @Req() req,
    @Param("id") id: string,
    @UploadedFile() paymentFile: Express.Multer.File,
    @Body() body: UpdateOrganizerDto,
  ) {
    // Outside the try: the catch below swallows instead of rethrowing, which
    // would turn the 403 into a silent success.
    this.assertSelfOrAdmin(req, id);

    try {
      const paymentQrPublicUrl = paymentFile?.filename
        ? `/uploads/organizerPayments/${paymentFile.filename}`
        : null;

      return this.organizersService.updateProfile(id, body, paymentQrPublicUrl);
    } catch (error) {
      console.log(error);
    }
  }

  @Get("organizer/:slug")
  async getOrganizerBySlug(@Param("slug") slug: string) {
    try {
      return await this.organizersService.getOrganizerBySlug(slug);
    } catch (error) {
      throw error;
    }
  }

  @Patch("add-subscription-plan-for-organizer/:id/plan/:planSelected")
  @UseGuards(AuthGuard("jwt"))
  async addSubscriptionPlan(
    @Req() req,
    @Param("id") id: string,
    @Param("planSelected") planSelected: string,
  ) {
    try {
      this.assertSelfOrAdmin(req, id);
      return await this.organizersService.addSubscriptionPlan(id, planSelected);
    } catch (error) {
      throw error;
    }
  }

  @Patch("cancel-subscription-for-organizer/:id")
  @UseGuards(AuthGuard("jwt"))
  async cancelSubscription(@Req() req, @Param("id") id: string) {
    try {
      this.assertSelfOrAdmin(req, id);
      return await this.organizersService.cancelSubscription(id);
    } catch (error) {
      throw error;
    }
  }
}
