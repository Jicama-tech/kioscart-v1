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
import {
  CreatePaymentOrderDto,
  InitiateRazorpayPaymentDto,
  VerifyPaymentDto,
} from "./dto/checkout.dto";
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

  // Guest-accessible. Auth comes from cart ownership: the orderId in the
  // DTO must match an existing Order, and the amount is pulled from that
  // persisted Order — never from the client — so a guest can only ever
  // pay for an order that already exists at our backend.
  @Post("order")
  async createPaymentOrder(@Body() dto: CreatePaymentOrderDto, @Req() req: any) {
    const customerUserId = req.user?.userId || req.user?.sub;
    return this.checkoutService.createPaymentOrder(dto, customerUserId);
  }

  // Guest-accessible. The Razorpay HMAC signature IS the authentication:
  // anyone presenting a valid `{orderId}|{paymentId}` signature is proven
  // authorized by Razorpay itself. A JWT layer on top adds no security
  // and would break the in-modal handler callback which has no JWT
  // context.
  @Post("verify")
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    return this.checkoutService.verifyPayment(dto);
  }

  // ---- Lazy-creation Razorpay flow (preferred new path) ----

  /** Step 1: stash the cart + create a Razorpay order. NO Order/Payment
   *  doc is written here — only on `verify-create` after the customer pays. */
  @Post("initiate")
  async initiateRazorpay(
    @Body() dto: InitiateRazorpayPaymentDto,
    @Req() req: any,
  ) {
    const customerUserId = req.user?.userId || req.user?.sub;
    return this.checkoutService.initiateRazorpayPayment(dto, customerUserId);
  }

  /** Step 2: customer paid. Verify the signature and materialize the Order
   *  + Payment from the intent. Idempotent w.r.t. the webhook fallback. */
  @Post("verify-create")
  async verifyAndCreate(@Body() dto: VerifyPaymentDto) {
    return this.checkoutService.verifyAndCreateOrder(dto);
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
