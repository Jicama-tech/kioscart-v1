import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

import { Document } from "mongoose";

export enum ReceiptType {
  MM_58 = "58MM",
  A4 = "A4",
}

export type ShopkeeperDocument = Shopkeeper & Document;

// ✅ Razorpay linked account sub-schema
export class RazorpayLinkedAccount {
  @Prop()
  accountId: string; // acc_xxxxx from Razorpay

  @Prop()
  stakeholderId?: string; // sth_xxxxx

  @Prop()
  productConfigId?: string; // acc_prd_xxxxx (route product config)

  @Prop({
    type: String,
    enum: ["pending_kyc", "under_review", "active", "rejected", "suspended"],
    default: "pending_kyc",
  })
  status: string;

  @Prop()
  kycStatus?: string;

  @Prop()
  kycRejectionReason?: string;

  @Prop()
  businessName: string;

  @Prop()
  businessType?: string;

  @Prop()
  panNumber: string;

  @Prop()
  gstNumber?: string;

  @Prop()
  uenNumber?: string;

  @Prop()
  bankAccountNumber: string;

  @Prop()
  bankIfscCode: string;

  @Prop()
  bankName: string;

  @Prop()
  accountHolderName: string;

  @Prop()
  businessEmail: string;

  @Prop()
  businessPhone: string;

  @Prop()
  address?: string;

  @Prop()
  city?: string;

  @Prop()
  state?: string;

  @Prop()
  zipcode?: string;

  @Prop({ default: "IN" })
  country: string;

  // Razorpay document IDs returned after upload — not the file URLs
  @Prop({
    type: {
      panFront: { type: String, default: null },
      addressProof: { type: String, default: null },
      cancelledCheque: { type: String, default: null },
      gstCert: { type: String, default: null },
      _id: false,
    },
    default: {},
  })
  documents?: {
    panFront?: string;
    addressProof?: string;
    cancelledCheque?: string;
    gstCert?: string;
  };

  @Prop()
  submittedAt?: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop({
    type: String,
    enum: ["platform", "standard", "route", "direct"],
    default: "platform",
  })
  mode?: string;

  @Prop()
  directKeyId?: string;

  @Prop()
  directKeySecretEncrypted?: string;

  @Prop()
  directKeyVerifiedAt?: Date;

  /** Per-shop kill switch for the Direct mode flow. When false, customers
   * won't see the Razorpay card at checkout even if keys are stored.
   * Undefined is treated as enabled (back-compat for shops onboarded
   * before this flag existed). */
  @Prop()
  directEnabled?: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

@Schema({ timestamps: true })
export class Shopkeeper {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  shopName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  businessEmail: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  address: string;

  @Prop()
  description: string;

  @Prop({ type: Object })
  businessHours: Record<
    string,
    { open: string; close: string; closed: boolean }
  >;

  @Prop({ required: true })
  whatsappNumber: string;

  @Prop()
  GSTNumber?: string;

  @Prop()
  UENNumber: string;

  @Prop()
  country: string;

  @Prop({ default: false })
  hasDocVerification: boolean;

  @Prop()
  shopClosedFromDate?: Date;

  @Prop()
  shopClosedToDate?: Date;

  @Prop({ default: 0 })
  taxPercentage: number;

  @Prop({ default: 0 })
  discountPercentage: number;

  // Master switch for delivery. When false, the storefront cart charges 0
  // regardless of any rules and can suppress the "delivery" option.
  @Prop({ default: true })
  deliveryEnabled: boolean;

  // Ordered (by minSubtotal) list of brackets — "if subtotal >= minSubtotal,
  // charge this fee". Evaluated by picking the rule with the HIGHEST
  // minSubtotal the cart qualifies for. Empty array = free delivery.
  @Prop({
    type: [{
      _id: false,
      minSubtotal: { type: Number, default: 0 },
      fee: { type: Number, default: 0 },
    }],
    default: [],
  })
  deliveryRules: { minSubtotal: number; fee: number }[];

  @Prop({ default: false })
  approved: boolean;

  @Prop()
  paymentURL: string;

  @Prop({ default: false })
  rejected: boolean;

  @Prop({ required: true })
  businessCategory: string;

  @Prop({ default: 0 })
  followers: number;

  @Prop()
  updatedAt?: Date;

  @Prop()
  createdAt: Date;

  // ✅ NEW: Razorpay linked account integration
  @Prop({ type: RazorpayLinkedAccount, default: null })
  razorpay?: RazorpayLinkedAccount;

  // ✅ NEW: Commission percentage (KiosCart takes this %)
  @Prop({ default: 2 })
  commissionPercentage: number;

  @Prop({ default: false })
  whatsAppQR: boolean;

  @Prop({ default: false })
  instagramQR: boolean;

  @Prop({default: "self"})
  provider: string;

  @Prop({default: null})
  providerId: string;

  @Prop()
  whatsAppQRNumber: string;

  @Prop()
  instagramHandle: string;

  @Prop() // Add this line
  termsAndConditions: string;

  @Prop({
    type: String,
    enum: ReceiptType,
    default: ReceiptType.MM_58, // sensible default for POS
  })
  receiptType: ReceiptType;

  @Prop({ default: false })
  dynamicQR: boolean;

  @Prop({ default: false })
  subscribed: boolean;

  @Prop({ type: String, default: null })
  planId: string;

  @Prop()
  planStartDate: Date;

  @Prop()
  planExpiryDate: Date;

  @Prop()
  pricePaid: string;

  @Prop({ default: true })
  pickupDateRequired: boolean;

  @Prop({ default: 2 })
  pickupMinDays: number;

  @Prop()
  pickupMessage?: string;

  @Prop({ default: false })
  voiceAccessEnabled: boolean;
}

export const RazorpayLinkedAccountSchema = SchemaFactory.createForClass(
  RazorpayLinkedAccount,
);

export const ShopkeeperSchema = SchemaFactory.createForClass(Shopkeeper);

// Performance indexes
ShopkeeperSchema.index({ whatsappNumber: 1 });
ShopkeeperSchema.index({ shopName: 1 });
