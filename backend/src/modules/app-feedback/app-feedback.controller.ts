import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import * as fs from "fs";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AppFeedbackService } from "./app-feedback.service";
import { CreateAppFeedbackDto } from "./dto/create-app-feedback.dto";
import { UpdateAppFeedbackDto } from "./dto/update-app-feedback.dto";
import { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";

// Ensure the support upload directory exists before multer writes to it.
const SUPPORT_UPLOAD_DIR = "./uploads/support";
if (!fs.existsSync(SUPPORT_UPLOAD_DIR)) {
  fs.mkdirSync(SUPPORT_UPLOAD_DIR, { recursive: true });
}

@Controller("app-feedback")
export class AppFeedbackController {
  constructor(private readonly service: AppFeedbackService) {}

  // ---- Public endpoints ----

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("image", {
      storage: diskStorage({
        destination: "./uploads/app-feedback",
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const rand = Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname) || ".jpg";
          cb(null, `feedback-${ts}-${rand}${ext}`);
        },
      }),
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
  async create(
    @UploadedFile() image: Express.Multer.File,
    @Body() dto: CreateAppFeedbackDto,
  ) {
    if (!image) {
      throw new BadRequestException("Image is required");
    }
    const publicPath = `/uploads/app-feedback/${image.filename}`;
    return this.service.create(dto, publicPath);
  }

  @Get("public")
  async findPublic() {
    return this.service.findPublic();
  }

  // ---- Support tickets (JWT-guarded) ----

  @Post("support")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor("attachments", 5, {
      storage: diskStorage({
        destination: SUPPORT_UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const ts = Date.now();
          const rand = Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname) || ".jpg";
          cb(null, `support-${ts}-${rand}${ext}`);
        },
      }),
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
  async createSupportTicket(
    @UploadedFiles() attachments: Express.Multer.File[] = [],
    @Body() dto: CreateSupportTicketDto,
    @Req() req: any,
  ) {
    const userId = req?.user?.sub || req?.user?.userId;
    const attachmentPaths = (attachments || []).map(
      (f) => `/uploads/support/${f.filename}`,
    );
    return this.service.createSupportTicket(dto, userId, attachmentPaths);
  }

  @Get("support/my")
  @UseGuards(JwtAuthGuard)
  async findMySupportTickets(@Req() req: any) {
    const userId = req?.user?.sub || req?.user?.userId;
    return this.service.findMySupportTickets(userId);
  }

  // ---- Admin endpoints (JWT-guarded) ----

  @Get("admin")
  @UseGuards(JwtAuthGuard)
  async findAllForAdmin() {
    return this.service.findAllForAdmin();
  }

  @Patch("admin/:id")
  @UseGuards(JwtAuthGuard)
  async update(@Param("id") id: string, @Body() dto: UpdateAppFeedbackDto) {
    return this.service.update(id, dto);
  }

  @Delete("admin/:id")
  @UseGuards(JwtAuthGuard)
  async remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}
