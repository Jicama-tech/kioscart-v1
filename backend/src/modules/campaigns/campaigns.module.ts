import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { Order, OrderSchema } from "../orders/entities/order.entity";
import { User, UserSchema } from "../users/schemas/user.schema";
import {
  Shopkeeper,
  ShopkeeperSchema,
} from "../shopkeepers/schemas/shopkeeper.schema";
import {
  ShopfrontStore,
  ShopfrontStoreSchema,
} from "../shopkeeper-stores/entities/shopkeeper-store.entity";
import { Product, ProductSchema } from "../products/entities/product.entity";
import {
  Operator,
  OperatorSchema,
} from "../operators/entities/operator.entity";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { TabsGuard } from "../../common/tabs/tabs.guard";
import {
  WhatsappCampaign,
  WhatsappCampaignSchema,
} from "./entities/whatsapp-campaign.entity";
import {
  MarketingOptOut,
  MarketingOptOutSchema,
} from "./entities/marketing-opt-out.entity";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import { CampaignAudienceService } from "./campaign-audience";

/**
 * WhatsApp campaigns from the CRM (see CampaignsService).
 *
 * Imports only models and the leaf WhatsappModule — never Orders, Users or
 * Products as modules — so nothing here can close an import cycle; the
 * audience is read straight from the collections. SubscriptionAccessService
 * comes from the @Global SubscriptionAccessModule.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WhatsappCampaign.name, schema: WhatsappCampaignSchema },
      { name: MarketingOptOut.name, schema: MarketingOptOutSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: ShopfrontStore.name, schema: ShopfrontStoreSchema },
      { name: Product.name, schema: ProductSchema },
      // TabsGuard re-reads the operator on every request.
      { name: Operator.name, schema: OperatorSchema },
    ]),
    WhatsappModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignAudienceService, TabsGuard],
})
export class CampaignsModule {}
