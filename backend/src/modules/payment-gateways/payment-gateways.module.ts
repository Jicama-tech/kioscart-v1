import { Module, Global } from "@nestjs/common";
import { RazorpayGateway } from "./razorpay.gateway";
import { PaymentGatewayFactory } from "./gateway.factory";

@Global()
@Module({
  providers: [RazorpayGateway, PaymentGatewayFactory],
  exports: [RazorpayGateway, PaymentGatewayFactory],
})
export class PaymentGatewaysModule {}
