import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ScheduleModule } from "@nestjs/schedule";
import { PaymentEmailsController } from "./payment-emails.controller";
import { PaymentEmailsService } from "./payment-emails.service";
import { GmailService } from "./gmail.service";
import { EmailParserService } from "./email-parser.service";
import {
  GmailConnection,
  GmailConnectionSchema,
} from "./schemas/gmail-connection.schema";
import {
  PaymentEmail,
  PaymentEmailSchema,
} from "./schemas/payment-email.schema";
import { Order, OrderSchema } from "../orders/entities/order.entity";
import { Shopkeeper, ShopkeeperSchema } from "../shopkeepers/schemas/shopkeeper.schema";
import { OtpModule } from "../otp/otp.module";
import { forwardRef } from "@nestjs/common";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: GmailConnection.name, schema: GmailConnectionSchema },
      { name: PaymentEmail.name, schema: PaymentEmailSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
    ]),
    forwardRef(() => OtpModule),
  ],
  controllers: [PaymentEmailsController],
  providers: [PaymentEmailsService, GmailService, EmailParserService],
  exports: [PaymentEmailsService],
})
export class PaymentEmailsModule {}
