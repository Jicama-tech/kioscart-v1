import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type KioskPaymentDocument = KioskPayment & Document;

export type KioskPaymentStatus = "pending" | "paid" | "cancelled" | "expired";

/**
 * A kiosk sale waiting for a QR payment (PayNow in Singapore, UPI in India): "Payment pending".
 *
 * The kiosk (KiosCart's own, or ComBox's Kiosk mode through the integration API) shows the QR on its screen for a
 * customer at the counter, or sends the payment link (/kiosk-pay/<token>) to a customer who is not there. No order
 * exists yet: the ready-to-place order is kept here, and it is placed (and so appears in Orders) only when the payment
 * is confirmed, by the customer pressing "I have paid" on the link or by the staff at the kiosk.
 */
@Schema({ timestamps: true, collection: "kiosk_payments" })
export class KioskPayment {
  @Prop({ required: true, type: Types.ObjectId, ref: "Shopkeeper", index: true })
  shopkeeperId: Types.ObjectId;

  // The secret in the payment link
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ required: true, enum: ["pending", "paid", "cancelled", "expired"], default: "pending", index: true })
  status: KioskPaymentStatus;

  // "kioscart-kiosk" (the shop's own kiosk) or "combox-kiosk" (ComBox's Kiosk mode)
  @Prop({ required: true })
  source: string;

  // The caller's own id for this sale, so a retry returns the same payment instead of a second one
  @Prop()
  externalRef?: string;

  @Prop({ required: true })
  amount: number;

  @Prop()
  currency?: string;

  @Prop()
  customerName?: string;

  @Prop()
  customerWhatsApp?: string;

  // What the customer sees on the payment page: [{ name, quantity, lineTotal, option }]
  @Prop({ type: [Object], default: [] })
  lines: any[];

  // The order to place once paid, exactly as OrdersService.createOrder takes it
  @Prop({ type: Object, required: true })
  order: Record<string, any>;

  // Public order reference (shopslug-order-xxx); the order is created with it once paid
  @Prop({ required: true })
  orderRef: string;

  @Prop()
  orderMongoId?: string;

  @Prop()
  paidAt?: Date;

  // "customer" (pressed "I have paid" on the link) or "staff" (confirmed at the kiosk)
  @Prop()
  paidBy?: string;

  @Prop({ required: true })
  expiresAt: Date;
}

export const KioskPaymentSchema = SchemaFactory.createForClass(KioskPayment);
KioskPaymentSchema.index(
  { shopkeeperId: 1, externalRef: 1 },
  { unique: true, partialFilterExpression: { externalRef: { $type: "string" } } },
);
