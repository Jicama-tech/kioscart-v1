import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { PurchaseOrder, PurchaseOrderDocument } from "./schemas/purchase-order.schema";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { SuppliersService } from "./suppliers.service";
import { ExpensesService, RequestActor } from "../expenses/expenses.service";
import { Product } from "../products/entities/product.entity";

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel("PurchaseOrder") private readonly purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly suppliersService: SuppliersService,
    private readonly expensesService: ExpensesService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, shopkeeperId: string) {
    await this.suppliersService.findOne(dto.supplier); // 404s if missing
    const totalAmount = dto.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
    return new this.purchaseOrderModel({
      shopkeeperId,
      supplier: dto.supplier,
      items: dto.items,
      totalAmount,
      notes: dto.notes,
      status: "draft",
    }).save();
  }

  findAll(shopkeeperId: string, status?: string) {
    const query: any = { shopkeeperId };
    if (status) query.status = status;
    return this.purchaseOrderModel.find(query).populate("supplier", "name").sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string) {
    const po = await this.purchaseOrderModel.findById(id).populate("supplier", "name").exec();
    if (!po) throw new NotFoundException("Purchase order not found");
    return po;
  }

  async markOrdered(id: string) {
    const po = await this.findOne(id);
    if (po.status !== "draft") throw new BadRequestException("Only draft purchase orders can be marked ordered");
    po.status = "ordered";
    return po.save();
  }

  /**
   * Marks a PO received: bumps product stock for each line item and books
   * an auto-approved Purchases/COGS expense (the shopkeeper/organizer owner
   * is implicitly the one "adding" it, so it counts immediately in the P&L).
   */
  async markReceived(id: string, actor: RequestActor) {
    const po = await this.findOne(id);
    if (po.status === "received") {
      throw new BadRequestException("Purchase order already received");
    }

    for (const item of po.items) {
      await this.productModel.findByIdAndUpdate(item.productId, {
        $inc: { inventory: item.quantity },
      });
    }

    const supplierName = (po.supplier as any)?.name || "Supplier";
    const expense = await this.expensesService.create(
      {
        category: "Purchases/COGS",
        partyName: supplierName,
        amount: po.totalAmount,
        description: `Stock-in for PO ${po._id}`,
        expenseDate: new Date().toISOString(),
      } as any,
      actor,
    );

    po.status = "received";
    po.receivedAt = new Date();
    po.expenseId = (expense as any)._id.toString();
    return po.save();
  }

  async remove(id: string) {
    const po = await this.findOne(id);
    if (po.status !== "draft") throw new BadRequestException("Only draft purchase orders can be deleted");
    await po.deleteOne();
    return { success: true };
  }
}
