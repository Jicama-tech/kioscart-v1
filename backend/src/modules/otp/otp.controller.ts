import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  BadRequestException,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OtpService } from "./otp.service";
import { CreateOtpDto } from "./dto/create-otp.dto";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";

@Controller("otp")
export class OtpController {
  constructor(private readonly otpService: OtpService) {}

  @Post()
  create(@Body() createOtpDto: CreateOtpDto) {
    return this.otpService.create(createOtpDto);
  }

  // Business Email OTP (existing)
  @Post("send-business-email-otp")
  async sendOtp(@Body() body: { businessEmail: string; role: string }) {
    await this.otpService.sendOtp(body.businessEmail, body.role);
    return { message: "OTP sent" };
  }

  @Post("verify-business-email-otp")
  async verifyOtp(
    @Body() body: { businessEmail: string; role: string; otp: string },
  ) {
    await this.otpService.verifyOtp(body.businessEmail, body.role, body.otp);
    return { message: "OTP verified" };
  }

  // WhatsApp pairing via pairing code (fallback if terminal QR is inconvenient)
  // Usage: GET /otp/whatsapp/pair?phone=9198XXXXXXXX
  @Get("whatsapp/pair")
  async pair(@Query("phone") phone: string) {
    if (!phone)
      throw new BadRequestException("phone is required (digits, E.164 no +)");
    const digits = phone.replace(/\D/g, "");
    const code = await this.otpService.requestWhatsAppPairingCode(digits);
    return { phone: digits, code };
  }

  // WhatsApp quick send test
  // Usage: POST /otp/whatsapp/send { to: "+9198...", text: "Hello" }
  //
  // Was completely unauthenticated: any caller could send arbitrary WhatsApp
  // messages to any number through the shop's paired account, which is both a
  // spam relay and a fast way to get that number banned. Nothing in the app
  // calls it, so requiring a token costs nothing and closes the hole.
  @Post("whatsapp/send")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("whatsappQR")
  async sendWhatsApp(@Body() body: { to: string; text: string }) {
    if (!body?.to || !body?.text)
      throw new BadRequestException("to and text are required");
    await this.otpService.sendWhatsAppMessage(body.to, body.text);
    return { sent: true };
  }

  // WhatsApp OTP
  @Post("send-whatsapp-otp")
  async sendWhatsAppOtp(
    @Body() body: { whatsappNumber: string; role: string },
  ) {
    return this.otpService.sendWhatsAppOtp(body.whatsappNumber, body.role);
  }

  @Post("verify-whatsapp-otp")
  async verifyWhatsAppOtp(
    @Body() body: { whatsappNumber: string; role: string; otp: string },
  ) {
    return this.otpService.verifyWhatsAppOtp(
      body.whatsappNumber,
      body.role,
      body.otp,
    );
  }

  @Post("verify-chat-otp")
  async verifyChatOTP(
    @Body()
    body: {
      whatsappNumber: string;
      role: string;
      otp: string;
      shopId?: string;
      emailId?: string;
    },
  ) {
    try {
      return this.otpService.VerifyWhatsAppOtp(
        body.whatsappNumber,
        body.role,
        body.otp,
        body.shopId,
        body.emailId,
      );
    } catch (error) {
      throw error;
    }
  }

  @Get()
  findAll() {
    return this.otpService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.otpService.findOne(+id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.otpService.remove(+id);
  }
}
