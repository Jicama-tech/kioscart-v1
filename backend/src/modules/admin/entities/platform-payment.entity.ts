import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type PlatformPaymentDocument = PlatformPayment & Document;

@Schema({ timestamps: true })
export class PlatformPayment {
  @Prop()
  accountHolderName?: string;

  @Prop()
  accountNumber?: string;

  @Prop()
  ifscCode?: string;

  @Prop()
  bankName?: string;

  @Prop()
  branchName?: string;

  @Prop()
  upiId?: string;

  @Prop()
  qrCodeURL?: string;

  @Prop()
  paypalEmail?: string;

  @Prop()
  stripeAccountId?: string;

  @Prop({ default: true })
  acceptUPI?: boolean;

  @Prop({ default: true })
  acceptBankTransfer?: boolean;

  @Prop({ default: false })
  acceptPayPal?: boolean;

  @Prop({ default: false })
  acceptStripe?: boolean;

  @Prop()
  contactEmail?: string;

  @Prop()
  contactPhone?: string;

  @Prop()
  instructions?: string;
}

export const PlatformPaymentSchema = SchemaFactory.createForClass(PlatformPayment);
