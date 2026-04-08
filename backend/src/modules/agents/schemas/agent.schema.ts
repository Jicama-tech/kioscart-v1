import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type AgentDocument = Agent & Document;

@Schema({ timestamps: true })
export class Agent {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  whatsAppNumber: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  secondaryContact?: string;

  @Prop({ default: 0 })
  salesTarget: number;

  @Prop({ required: true, unique: true })
  referralCode: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const AgentSchema = SchemaFactory.createForClass(Agent);

AgentSchema.index({ whatsAppNumber: 1 });
AgentSchema.index({ referralCode: 1 });
AgentSchema.index({ email: 1 });
