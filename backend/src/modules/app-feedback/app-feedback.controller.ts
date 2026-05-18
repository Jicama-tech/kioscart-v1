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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AppFeedbackService } from "./app-feedback.service";
import { CreateAppFeedbackDto } from "./dto/create-app-feedback.dto";
import { UpdateAppFeedbackDto } from "./dto/update-app-feedback.dto";

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
