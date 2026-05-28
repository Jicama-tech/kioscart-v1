import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as fs from "fs";
import * as path from "path";
import {
  AppFeedback,
  AppFeedbackDocument,
} from "./entities/app-feedback.entity";
import { CreateAppFeedbackDto } from "./dto/create-app-feedback.dto";
import { UpdateAppFeedbackDto } from "./dto/update-app-feedback.dto";

// Hardcoded app identifier — every read/write below pins itself to this so
// the shared database stays tenant-safe regardless of what the client sends.
const APP_NAME = "Kioscart";

// Public-side fetch cap. The carousel only needs a small rotating set; we
// don't want to ship the entire approved list to every landing-page visit.
const PUBLIC_LIMIT = 20;

@Injectable()
export class AppFeedbackService {
  private readonly logger = new Logger(AppFeedbackService.name);

  constructor(
    @InjectModel(AppFeedback.name)
    private readonly model: Model<AppFeedbackDocument>,
  ) {}

  async create(dto: CreateAppFeedbackDto, imageRelativePath: string) {
    if (!imageRelativePath) {
      throw new BadRequestException("Image is required");
    }
    const doc = await this.model.create({
      appName: APP_NAME,
      name: dto.name,
      emailId: dto.emailId,
      description: dto.description,
      image: imageRelativePath,
      showOnMainPage: false,
      status: "new",
    });
    this.logger.log(`New AppFeedback ${doc._id} from ${dto.emailId}`);
    return {
      success: true,
      message: "Thanks for sharing your feedback!",
    };
  }

  /** What the landing-page carousel calls. Only published items. */
  async findPublic() {
    return this.model
      .find({ appName: APP_NAME, showOnMainPage: true })
      .sort({ createdAt: -1 })
      .limit(PUBLIC_LIMIT)
      .select("name description image createdAt")
      .lean();
  }

  /** Admin table: everything for this app, newest first. */
  async findAllForAdmin() {
    return this.model
      .find({ appName: APP_NAME })
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(id: string, dto: UpdateAppFeedbackDto) {
    // Scope the update to APP_NAME so admin tokens from a sibling app cannot
    // toggle Kioscart's published set.
    const updated = await this.model.findOneAndUpdate(
      { _id: id, appName: APP_NAME },
      { $set: dto },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException("Feedback not found");
    }
    return { success: true, data: updated };
  }

  async remove(id: string) {
    const doc = await this.model
      .findOneAndDelete({ _id: id, appName: APP_NAME })
      .lean<AppFeedback>()
      .exec();
    if (!doc) {
      throw new NotFoundException("Feedback not found");
    }
    // Best-effort image cleanup. Don't fail the request if the file is
    // already gone or the path is unexpected.
    if (doc.image) {
      const abs = path.join(process.cwd(), doc.image.replace(/^\/+/, ""));
      fs.unlink(abs, (err) => {
        if (err) this.logger.warn(`Image cleanup failed for ${abs}: ${err.message}`);
      });
    }
    return { success: true, message: "Feedback deleted" };
  }
}
