import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  Param,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthGuard } from "@nestjs/passport";
import { PaymentsService } from "./payments.service";
import { CheckoutService } from "./checkout.service";
import { CreatePaymentOrderDto, VerifyPaymentDto } from "./dto/checkout.dto";
import * as path from "path";
import { diskStorage } from "multer";

function tempStorage() {
  return diskStorage({
    destination: "./uploads/tmp",
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    },
  });
}

@Controller("payments")
export class PaymentsController {
  constructor(
    private paymentsService: PaymentsService,
    private checkoutService: CheckoutService,
  ) {}

  // ---- Razorpay customer-checkout flow (India only for now) ----

  @Post("order")
  @UseGuards(AuthGuard("jwt"))
  async createPaymentOrder(@Body() dto: CreatePaymentOrderDto, @Req() req: any) {
    const customerUserId = req.user?.userId || req.user?.sub;
    return this.checkoutService.createPaymentOrder(dto, customerUserId);
  }

  @Post("verify")
  @UseGuards(AuthGuard("jwt"))
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    return this.checkoutService.verifyPayment(dto);
  }

  @Get("earnings/:shopkeeperId")
  @UseGuards(AuthGuard("jwt"))
  async earningsSummary(@Param("shopkeeperId") shopkeeperId: string) {
    return this.checkoutService.earningsSummaryFor(shopkeeperId);
  }

  @Post("decode-qr")
  @UseInterceptors(FileInterceptor("file", { storage: tempStorage() }))
  async decodeQr(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.paymentsService.decodeQrFromFile(file.path);
  }

  @Get("decode-qr-url")
  async decodeQrUrl(@Query("imageUrl") imageUrl: string) {
    return this.paymentsService.decodeQrFromUrl(imageUrl);
  }

  @Get("generate-qr")
  async generateQr(
    @Query("scheme") scheme: "UPI" | "PAYNOW",
    @Query("payeeId") payeeId: string,
    @Query("payeeName") payeeName: string,
    @Query("amount") amount: string,
    @Query("billNumber") billNumber?: string,
    @Query("currency") currency = scheme === "PAYNOW" ? "SGD" : "INR"
  ) {
    if (!payeeId || !payeeName)
      throw new BadRequestException("Missing payeeId or payeeName");

    try {
      return await this.paymentsService.generateQrCode(
        {
          scheme,
          payeeId,
          payeeName,
          amount,
          billNumber,
          currency,
          editableAmount: false,
          countryCode: scheme === "PAYNOW" ? "SG" : "IN",
        },
        billNumber
      );
    } catch (error) {
      throw new BadRequestException("Failed to generate QR: " + error.message);
    }
  }
}
