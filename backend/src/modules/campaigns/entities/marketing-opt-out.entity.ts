import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type MarketingOptOutDocument = MarketingOptOut & Document;

/**
 * A customer this shop must not send marketing messages to — the CRM's
 * "Marketing messages" switch, turned off.
 *
 * Per shop: a customer who asked one shop to stop has not asked every shop.
 * The phone digits are stored alongside the user id because the same person
 * often exists as two users (an online order and a walk-in entry with the
 * same number), and an opt-out is a promise about the number, not about one
 * record of it.
 */
@Schema({
  collection: "crm_marketing_optouts",
  timestamps: { createdAt: true, updatedAt: false },
})
export class MarketingOptOut {
  @Prop({ type: String, required: true })
  shopkeeperId: string;

  @Prop({ type: String, required: true })
  userId: string;

  /** The number as WhatsApp would address it, digits only; "" when the
   * customer had no usable number when they opted out. */
  @Prop({ type: String, default: "" })
  phoneDigits: string;

  createdAt?: Date;
}

export const MarketingOptOutSchema =
  SchemaFactory.createForClass(MarketingOptOut);

MarketingOptOutSchema.index({ shopkeeperId: 1, userId: 1 }, { unique: true });
// The campaign runner asks "opted out by id OR by number?" before every
// message; this serves the number half of that $or.
MarketingOptOutSchema.index({ shopkeeperId: 1, phoneDigits: 1 });
