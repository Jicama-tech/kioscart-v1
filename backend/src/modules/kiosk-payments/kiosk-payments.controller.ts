import { Body, Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { KioskPaymentsService } from "./kiosk-payments.service";

class CreateKioskPaymentDto {
  // the order the kiosk would place (as POST /orders/create-order takes it); placed once the payment is confirmed
  @IsObject()
  order: Record<string, any>;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  externalRef?: string;
}

class ListKioskPaymentsQuery {
  @IsOptional()
  @IsIn(["pending", "paid", "cancelled", "expired"])
  status?: string;
}

/** The shop's own kiosk (KiosCart dashboard): QR payments waiting for the customer. */
@Controller("kiosk-payments")
@UseGuards(AuthGuard("jwt"))
export class KioskPaymentsController {
  constructor(private readonly payments: KioskPaymentsService) {}

  private shopId(req: any): string {
    if (!(req.user?.roles || []).includes("shopkeeper")) throw new ForbiddenException("Only the shop can do this");
    return req.user.userId;
  }

  @Get("support")
  support(@Req() req: any) {
    return this.payments.qrSupport(this.shopId(req));
  }

  @Get()
  list(@Req() req: any, @Query() q: ListKioskPaymentsQuery) {
    return this.payments.list(this.shopId(req), { source: "kioscart-kiosk", status: q.status });
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateKioskPaymentDto) {
    const order = dto.order || {};
    const whatsApp = String(order.whatsAppNumber || "");
    return this.payments.create(this.shopId(req), {
      source: "kioscart-kiosk",
      externalRef: dto.externalRef,
      amount: Number(order.totalAmount),
      customerName: order.fullName || undefined,
      customerWhatsApp: whatsApp && whatsApp !== "kiosk-order" ? whatsApp : undefined,
      lines: (Array.isArray(order.items) ? order.items : []).map((i: any) => ({
        name: String(i.productName || "Item"),
        quantity: Number(i.quantity) || 1,
        lineTotal: Math.round((Number(i.optionPrice ?? i.price) || 0) * (Number(i.quantity) || 1) * 100) / 100,
        option: [i.optionTitle, i.subcategoryName, i.variantTitle].filter((x: any) => x && x !== "Default").join(" · ") || null,
      })),
      order: { ...order, source: "kiosk" },
    });
  }

  @Get(":id")
  get(@Req() req: any, @Param("id") id: string) {
    return this.payments.getForShop(this.shopId(req), id);
  }

  @Post(":id/paid")
  markPaid(@Req() req: any, @Param("id") id: string) {
    return this.payments.markPaidByStaff(this.shopId(req), id);
  }

  @Post(":id/cancel")
  cancel(@Req() req: any, @Param("id") id: string) {
    return this.payments.cancel(this.shopId(req), id);
  }
}

/** The customer's payment page (/kiosk-pay/<token>): no sign-in, the token in the link is the key. */
@Controller("public/kiosk-pay")
export class KioskPayPublicController {
  constructor(private readonly payments: KioskPaymentsService) {}

  @Get(":token")
  view(@Param("token") token: string) {
    return this.payments.publicView(token);
  }

  @Post(":token/paid")
  paid(@Param("token") token: string) {
    return this.payments.markPaidByCustomer(token);
  }
}
