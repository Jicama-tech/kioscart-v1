import { Module } from "@nestjs/common";
import { ShopkeeperStoresService } from "./shopkeeper-stores.service";
import { ShopkeeperStoresController } from "./shopkeeper-stores.controller";
import { MongooseModule } from "@nestjs/mongoose/dist";
import {
  ShopfrontStore,
  ShopfrontStoreSchema,
} from "./entities/shopkeeper-store.entity";
import {
  Shopkeeper,
  ShopkeeperSchema,
} from "../shopkeepers/schemas/shopkeeper.schema";
import {
  Product,
  ProductSchema,
} from "../products/entities/product.entity";
import { JwtService } from "@nestjs/jwt";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopfrontStore.name, schema: ShopfrontStoreSchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [ShopkeeperStoresController],
  providers: [ShopkeeperStoresService, JwtService],
  exports: [ShopkeeperStoresService, MongooseModule],
})
export class ShopkeeperStoresModule {}
