import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Model, Types } from "mongoose";

export type AbandonedCartDocument = AbandonedCart & Document;

/**
 * A customer who left without finishing their order. Saved from two places:
 *  - the storefront, as soon as the customer's WhatsApp number is known (they
 *    typed it on the cart page, saved their cart from the "Save my cart" box,
 *    or are logged in): stage "cart", kept up to date while they shop;
 *  - online checkout, when the Razorpay payment is started: stage "payment".
 * It is marked "recovered" when that customer places an order (or the payment
 * completes). The checkout intent itself still disappears after an hour; this
 * record stays so the shop (and ComBox, through the integration API) can see
 * the carts that were left behind and follow up with the customer.
 */
@Schema({ timestamps: true, collection: "abandoned_carts" })
export class AbandonedCart {
  // Razorpay's order_xxx for a checkout; "cart:<cartKey>" for a cart saved from the storefront
  @Prop({ required: true, unique: true })
  gatewayOrderId: string;

  @Prop({ required: true, type: Types.ObjectId, ref: "Shopkeeper", index: true })
  shopkeeperId: Types.ObjectId;

  // The storefront's id for this browser's cart; also the secret in the "restore my cart" link
  @Prop({ index: { unique: true, sparse: true } })
  cartKey?: string;

  // How far the customer got: the cart page ("cart") or the payment window ("payment")
  @Prop({ enum: ["cart", "payment"], default: "payment" })
  stage: string;

  // Public order reference the customer saw (shopslug-order-xxx); none for a cart saved before checkout
  @Prop()
  orderId?: string;

  @Prop({ required: true })
  customerWhatsApp: string;

  // Digits only, to match the customer's later order whatever format the number was typed in
  @Prop({ index: true })
  whatsAppDigits?: string;

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

  // Last time the customer changed the cart; it counts as abandoned this long after
  @Prop({ type: Date })
  lastActivityAt?: Date;

  @Prop({ enum: ["open", "recovered"], default: "open" })
  status: string;

  @Prop({ type: Date })
  recoveredAt?: Date;

  // The Order that was created when the customer came back and bought
  @Prop({ type: Types.ObjectId, ref: "Order" })
  recoveredOrderId?: Types.ObjectId;
}

export const AbandonedCartSchema = SchemaFactory.createForClass(AbandonedCart);

AbandonedCartSchema.index({ shopkeeperId: 1, updatedAt: -1 });
// Kept for 60 days, long enough to follow up and to report on
AbandonedCartSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

/** "+65 9003-7950" -> "6590037950"; null when it cannot be a phone number. */
export function whatsAppDigits(value?: string | null): string | null {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** The customer bought: their open carts at this shop are recovered (called for every new order). */
export async function markCartsRecovered(
  model: Model<AbandonedCart>,
  shopkeeperId: string,
  whatsApp: string | undefined,
  orderId: unknown,
) {
  const digits = whatsAppDigits(whatsApp);
  if (!digits || !Types.ObjectId.isValid(String(shopkeeperId))) return;
  await model.updateMany(
    { shopkeeperId: new Types.ObjectId(String(shopkeeperId)), whatsAppDigits: digits, status: "open" },
    { status: "recovered", recoveredAt: new Date(), recoveredOrderId: orderId },
  );
}
