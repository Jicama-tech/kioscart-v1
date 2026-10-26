import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { OrdersModule } from "../orders/orders.module";
import { ProductsModule } from "../products/products.module";
import {
  Shopkeeper,
  ShopkeeperSchema,
} from "../shopkeepers/schemas/shopkeeper.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import {
  AbandonedCart,
  AbandonedCartSchema,
} from "../payments/schemas/abandoned-cart.schema";
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
import { IntegrationOrdersService } from "./integration-orders.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IntegrationApiKey.name, schema: IntegrationApiKeySchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: User.name, schema: UserSchema },
      { name: AbandonedCart.name, schema: AbandonedCartSchema },
    ]),
    OrdersModule,
    ProductsModule,
  ],
  controllers: [IntegrationController, IntegrationKeyController],
  providers: [IntegrationService, IntegrationOrdersService, ApiKeyGuard],
})
export class IntegrationModule {}
