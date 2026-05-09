import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { Payment, PaymentSchema } from "./schemas/payment.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
  ],
})
export class PaymentsModule {}
