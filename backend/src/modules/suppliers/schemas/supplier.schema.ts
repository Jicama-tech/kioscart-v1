import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type SupplierDocument = Supplier & Document;

class SupplierProductLink {
  @Prop({ required: true })
  productId: string;

  @Prop({ required: true, min: 0 })
  costPrice: number;
}

@Schema({ timestamps: true })
export class Supplier {
  @Prop({ required: true })
  shopkeeperId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  contactPerson?: string;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop()
  gstin?: string;

  @Prop({ type: [SupplierProductLink], default: [] })
  products: SupplierProductLink[];

  @Prop({ default: false })
  isSoftDeleted: boolean;

  @Prop()
  softDeletedAt?: Date;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

SupplierSchema.index({ shopkeeperId: 1 });
SupplierSchema.index({ "products.productId": 1 });
