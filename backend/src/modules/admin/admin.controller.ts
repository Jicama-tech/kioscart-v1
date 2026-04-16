import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import { CreateAdminDto } from "./dto/create-admin.dto";
import { LocalDto } from "../auth/dto/local.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
// import { UpdateAdminDto } from './dto/update-admin.dto';

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("create-admin")
  // @UseGuards(JwtAuthGuard)
  async create(@Body() createAdminDto: CreateAdminDto) {
    try {
      // const creatorId = req.user.sub; // sub from JWT payload
      return this.adminService.create(createAdminDto);
    } catch (error) {
      throw error;
    }
  }

  @Post("login-admin")
  login(@Body() dto: LoginDto) {
    try {
      return this.adminService.login(dto);
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @Get("dashboard-stats")
  @UseGuards(JwtAuthGuard)
  pendingApprovals() {
    try {
      return this.adminService.getDashboardData();
    } catch (error) {
      throw error;
    }
  }

  @Patch("approve/:id")
  @UseGuards(JwtAuthGuard)
  approveApplicant(
    @Param("id") id: string,
    @Body("role") role: "Organizer" | "Shopkeeper",
  ) {
    try {
      return this.adminService.approveApplicant(id, role);
    } catch (error) {
      throw error;
    }
  }

  // ✅ Reject Applicant (Organizer or Shopkeeper)
  @Patch("reject/:id")
  @UseGuards(JwtAuthGuard)
  rejectApplicant(
    @Param("id") id: string,
    @Body("role") role: "Organizer" | "Shopkeeper",
  ) {
    try {
      return this.adminService.rejectApplicant(id, role);
    } catch (error) {
      throw error;
    }
  }

  @Get()
  findAll() {
    return this.adminService.findAll();
  }

  @Get("shopkeepers-overview")
  @UseGuards(JwtAuthGuard)
  async getShopkeepersOverview() {
    return this.adminService.getShopkeepersOverview();
  }

  @Get("users-overview")
  @UseGuards(JwtAuthGuard)
  async getUsersOverview() {
    return this.adminService.getUsersOverview();
  }

  @Get("platform-payment")
  getPlatformPayment() {
    return this.adminService.getPlatformPayment();
  }

  @Patch("platform-payment")
  @UseInterceptors(
    FileInterceptor("qrCode", {
      storage: diskStorage({
        destination: "./uploads/platformPayment",
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const ext = extname(file.originalname || "") || ".png";
          cb(null, `qr-${ts}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          return cb(new BadRequestException("Only image files allowed"), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updatePlatformPayment(
    @Body() body: any,
    @UploadedFile() qrCode: Express.Multer.File,
  ) {
    const qrPublicUrl = qrCode?.filename
      ? `/uploads/platformPayment/${qrCode.filename}`
      : null;

    ["acceptUPI", "acceptBankTransfer", "acceptPayPal", "acceptStripe"].forEach((k) => {
      if (body[k] !== undefined && typeof body[k] === "string") {
        body[k] = body[k] === "true";
      }
    });

    return this.adminService.updatePlatformPayment(body, qrPublicUrl);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.adminService.findOne(+id);
  }

  @Post("cleanup-soft-deleted")
  @UseGuards(JwtAuthGuard)
  async cleanupSoftDeleted() {
    return this.adminService.cleanupSoftDeleted();
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.adminService.remove(+id);
  }
}
