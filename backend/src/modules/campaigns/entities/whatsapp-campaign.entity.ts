import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type WhatsappCampaignDocument = WhatsappCampaign & Document;

export const CAMPAIGN_STATUSES = [
  "queued",
  "sending",
  "paused",
  "completed",
  "cancelled",
  "failed",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const RECIPIENT_STATUSES = ["pending", "sent", "failed", "skipped"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

/**
 * One customer in a campaign, and what happened to them.
 *
 * Every customer the shopkeeper selected gets a row, including the ones that
 * could not be messaged — those are `skipped` with a reason rather than
 * dropped, so "42 of 50 sent" comes with the other eight explained. The
 * reasons are fixed English sentences because the dashboard translates them
 * by looking the exact text up.
 */
@Schema({ _id: false })
export class CampaignRecipient {
  /** The customer's User id. Also the spintax seed, so the preview for this
   * customer and the message they receive pick the same wording. */
  @Prop({ type: String, required: true })
  customerId: string;

  /** Who the shopkeeper will recognise in the list — the resolved `{{name}}`
   * when there is one, otherwise what the CRM calls them. */
  @Prop({ type: String, default: "" })
  name: string;

  /**
   * The full number, as it will be addressed ("+<digits>" once validated).
   * Needed to send — including on a resume days later — and never returned
   * by the API unmasked. Not required: "no number" is a legitimate row.
   */
  @Prop({ type: String, default: "" })
  phone: string;

  @Prop({ type: String, enum: RECIPIENT_STATUSES, default: "pending" })
  status: RecipientStatus;

  @Prop({ type: String, default: null })
  reason: string | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  /**
   * When the runner took this row to message it, written BEFORE the number
   * lookup and the send. A row that is still `pending` with this set was
   * being sent when the record stopped keeping up (the process died, or the
   * outcome could not be written), so WhatsApp may already have delivered
   * it: it is closed as failed, never sent again. At most once, because a
   * duplicate marketing message is worse than a missed one.
   */
  @Prop({ type: Date, default: null })
  attemptAt: Date | null;

  /** The exact text this customer is sent, rendered when the campaign was
   * created. Stored so the record shows what people actually got, and so a
   * resume sends the same words the preview showed. Empty on skipped rows. */
  @Prop({ type: String, default: "" })
  text: string;
}
export const CampaignRecipientSchema =
  SchemaFactory.createForClass(CampaignRecipient);

/** Who started a campaign — the owner, or one of the shop's operators. */
@Schema({ _id: false })
export class CampaignCreator {
  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, default: null })
  operatorId?: string | null;

  @Prop({ type: String, default: "" })
  name: string;
}
export const CampaignCreatorSchema = SchemaFactory.createForClass(CampaignCreator);

/**
 * One WhatsApp campaign from a shop's own linked number.
 *
 * Stored rather than fired and forgotten: a campaign is paced on purpose and
 * takes minutes to hours, so the shopkeeper needs somewhere to watch it; a
 * send interrupted half-way (a dropped phone, a restart, the daily limit)
 * must know exactly who is still pending to resume without messaging anyone
 * twice (see CampaignRecipient.attemptAt); and a marketing message is the
 * kind of thing somebody later asks "who sent me this, and when" about.
 */
@Schema({ collection: "whatsapp_campaigns", timestamps: true })
export class WhatsappCampaign {
  // Indexed by the compound { shopkeeperId, createdAt } index below, whose
  // prefix serves every by-shop query; a second single-field index would
  // only cost writes.
  @Prop({ type: String, required: true })
  shopkeeperId: string;

  @Prop({ type: CampaignCreatorSchema, required: true })
  createdBy: CampaignCreator;

  /** As the shopkeeper wrote it, placeholders and spintax included. */
  @Prop({ type: String, required: true })
  template: string;

  @Prop({ type: String, default: null })
  productId: string | null;

  /** Snapshotted: the product may be renamed or deleted after sending. */
  @Prop({ type: String, default: "" })
  productName: string;

  @Prop({ type: Boolean, default: false })
  includePriceList: boolean;

  @Prop({ type: [String], default: [] })
  variantIds: string[];

  @Prop({ type: Boolean, default: false })
  attachProductImage: boolean;

  /**
   * The product photo, as the product stores it ("/uploads/…"), when one is
   * attached and was on disk at creation. The runner resolves it again inside
   * uploads/ before reading — this string decides which file the server
   * reads off its own disk.
   */
  @Prop({ type: String, default: null })
  imagePath: string | null;

  @Prop({ type: String, enum: CAMPAIGN_STATUSES, default: "queued" })
  status: CampaignStatus;

  @Prop({ type: Number, default: 0 })
  total: number;

  @Prop({ type: Number, default: 0 })
  sentCount: number;

  @Prop({ type: Number, default: 0 })
  failedCount: number;

  @Prop({ type: Number, default: 0 })
  skippedCount: number;

  @Prop({ type: Number, default: 0 })
  pendingCount: number;

  /** Why the campaign stopped or paused, or a warning (the photo is
   * missing). A fixed sentence the dashboard translates. */
  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  finishedAt: Date | null;

  @Prop({ type: [CampaignRecipientSchema], default: [] })
  recipients: CampaignRecipient[];

  // Maintained by `timestamps`; declared for the lean() reads.
  createdAt?: Date;
  updatedAt?: Date;
}

export const WhatsappCampaignSchema =
  SchemaFactory.createForClass(WhatsappCampaign);

// The history list: one shop's campaigns, newest first.
WhatsappCampaignSchema.index({ shopkeeperId: 1, createdAt: -1 });
// The boot reconciliation looks for campaigns left mid-send.
WhatsappCampaignSchema.index({ status: 1 });
