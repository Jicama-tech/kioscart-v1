import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

import { Document } from "mongoose";

export type OperatorDocument = Operator & Document;

@Schema({ timestamps: true })
export class Operator {
  @Prop({ required: true })
  name: string;

  // Optional now — operators sign in with Google (email), not WhatsApp OTP.
  // Kept for back-compat / contact info.
  @Prop()
  whatsAppNumber?: string;

  // Sign-in identity for Google auth. Looked up case-insensitively in the
  // auth controller alongside shopkeeper emails.
  @Prop()
  email: string;

  @Prop()
  shopkeeperId?: string;

  @Prop()
  organizerId?: string;

  @Prop({
    type: [String],
    default: ["dashboard", "orders", "products", "crm", "kiosk", "storefront", "settings", "expenses"],
  })
  accessTabs: string[];

  @Prop({ default: false })
  isSoftDeleted: boolean;

  @Prop()
  softDeletedAt?: Date;
}

export const OperatorSchema = SchemaFactory.createForClass(Operator);
