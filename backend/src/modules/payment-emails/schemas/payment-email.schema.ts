import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type PaymentEmailDocument = PaymentEmail & Document;

@Schema({ timestamps: true })
export class PaymentEmail {
  @Prop({ required: true })
  shopkeeperId: string;

  @Prop({ required: true, unique: true })
  gmailMessageId: string;

  @Prop()
  from: string;

  @Prop()
  subject: string;

  @Prop()
  amount: number;

  @Prop()
  currency: string;

  @Prop()
  senderName: string;

  @Prop()
  referenceId: string;

  @Prop()
  bankOrProvider: string;

  @Prop()
  receivedAt: Date;

  @Prop()
  matchedOrderId: string;

  @Prop({
    enum: ["unmatched", "matched", "confirmed", "ignored"],
    default: "unmatched",
  })
  status: string;

  @Prop()
  rawSnippet: string;
}

export const PaymentEmailSchema = SchemaFactory.createForClass(PaymentEmail);

PaymentEmailSchema.index({ shopkeeperId: 1, status: 1 });
PaymentEmailSchema.index({ gmailMessageId: 1 }, { unique: true });
