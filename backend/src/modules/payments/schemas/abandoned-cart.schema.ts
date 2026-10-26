import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type AbandonedCartDocument = AbandonedCart & Document;

/**
 * A customer who started paying online but did not finish. Written when the
 * checkout intent is created and marked "recovered" when that payment
 * completes; the checkout intent itself still disappears after an hour, this
 * record stays so the shop (and ComBox, through the integration API) can see
 * the carts that were left behind and follow up with the customer.
 */
@Schema({ timestamps: true, collection: "abandoned_carts" })
export class AbandonedCart {
  // Razorpay's order_xxx, the same id as the checkout intent
  @Prop({ required: true, unique: true })
  gatewayOrderId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: "Shopkeeper", index: true })
  shopkeeperId: Types.ObjectId;

  // Public order reference the customer saw (shopslug-order-xxx)
  @Prop({ required: true })
  orderId: string;

  @Prop({ required: true })
  customerWhatsApp: string;

  @Prop()
  customerName?: string;

  @Prop()
  customerEmail?: string;

  @Prop({ type: [Object], default: [] })
  items: any[];

  @Prop({ required: true })
  totalAmount: number;

  @Prop()
  currency?: string;

  @Prop()
  orderType?: string;

  @Prop({ enum: ["open", "recovered"], default: "open" })
  status: string;

  @Prop({ type: Date })
  recoveredAt?: Date;

  // The Order that was created when the payment went through
  @Prop({ type: Types.ObjectId, ref: "Order" })
  recoveredOrderId?: Types.ObjectId;
}

export const AbandonedCartSchema = SchemaFactory.createForClass(AbandonedCart);

AbandonedCartSchema.index({ shopkeeperId: 1, updatedAt: -1 });
// Kept for 60 days, long enough to follow up and to report on
AbandonedCartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });
