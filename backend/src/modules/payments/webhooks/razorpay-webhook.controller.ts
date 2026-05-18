import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  Param,
} from "@nestjs/common";
import { RazorpayWebhookService } from "./razorpay-webhook.service";

@Controller("webhooks/razorpay")
export class RazorpayWebhookController {
  constructor(private readonly service: RazorpayWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: any,
    @Headers("x-razorpay-signature") signature: string,
    @Body() body: any,
  ) {
    const rawBody: string = req.rawBody || JSON.stringify(body);
    return this.service.handle(rawBody, signature || "", body);
  }

  /** TEMPORARY — manually fire the shopkeeper WhatsApp notify for any order.
   *  No auth, no signature: do NOT ship this route. Remove after testing. */
  @Post("_test-notify/:orderId")
  @HttpCode(HttpStatus.OK)
  async testNotify(@Param("orderId") orderId: string) {
    return this.service._debugNotifyByOrderId(orderId);
  }
}
