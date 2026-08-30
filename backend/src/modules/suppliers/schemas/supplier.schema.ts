import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type SupplierDocument = Supplier & Document;

/**
 * Supplier identity — a 3rd-party vendor (packaging, raw materials,
 * ingredients, etc.) that a shopkeeper works with. Lives in its own
 * `suppliers` collection and persists across products: the Supplier is the
 * identity, a SupplierRequest is the per-product quotation. Ported from
 * eventsh-v1's organizer/event-scoped supplier module, re-keyed to
 * shopkeeper/product.
 */
@Schema({ collection: "suppliers", timestamps: true })
export class Supplier {
  // Owning shopkeeper — the supplier belongs to the shopkeeper whose product
  // link they submitted through. Lets a shopkeeper reuse a supplier across
  // products.
  @Prop({ type: Types.ObjectId, ref: "Shopkeeper", required: false, index: true })
  shopkeeperId?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  // Personal / login email — the Gmail a supplier signs in with on the
  // quotation form. Kept lowercase for lookups.
  @Prop()
  email: string;

  // Separate business/company email. The Gmail login also matches against
  // this so either address lets them in.
  @Prop()
  businessEmail: string;

  @Prop()
  phone: string;

  @Prop()
  countryCode: string;

  @Prop()
  whatsAppNumber: string;

  @Prop()
  companyName: string;

  // Free-text/custom service category (packaging, ingredients, printing, …).
  @Prop()
  serviceCategory: string;

  @Prop()
  description: string;

  @Prop()
  website: string;

  @Prop()
  country: string;

  /**
   * Where the shopkeeper pays this supplier. Captured the first time they
   * fill a quotation and reused on every later one, so they never retype it.
   * Refreshed whenever a newer quotation supplies different details.
   */
  @Prop({ type: Object, default: {} })
  accountDetails?: {
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscSwiftUen?: string;
    upiPaynowId?: string;
    country?: string;
  };

  @Prop({ default: true })
  isActive: boolean;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
