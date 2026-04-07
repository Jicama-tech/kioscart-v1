import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

import { Document } from "mongoose";

export type OperatorDocument = Operator & Document;

@Schema({ timestamps: true })
export class Operator {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  whatsAppNumber: string;

  @Prop()
  email: string;

  @Prop()
  shopkeeperId?: string;

  @Prop()
  organizerId?: string;

  @Prop({ type: [String], default: ["dashboard", "orders", "products", "crm", "kiosk", "storefront", "settings"] })
  accessTabs: string[];
}

export const OperatorSchema = SchemaFactory.createForClass(Operator);
