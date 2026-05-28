import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PaymentsService } from "./payments.service";
import { CheckoutService } from "./checkout.service";
import { PaymentsController } from "./payments.controller";
import { Payment, PaymentSchema } from "./schemas/payment.schema";
import {
  CheckoutIntent,
  CheckoutIntentSchema,
} from "./schemas/checkout-intent.schema";
import { Order, OrderSchema } from "../orders/entities/order.entity";
import {
  Shopkeeper,
  ShopkeeperSchema,
} from "../shopkeepers/schemas/shopkeeper.schema";
import { ShopkeepersModule } from "../shopkeepers/shopkeepers.module";
import { OtpModule } from "../otp/otp.module";
import { OrdersModule } from "../orders/orders.module";
import { RazorpayWebhookController } from "./webhooks/razorpay-webhook.controller";
import { RazorpayWebhookService } from "./webhooks/razorpay-webhook.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: CheckoutIntent.name, schema: CheckoutIntentSchema },
    ]),
    forwardRef(() => ShopkeepersModule),
    forwardRef(() => OtpModule),
    forwardRef(() => OrdersModule),
  ],
  controllers: [PaymentsController, RazorpayWebhookController],
  providers: [PaymentsService, CheckoutService, RazorpayWebhookService],
  exports: [
    PaymentsService,
    CheckoutService,
    RazorpayWebhookService,
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
  ],
})
export class PaymentsModule {}
