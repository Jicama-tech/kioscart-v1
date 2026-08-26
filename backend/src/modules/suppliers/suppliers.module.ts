import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { JwtModule } from "@nestjs/jwt";
import { SuppliersService } from "./suppliers.service";
import { SuppliersController } from "./suppliers.controller";
import { Supplier, SupplierSchema } from "./schemas/supplier.schema";
import {
  SupplierProductConfig,
  SupplierProductConfigSchema,
} from "./schemas/supplier-product-config.schema";
import {
  SupplierRequest,
  SupplierRequestSchema,
} from "./entities/supplier-request.entity";
import { ProductSchema } from "../products/entities/product.entity";
import { ShopkeeperSchema } from "../shopkeepers/schemas/shopkeeper.schema";
import { OrderSchema } from "../orders/entities/order.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: SupplierRequest.name, schema: SupplierRequestSchema },
      { name: SupplierProductConfig.name, schema: SupplierProductConfigSchema },
      { name: "Product", schema: ProductSchema },
      { name: "Shopkeeper", schema: ShopkeeperSchema },
      // Read-only: sums recent order line items for requirement suggestions.
      { name: "Order", schema: OrderSchema },
    ]),
    // JwtAuthGuard injects JwtService; it verifies with JWT_ACCESS_SECRET.
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret",
      signOptions: { expiresIn: "1d" },
    }),
  ],
  controllers: [SuppliersController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}
