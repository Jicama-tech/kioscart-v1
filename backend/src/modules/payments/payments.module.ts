import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { Payment, PaymentSchema } from "./schemas/payment.schema";
import { Order, OrderSchema } from "../orders/entities/order.entity";
import { ShopkeepersModule } from "../shopkeepers/shopkeepers.module";
import { RazorpayWebhookController } from "./webhooks/razorpay-webhook.controller";
import { RazorpayWebhookService } from "./webhooks/razorpay-webhook.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    forwardRef(() => ShopkeepersModule),
  ],
  controllers: [PaymentsController, RazorpayWebhookController],
  providers: [PaymentsService, RazorpayWebhookService],
  exports: [
    PaymentsService,
    RazorpayWebhookService,
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
  ],
})
export class PaymentsModule {}
