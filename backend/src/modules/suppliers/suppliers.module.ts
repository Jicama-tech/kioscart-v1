import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { SuppliersService } from "./suppliers.service";
import { SuppliersController } from "./suppliers.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { SupplierSchema } from "./schemas/supplier.schema";
import { PurchaseOrderSchema } from "./schemas/purchase-order.schema";
import { ProductSchema } from "../products/entities/product.entity";
import { ExpensesModule } from "../expenses/expenses.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Supplier", schema: SupplierSchema },
      { name: "PurchaseOrder", schema: PurchaseOrderSchema },
      { name: "Product", schema: ProductSchema },
    ]),
    ExpensesModule,
  ],
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [SuppliersService, PurchaseOrdersService],
  exports: [SuppliersService, PurchaseOrdersService],
})
export class SuppliersModule {}
