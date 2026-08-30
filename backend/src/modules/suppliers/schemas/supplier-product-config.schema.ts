import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

/**
 * One custom requirement the shopkeeper needs from suppliers for a product.
 * The `id` is a stable client-generated key so quotations can reference the
 * exact requirement they are pricing.
 */
@Schema({ _id: false })
export class RequirementItem {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  label: string;

  @Prop({ default: "" })
  description: string;

  // Free-text quantity so it can hold "200 units", "50 kg", etc.
  @Prop({ default: "" })
  quantity: string;
}

export type SupplierProductConfigDocument = SupplierProductConfig & Document;

/**
 * Per-product supplier configuration: the shopkeeper's custom requirements
 * plus whether the public quotation link currently accepts submissions. This
 * link is shared privately by the shopkeeper (mirrors eventsh-v1's
 * SupplierEventConfig, re-keyed to `productId`).
 */
@Schema({ collection: "supplier_product_configs", timestamps: true })
export class SupplierProductConfig {
  /**
   * What this requirement list belongs to. `product` lists live against one
   * product (the original behaviour); `business` is the single shop-wide
   * list, which carries no productId at all.
   */
  @Prop({ type: String, enum: ["product", "business"], default: "product" })
  scope: "product" | "business";

  // Absent on business-scope lists.
  @Prop({ type: Types.ObjectId, ref: "Product", required: false })
  productId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "Shopkeeper", required: true, index: true })
  shopkeeperId: Types.ObjectId;

  // Whether the private link currently accepts submissions.
  @Prop({ default: false })
  enabled: boolean;

  // Currency country code (mirrors the shopkeeper's currency), e.g. "IN".
  @Prop({ default: "IN" })
  currency: string;

  // The shopkeeper's custom "what I need" list shown on the shared form.
  @Prop({ type: [RequirementItem], default: [] })
  requirements: RequirementItem[];

  // Optional free-text instructions shown above the requirements.
  @Prop({ default: "" })
  instructions: string;
}

export const SupplierProductConfigSchema = SchemaFactory.createForClass(
  SupplierProductConfig,
);

// One config per product, and exactly one business-wide list per shopkeeper.
// Both are partial so business rows (no productId) don't collide on null.
SupplierProductConfigSchema.index(
  { productId: 1 },
  { unique: true, partialFilterExpression: { productId: { $exists: true } } },
);
SupplierProductConfigSchema.index(
  { shopkeeperId: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: "business" } },
);
