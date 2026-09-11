import { Global, Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Shopkeeper,
  ShopkeeperSchema,
} from "../../modules/shopkeepers/schemas/shopkeeper.schema";
import { Plan, PlanSchema } from "../../modules/plans/entities/plan.entity";
import { SubscriptionAccessService } from "./subscription-access.service";
import { SubscriptionGuard } from "./subscription.guard";

/**
 * Global so any controller can `@UseGuards(SubscriptionGuard)` without each
 * feature module having to re-import the Shopkeeper and Plan models.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
  ],
  providers: [SubscriptionAccessService, SubscriptionGuard],
  exports: [SubscriptionAccessService, SubscriptionGuard],
})
export class SubscriptionAccessModule {}
