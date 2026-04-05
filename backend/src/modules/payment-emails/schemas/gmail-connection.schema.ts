import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type GmailConnectionDocument = GmailConnection & Document;

@Schema({ timestamps: true })
export class GmailConnection {
  @Prop({ required: true, unique: true })
  shopkeeperId: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop()
  tokenExpiry: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  lastPolledAt: Date;
}

export const GmailConnectionSchema =
  SchemaFactory.createForClass(GmailConnection);
