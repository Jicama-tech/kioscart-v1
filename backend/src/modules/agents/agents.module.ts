import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AgentsService } from "./agents.service";
import { AgentsController } from "./agents.controller";
import { Agent, AgentSchema } from "./schemas/agent.schema";
import { Shopkeeper, ShopkeeperSchema } from "../shopkeepers/schemas/shopkeeper.schema";
import { Order, OrderSchema } from "../orders/entities/order.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Agent.name, schema: AgentSchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService, MongooseModule],
})
export class AgentsModule {}
