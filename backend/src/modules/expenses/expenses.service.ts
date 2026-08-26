import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Expense, ExpenseDocument } from "./schemas/expense.schema";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";

export interface RequestActor {
  id: string; // organizerId, shopkeeperId, or operatorId depending on role
  role: "organizer" | "shopkeeper" | "operator";
  name?: string;
  // For operators, whichever owner they act on behalf of:
  ownerId?: string;
  ownerType?: "organizer" | "shopkeeper";
}

@Injectable()
export class ExpensesService {
  constructor(@InjectModel("Expense") private readonly expenseModel: Model<ExpenseDocument>) {}

  private resolveOwner(actor: RequestActor) {
    if (actor.role === "operator") {
      if (!actor.ownerId || !actor.ownerType) {
        throw new BadRequestException("Operator is not linked to an organizer or shopkeeper");
      }
      return { ownerId: actor.ownerId, ownerType: actor.ownerType };
    }
    return { ownerId: actor.id, ownerType: actor.role as "organizer" | "shopkeeper" };
  }

  async create(dto: CreateExpenseDto, actor: RequestActor, invoiceUrl?: string) {
    const { ownerId, ownerType } = this.resolveOwner(actor);
    const isAutoApproved = actor.role !== "operator";

    const expense = new this.expenseModel({
      ownerId,
      ownerType,
      event: dto.event,
      category: dto.category,
      partyName: dto.partyName,
      amount: dto.amount,
      description: dto.description,
      expenseDate: new Date(dto.expenseDate),
      invoiceUrl,
      addedBy: { id: actor.id, role: actor.role, name: actor.name },
      status: isAutoApproved ? "approved" : "pending",
      ...(isAutoApproved
        ? { approvedBy: { id: actor.id, role: actor.role, name: actor.name }, approvedAt: new Date() }
        : {}),
    });

    return expense.save();
  }

  async findForOwner(
    ownerId: string,
    ownerType: string,
    filters: { status?: string; category?: string; startDate?: string; endDate?: string; event?: string },
  ) {
    const query: any = { ownerId, ownerType };
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.event) query.event = filters.event;
    if (filters.startDate || filters.endDate) {
      query.expenseDate = {};
      if (filters.startDate) query.expenseDate.$gte = new Date(filters.startDate);
      if (filters.endDate) query.expenseDate.$lte = new Date(filters.endDate);
    }
    return this.expenseModel.find(query).sort({ expenseDate: -1 }).exec();
  }

  async findOne(id: string) {
    const expense = await this.expenseModel.findById(id).exec();
    if (!expense) throw new NotFoundException("Expense not found");
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, actor: RequestActor) {
    const expense = await this.findOne(id);
    if (expense.status !== "pending") {
      throw new BadRequestException("Only pending expenses can be edited");
    }
    if (expense.addedBy.id !== actor.id) {
      throw new ForbiddenException("You can only edit expenses you added");
    }
    Object.assign(expense, {
      ...dto,
      expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : expense.expenseDate,
    });
    return expense.save();
  }

  async remove(id: string, actor: RequestActor) {
    const expense = await this.findOne(id);
    if (expense.status !== "pending") {
      throw new BadRequestException("Only pending expenses can be deleted");
    }
    if (expense.addedBy.id !== actor.id) {
      throw new ForbiddenException("You can only delete expenses you added");
    }
    await expense.deleteOne();
    return { success: true };
  }

  async approve(id: string, actor: RequestActor) {
    const expense = await this.findOne(id);
    const { ownerId, ownerType } = this.resolveOwner(actor);
    if (actor.role === "operator" || expense.ownerId !== ownerId || expense.ownerType !== ownerType) {
      throw new ForbiddenException("Only the organizer/shopkeeper owner can approve expenses");
    }
    if (expense.status !== "pending") {
      throw new BadRequestException("Expense is not pending approval");
    }
    expense.status = "approved";
    expense.approvedBy = { id: actor.id, role: actor.role, name: actor.name };
    expense.approvedAt = new Date();
    return expense.save();
  }

  async reject(id: string, actor: RequestActor, reason: string) {
    const expense = await this.findOne(id);
    const { ownerId, ownerType } = this.resolveOwner(actor);
    if (actor.role === "operator" || expense.ownerId !== ownerId || expense.ownerType !== ownerType) {
      throw new ForbiddenException("Only the organizer/shopkeeper owner can reject expenses");
    }
    if (expense.status !== "pending") {
      throw new BadRequestException("Expense is not pending approval");
    }
    expense.status = "rejected";
    expense.approvedBy = { id: actor.id, role: actor.role, name: actor.name };
    expense.approvedAt = new Date();
    expense.rejectionReason = reason;
    return expense.save();
  }

  /** Approved expenses only, grouped by category, for P&L computation. */
  async summarizeApproved(ownerId: string, ownerType: string, startDate: Date, endDate: Date) {
    const rows = await this.expenseModel
      .find({
        ownerId,
        ownerType,
        status: "approved",
        expenseDate: { $gte: startDate, $lte: endDate },
      })
      .exec();

    const byCategory = new Map<string, number>();
    let total = 0;
    for (const row of rows) {
      total += row.amount;
      byCategory.set(row.category, (byCategory.get(row.category) || 0) + row.amount);
    }

    return {
      total,
      byCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })),
      count: rows.length,
    };
  }
}
