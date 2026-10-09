import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { OrdersModule } from "../orders/orders.module";
import { ProductsModule } from "../products/products.module";
import {
  Shopkeeper,
  ShopkeeperSchema,
} from "../shopkeepers/schemas/shopkeeper.schema";
import { ApiKeyGuard } from "./api-key.guard";
import {
  IntegrationApiKey,
  IntegrationApiKeySchema,
} from "./entities/integration-api-key.entity";
import {
  IntegrationController,
  IntegrationKeyController,
} from "./integration.controller";
import { IntegrationService } from "./integration.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IntegrationApiKey.name, schema: IntegrationApiKeySchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
    ]),
    OrdersModule,
    ProductsModule,
  ],
  controllers: [IntegrationController, IntegrationKeyController],
  providers: [IntegrationService, ApiKeyGuard],
})
export class IntegrationModule {}
