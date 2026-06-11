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
import {
  SupportTicket,
  SupportTicketDocument,
} from "./entities/support-ticket.entity";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { CreateAppFeedbackDto } from "./dto/create-app-feedback.dto";
import { UpdateAppFeedbackDto } from "./dto/update-app-feedback.dto";
import { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";
import { UpdateSupportTicketDto } from "./dto/update-support-ticket.dto";

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
    @InjectModel(SupportTicket.name)
    private readonly supportModel: Model<SupportTicketDocument>,
    @InjectModel(Shopkeeper.name)
    private readonly shopkeeperModel: Model<Shopkeeper>,
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

  // ---- Support tickets ----

  /**
   * Create a support ticket on behalf of the authenticated caller. Identity
   * comes from the JWT (`userId`), never from the body. `description` maps to
   * the stored `comment` field.
   */
  async createSupportTicket(
    dto: CreateSupportTicketDto,
    userId: string,
    attachments: string[],
  ) {
    if (!userId) {
      throw new BadRequestException("Authenticated user required");
    }
    const doc = await this.supportModel.create({
      subject: dto.subject,
      category: dto.category || "general",
      status: "open",
      comment: dto.description,
      attachments,
      userId,
    });
    this.logger.log(`New SupportTicket ${doc._id} from ${userId}`);
    return doc.toObject();
  }

  /** The caller's own tickets, newest first. */
  async findMySupportTickets(userId: string) {
    const items = await this.supportModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    return { items };
  }

  /**
   * Admin view: every support ticket, newest first, enriched with the
   * submitting shopkeeper's identity. A ticket's `userId` is the shopkeeper's
   * `_id` (their JWT `sub`), so we batch-resolve those ids to shop/name/email
   * in one query rather than per-row. Tickets whose author can't be resolved
   * (e.g. a non-shopkeeper account) still appear, just without shop details.
   */
  async findAllSupportTicketsForAdmin(): Promise<{ items: any[] }> {
    const items = await this.supportModel
      .find()
      .sort({ createdAt: -1 })
      .lean();

    const ids = [...new Set(items.map((t) => String(t.userId)).filter(Boolean))];
    const shopkeepers = ids.length
      ? await this.shopkeeperModel
          .find({ _id: { $in: ids } })
          .select("name shopName email")
          .lean()
      : [];
    const byId = new Map(
      shopkeepers.map((s: any) => [String(s._id), s]),
    );

    const enriched = items.map((t) => {
      const s: any = byId.get(String(t.userId));
      return {
        ...t,
        shopkeeper: s
          ? { name: s.name, shopName: s.shopName, email: s.email }
          : null,
      };
    });
    return { items: enriched };
  }

  /** Admin updates a ticket's status (open → in_progress → resolved). */
  async updateSupportTicket(id: string, dto: UpdateSupportTicketDto) {
    const updated = await this.supportModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .lean();
    if (!updated) {
      throw new NotFoundException("Support ticket not found");
    }
    return { success: true, data: updated };
  }
}
