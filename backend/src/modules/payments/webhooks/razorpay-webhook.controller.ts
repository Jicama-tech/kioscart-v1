import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
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
}
