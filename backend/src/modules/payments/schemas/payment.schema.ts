import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type PaymentDocument = Payment & Document;

export enum PaymentStatus {
  Created = "created",
  Captured = "captured",
  Failed = "failed",
  Refunded = "refunded",
}

export enum TransferStatus {
  None = "none",
  Pending = "pending",
  OnHold = "on_hold",
  Released = "released",
  Reversed = "reversed",
  Failed = "failed",
}

@Schema({ timestamps: true })
export class Payment {
  // Set only after Razorpay confirms capture and the Order is materialized.
  // Until then the Payment record is an "intent" and `pendingOrderData`
  // holds the cart payload that will be turned into an Order.
  @Prop({ required: false, type: Types.ObjectId, ref: "Order" })
  orderId?: Types.ObjectId;

  // Full CreateOrderDto payload captured at /payments/order time.
  // Cleared once the Order is created on capture. Lets us defer Order
  // creation so customers who abandon the modal never produce a row.
  @Prop({ type: Object })
  pendingOrderData?: Record<string, any>;

  @Prop({ required: true, type: Types.ObjectId, ref: "Shopkeeper" })
  shopkeeperId: Types.ObjectId;

  @Prop({ required: true, default: "razorpay" })
  gateway: string;

  @Prop({
    type: String,
    enum: ["route", "direct"],
    default: "route",
  })
  gatewayMode?: string;

  @Prop({ required: true })
  gatewayOrderId: string;

  @Prop()
  gatewayPaymentId?: string;

  @Prop()
  gatewaySignature?: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, default: 0 })
  commissionAmount: number;

  @Prop({ required: true })
  netAmount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ default: "IN" })
  country: string;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.Created,
  })
  status: PaymentStatus;

  @Prop()
  capturedAt?: Date;

  @Prop()
  failedAt?: Date;

  @Prop()
  failureReason?: string;

  @Prop()
  transferId?: string;

  @Prop({
    type: String,
    enum: TransferStatus,
    default: TransferStatus.None,
  })
  transferStatus: TransferStatus;

  @Prop()
  heldAt?: Date;

  @Prop()
  releasedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: "Admin" })
  releasedBy?: Types.ObjectId;

  @Prop()
  releaseNote?: string;

  @Prop()
  refundId?: string;

  @Prop()
  refundedAt?: Date;

  @Prop()
  refundReason?: string;

  @Prop({ type: Object })
  rawResponse?: Record<string, any>;

  @Prop({ type: Object })
  notes?: Record<string, string>;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ orderId: 1 });
PaymentSchema.index({ shopkeeperId: 1, transferStatus: 1 });
PaymentSchema.index({ gatewayOrderId: 1 });
PaymentSchema.index({ gatewayPaymentId: 1 });
PaymentSchema.index({ transferStatus: 1, createdAt: -1 });
