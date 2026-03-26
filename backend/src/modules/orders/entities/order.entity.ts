import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export enum OrderStatus {
  Pending = "pending",
  Processing = "processing", // For delivery orders after payment confirmation
  Ready = "ready", // For pickup orders when ready
  Shipped = "shipped", // When delivery is out for shipping
  Cancelled = "cancelled", // When rejected or cancelled
  Completed = "completed",
}

// Additional enum for order type
export enum OrderType {
  Delivery = "delivery",
  Pickup = "pickup",
}

@Schema({ _id: false })
export class StatusHistory {
  @Prop({ type: String, enum: OrderStatus, required: true })
  status: OrderStatus;

  @Prop({ type: String, required: false })
  note?: string;

  @Prop({ type: Date, default: Date.now })
  changedAt: Date;

  @Prop({ type: String, required: false }) // e.g., "admin", "shopkeeper", "system"
  changedBy?: string;
}

@Schema({ timestamps: true })
export class Order extends Document {
  @Prop({ required: true, unique: true })
  orderId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: "User" })
  userId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: "Shopkeeper" })
  shopkeeperId: Types.ObjectId;

  @Prop({ type: Array, required: true })
  items: any[]; // Ideally, create a subdocument schema for items

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ type: String, enum: OrderType, required: true })
  orderType: OrderType;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.Pending })
  status: OrderStatus;

  @Prop({ type: Object, required: false })
  deliveryAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  @Prop({ type: String, required: false })
  instructions?: string;

  @Prop({ type: Date, required: false })
  pickupDate?: Date;

  @Prop({ type: String, required: false }) // Store time in "HH:mm" or ISO string as per your logic
  pickupTime?: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({
    type: [
      {
        status: { type: String, enum: OrderStatus },
        note: { type: String },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: String },
      },
    ],
    default: [],
  })
  statusHistory: StatusHistory[];

  @Prop({ default: Date.now })
  updatedAt: Date;

  @Prop()
  couponCode?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Performance indexes
OrderSchema.index({ userId: 1 });
OrderSchema.index({ shopkeeperId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ shopkeeperId: 1, createdAt: -1 });
OrderSchema.index({ shopkeeperId: 1, status: 1 });
