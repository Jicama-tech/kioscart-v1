import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type PurchaseOrderDocument = PurchaseOrder & Document;

class PurchaseOrderItem {
  @Prop({ required: true })
  productId: string;

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitCost: number;
}

@Schema({ timestamps: true })
export class PurchaseOrder {
  @Prop({ required: true })
  shopkeeperId: string;

  @Prop({ type: Types.ObjectId, ref: "Supplier", required: true })
  supplier: Types.ObjectId;

  @Prop({ type: [PurchaseOrderItem], default: [] })
  items: PurchaseOrderItem[];

  @Prop({ required: true, min: 0 })
  totalAmount: number;

  @Prop({ required: true, enum: ["draft", "ordered", "received"], default: "draft" })
  status: string;

  @Prop()
  receivedAt?: Date;

  // Set once received — links to the auto-created Purchases/COGS expense.
  @Prop()
  expenseId?: string;

  @Prop()
  notes?: string;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);

PurchaseOrderSchema.index({ shopkeeperId: 1 });
PurchaseOrderSchema.index({ supplier: 1 });
PurchaseOrderSchema.index({ status: 1, createdAt: -1 });
