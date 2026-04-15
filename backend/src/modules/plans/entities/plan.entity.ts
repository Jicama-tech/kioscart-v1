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
  isActive: boolean; // To enable/disable plans

  @Prop()
  description?: string; // Optional plan description

  @Prop({ type: Object, default: {} })
  modules: {
    // Product Management
    products?: { enabled: boolean; limit: number };
    bulkImport?: { enabled: boolean };
    // Order Management
    orders?: { enabled: boolean };
    receipts?: { enabled: boolean };
    // Storefront
    storefront?: { enabled: boolean };
    customDomain?: { enabled: boolean };
    instagram?: { enabled: boolean };
    videoSection?: { enabled: boolean };
    ourStory?: { enabled: boolean };
    // Analytics
    analytics?: { enabled: boolean };
    // Payments
    staticQR?: { enabled: boolean };
    dynamicQR?: { enabled: boolean };
    paymentTracking?: { enabled: boolean };
    razorpay?: { enabled: boolean };
    // CRM
    crm?: { enabled: boolean };
    // Coupons
    coupons?: { enabled: boolean };
    // Kiosk
    kiosk?: { enabled: boolean };
    // Operators
    operators?: { enabled: boolean; limit: number };
    // Communication
    whatsappQR?: { enabled: boolean };
  };

  @Prop({ required: true, default: "shopkeeper" })
  forModule: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const PlanSchema = SchemaFactory.createForClass(Plan);
