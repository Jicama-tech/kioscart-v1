import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type SupportTicketDocument = SupportTicket & Document;

export type SupportCategory =
  | "bug"
  | "feature_request"
  | "general"
  | "billing"
  | "other";

export type SupportStatus = "open" | "in_progress" | "resolved";

@Schema({ timestamps: true, collection: "supporttickets" })
export class SupportTicket {
  // Short summary line for the ticket.
  @Prop({ required: true, trim: true })
  subject: string;

  @Prop({
    enum: ["bug", "feature_request", "general", "billing", "other"],
    default: "general",
  })
  category: SupportCategory;

  @Prop({
    enum: ["open", "in_progress", "resolved"],
    default: "open",
    index: true,
  })
  status: SupportStatus;

  // The ticket description text (frontend sends it as `description`).
  @Prop({ required: true, trim: true })
  comment: string;

  // Public URLs (e.g. "/uploads/support/<filename>") for attached screenshots.
  @Prop({ type: [String], default: [] })
  attachments: string[];

  // Authenticated caller's id, taken from the JWT `sub` claim. Never trusted
  // from the request body so a user can only see their own tickets.
  @Prop({ required: true, index: true })
  userId: string;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);

// The only query the app runs: a user's tickets, newest first.
SupportTicketSchema.index({ userId: 1, createdAt: -1 });
