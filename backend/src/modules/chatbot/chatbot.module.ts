import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ChatbotService } from "./chatbot.service";
import { ChatbotController } from "./chatbot.controller";
import { ProductSchema } from "../products/entities/product.entity";
import { OrderSchema } from "../orders/entities/order.entity";
import { ShopkeeperSchema } from "../shopkeepers/schemas/shopkeeper.schema";
import { CouponSchema } from "../coupon/entities/coupon.entity";
import { OperatorSchema } from "../operators/entities/operator.entity";
import { PlanSchema } from "../plans/entities/plan.entity";
import { PaymentEmailSchema } from "../payment-emails/schemas/payment-email.schema";
import { UserSchema } from "../users/schemas/user.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "Product", schema: ProductSchema },
      { name: "Order", schema: OrderSchema },
      { name: "Shopkeeper", schema: ShopkeeperSchema },
      { name: "Coupon", schema: CouponSchema },
      { name: "Operator", schema: OperatorSchema },
      { name: "Plan", schema: PlanSchema },
      { name: "PaymentEmail", schema: PaymentEmailSchema },
      { name: "User", schema: UserSchema },
    ]),
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService],
})
export class ChatbotModule {}
