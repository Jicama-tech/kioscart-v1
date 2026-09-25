import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type PlanDocument = Plan & Document;

export enum ModuleType {
  SHOPKEEPER = "Shopkeeper",
  ORGANIZER = "Organizer",
  BOTH = "Both",
}

@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true, unique: true })
  planName: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true, type: [String] })
  features: string[]; // Array of feature descriptions

  @Prop({ required: true, enum: ModuleType, default: ModuleType.SHOPKEEPER })
  moduleType: ModuleType;

  @Prop({ required: true })
  validityInDays: number; // Plan validity duration

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop()
  description?: string; // Optional plan description

  /**
   * Per-feature switches for this plan, keyed by module id — e.g.
   * { products: { enabled: true, limit: 50 }, bulkImport: { enabled: false } }.
   *
   * Deliberately an open record rather than a literal listing every key. The
   * catalog of keys lives in the frontend (src/lib/planModules.ts), is edited
   * far more often than this schema, and a closed type here only ever drifted
   * behind it — it still named 22 keys when the editor offered many more.
   * Mongo persists this as a free-form object either way, so the enumeration
   * bought nothing but a second list to forget to update.
   */
  @Prop({ type: Object, default: {} })
  modules: Record<string, { enabled: boolean; limit?: number }>;

  @Prop({ required: true, default: "shopkeeper" })
  forModule: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
