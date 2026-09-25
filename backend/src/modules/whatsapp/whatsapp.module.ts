import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ShopWhatsapp, ShopWhatsappSchema } from "./schemas/shop-whatsapp.schema";
import {
  Operator,
  OperatorSchema,
} from "../operators/entities/operator.entity";
import {
  Shopkeeper,
  ShopkeeperSchema,
} from "../shopkeepers/schemas/shopkeeper.schema";
import { ShopWhatsappService } from "./shop-whatsapp.service";
import { ShopWhatsappController } from "./shop-whatsapp.controller";
import { TabsGuard } from "../../common/tabs/tabs.guard";

/**
 * Each shop's own WhatsApp connection (Settings › WhatsApp).
 *
 * A LEAF module on purpose: it imports models only, never another feature
 * module. OrdersModule imports this one to send order messages from the
 * shop's number, so anything here that reached back into Orders — directly or
 * through Users, Shopkeepers, Otp or Payments — would be a circular import.
 * SubscriptionAccessService comes from the @Global SubscriptionAccessModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShopWhatsapp.name, schema: ShopWhatsappSchema },
      // TabsGuard re-reads the operator on every request.
      { name: Operator.name, schema: OperatorSchema },
      // The test send reads the shop's country for numbers typed locally.
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
    ]),
  ],
  controllers: [ShopWhatsappController],
  providers: [ShopWhatsappService, TabsGuard],
  exports: [ShopWhatsappService],
})
export class WhatsappModule {}
