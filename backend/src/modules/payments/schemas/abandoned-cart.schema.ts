import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Model, Types } from "mongoose";

export type AbandonedCartDocument = AbandonedCart & Document;

/**
 * A customer who left without finishing their order. Saved from two places:
 *  - the storefront, as soon as we know how to reach the customer: their
 *    WhatsApp number (typed on the cart page or in the "Save my cart" box) or
 *    their email (signed in with Google): stage "cart", kept up to date while
 *    they shop;
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

  @Prop()
  customerWhatsApp?: string;

  // Digits only, to match the customer's later order whatever format the number was typed in
  @Prop({ index: true })
  whatsAppDigits?: string;

  @Prop()
  customerName?: string;

  @Prop()
  customerEmail?: string;

  // Lower-cased email, to match the customer's later order (a Google sign-in may give no phone number)
  @Prop({ index: true })
  emailLower?: string;

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

/** "  Asha@Example.com " -> "asha@example.com"; null when it is not an email address. */
export function emailLower(value?: string | null): string | null {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** The customer bought: their open carts at this shop (same WhatsApp number or email) are recovered. */
export async function markCartsRecovered(
  model: Model<AbandonedCart>,
  shopkeeperId: string,
  customer: { whatsApp?: string | null; email?: string | null },
  orderId: unknown,
) {
  const digits = whatsAppDigits(customer.whatsApp);
  const email = emailLower(customer.email);
  if ((!digits && !email) || !Types.ObjectId.isValid(String(shopkeeperId))) return;
  const who = [...(digits ? [{ whatsAppDigits: digits }] : []), ...(email ? [{ emailLower: email }] : [])];
  await model.updateMany(
    { shopkeeperId: new Types.ObjectId(String(shopkeeperId)), status: "open", $or: who },
    { status: "recovered", recoveredAt: new Date(), recoveredOrderId: orderId },
  );
}
