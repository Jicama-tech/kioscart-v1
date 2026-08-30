import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

export type ExpenseDocument = Expense & Document;

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries",
  "Utilities",
  "Purchases/COGS",
  "Marketing",
  "Logistics",
  "Other",
] as const;

class ExpenseActor {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, enum: ["organizer", "shopkeeper", "operator"] })
  role: string;

  @Prop()
  name?: string;
}

@Schema({ timestamps: true })
export class Expense {
  // Owner of the expense ledger this belongs to — an organizer or a
  // shopkeeper account. Operators act on behalf of one of these.
  @Prop({ required: true })
  ownerId: string;

  @Prop({ required: true, enum: ["organizer", "shopkeeper"] })
  ownerType: string;

  // Optional link to a specific event, for per-event P&L (mirrors eventsh-v1).
  @Prop({ type: Types.ObjectId, ref: "Event" })
  event?: Types.ObjectId;

  @Prop({ required: true, enum: EXPENSE_CATEGORIES })
  category: string;

  @Prop({ required: true })
  partyName: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop()
  description?: string;

  @Prop({ required: true })
  expenseDate: Date;

  @Prop()
  invoiceUrl?: string;

  @Prop({ type: Object, required: true })
  addedBy: ExpenseActor;

  @Prop({ required: true, enum: ["pending", "approved", "rejected"], default: "pending" })
  status: string;

  @Prop({ type: Object })
  approvedBy?: ExpenseActor;

  @Prop()
  approvedAt?: Date;

  @Prop()
  rejectionReason?: string;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

ExpenseSchema.index({ ownerId: 1, ownerType: 1 });
ExpenseSchema.index({ status: 1, expenseDate: -1 });
ExpenseSchema.index({ event: 1 });
ExpenseSchema.index({ category: 1 });
