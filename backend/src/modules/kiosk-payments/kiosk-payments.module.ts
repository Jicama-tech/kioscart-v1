import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { OrdersModule } from "../orders/orders.module";
import { Shopkeeper, ShopkeeperSchema } from "../shopkeepers/schemas/shopkeeper.schema";
import { KioskPayment, KioskPaymentSchema } from "./kiosk-payment.schema";
import { KioskPaymentsController, KioskPayPublicController } from "./kiosk-payments.controller";
import { KioskPaymentsService } from "./kiosk-payments.service";

/** Kiosk sales paid by QR (PayNow / UPI), "Payment pending" until confirmed; used by the kiosk and by ComBox. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KioskPayment.name, schema: KioskPaymentSchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
    ]),
    // also provides the Order model
    OrdersModule,
  ],
  controllers: [KioskPaymentsController, KioskPayPublicController],
  providers: [KioskPaymentsService],
  exports: [KioskPaymentsService],
})
export class KioskPaymentsModule {}
