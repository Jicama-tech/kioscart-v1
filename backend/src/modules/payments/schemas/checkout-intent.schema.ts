import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type CheckoutIntentDocument = CheckoutIntent & Document;

/**
 * Short-lived holding pen for a customer's cart while their Razorpay payment
 * is in flight. We DON'T create the actual Order until payment captures —
 * this is what lets us avoid zombie unpaid orders in the DB. Once the
 * verify endpoint (or webhook fallback) sees the payment succeeded, the
 * intent is read, the real Order + Payment are written, and the intent is
 * deleted. If the customer abandons checkout, the intent just TTL-expires.
 *
 * Indexed by gatewayOrderId so both the verify endpoint and the webhook
 * can look it up by Razorpay's order_xxx id.
 */
@Schema({ timestamps: true, collection: "checkout_intents" })
export class CheckoutIntent {
  // Razorpay's order_xxx — unique across all intents
  @Prop({ required: true, unique: true })
  gatewayOrderId: string;

  // The shop accepting the payment
  @Prop({ required: true, type: Types.ObjectId, ref: "Shopkeeper" })
  shopkeeperId: Types.ObjectId;

  // Customer info — we don't create the User record until the order lands
  @Prop({ required: true })
  customerWhatsApp: string;

  @Prop()
  customerName?: string;

  @Prop()
  customerEmail?: string;

  // ---- The cart payload — everything OrdersService.createOrder needs ----

  // Public-facing order ID (shopslug-order-xxx format) — set at intent time
  // so receipts/UI can reference it before the Order doc exists.
  @Prop({ required: true })
  orderId: string;

  @Prop({ type: [Object], required: true })
  items: any[];

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ required: true })
  orderType: string; // "pickup" | "delivery"

  @Prop({ type: Object })
  deliveryAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  @Prop()
  instructions?: string;

  @Prop({ type: Date })
  pickupDate?: Date;

  @Prop()
  pickupTime?: string;

  @Prop()
  couponCode?: string;

  // ---- Payment-side calculated amounts (locked at intent time) ----

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  currency: string;

  @Prop({ default: 0 })
  commissionAmount: number;

  @Prop({ default: 0 })
  netAmount: number;

  @Prop({ enum: ["route", "direct", "platform"], default: "platform" })
  gatewayMode: string;

  // For route mode: which linked account receives the on-hold transfer
  @Prop()
  shopkeeperAccountId?: string;

  // Razorpay's snapshot — useful for debugging if anything weird happens
  @Prop({ type: Object })
  rawGatewayOrder?: any;
}

export const CheckoutIntentSchema = SchemaFactory.createForClass(CheckoutIntent);

// Auto-purge any intent older than 1 hour. If the customer never came back
// to pay, this just disappears — no Order, no Payment, no cleanup needed.
CheckoutIntentSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 },
);
// Already implied by `unique: true` on the prop, but explicit for clarity.
CheckoutIntentSchema.index({ gatewayOrderId: 1 }, { unique: true });
