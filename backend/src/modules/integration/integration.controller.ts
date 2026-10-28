import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { OrderStatus } from "../orders/entities/order.entity";
import { ApiKeyGuard } from "./api-key.guard";
import { IntegrationService } from "./integration.service";
import { IntegrationOrdersService } from "./integration-orders.service";
import { IntegrationCreateOrderDto, IntegrationPaymentRequestDto, IntegrationQuoteDto } from "./dto/integration-order.dto";
import { KioskPaymentsService } from "../kiosk-payments/kiosk-payments.service";

class IntegrationStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Shopkeeper dashboard: create / rotate / revoke the connector key. Operators
 * (staff) may read the key status (prefix and dates only, never the secret).
 */
@Controller("integration/api-key")
@UseGuards(AuthGuard("jwt"))
export class IntegrationKeyController {
  constructor(private readonly integration: IntegrationService) {}

  // Operators (staff) must not mint credentials for the whole shop.
  private shopId(req: any, { ownerOnly = true } = {}): string {
    if (ownerOnly && req.user?.operatorId) {
      throw new ForbiddenException("Only the shop owner can manage API keys");
    }
    return req.user.userId;
  }

  @Get()
  info(@Req() req: any) {
    return this.integration.getKeyInfo(this.shopId(req, { ownerOnly: false }));
  }

  @Post()
  rotate(@Req() req: any) {
    return this.integration.rotateKey(this.shopId(req));
  }

  @Delete()
  revoke(@Req() req: any) {
    return this.integration.revokeKey(this.shopId(req));
  }
}

/** Machine API used by ComBox. The shop always comes from the API key. */
@Controller("integration/v1")
@UseGuards(ApiKeyGuard)
export class IntegrationController {
  constructor(
    private readonly integration: IntegrationService,
    private readonly integrationOrders: IntegrationOrdersService,
    private readonly kioskPayments: KioskPaymentsService,
  ) {}

  @Get("shop")
  shop(@Req() req: any) {
    return this.integration.getShop(req.user.userId);
  }

  @Get("products")
  products(@Req() req: any, @Query() q: any) {
    return this.integration.listProducts(req.user.userId, q);
  }

  @Get("customers")
  customers(@Req() req: any, @Query() q: any) {
    return this.integration.listCustomers(req.user.userId, q);
  }

  @Get("orders")
  async orders(@Req() req: any, @Query() q: any) {
    const result = await this.integration.listOrders(req.user.userId, q);
    // Orders waiting on a payment link are checked with Razorpay so a paid one shows as paid
    await this.integrationOrders.refreshPayments(req.user.userId, result.orders);
    return result;
  }

  /** Online checkouts the customer started but did not pay (and the ones paid later, marked recovered). */
  @Get("abandoned-carts")
  abandonedCarts(@Req() req: any, @Query() q: any) {
    return this.integration.listAbandonedCarts(req.user.userId, q);
  }

  /** What would this basket cost (prices, delivery, tax, total) and which payment methods does the shop take? */
  @Post("orders/quote")
  quoteOrder(@Req() req: any, @Body() dto: IntegrationQuoteDto) {
    return this.integrationOrders.quote(req.user.userId, dto);
  }

  /** Place an order for a customer. Prices are always computed here; the caller sends no amounts. */
  @Post("orders")
  createOrder(@Req() req: any, @Body() dto: IntegrationCreateOrderDto) {
    return this.integrationOrders.create(req.user.userId, dto);
  }

  /**
   * A kiosk pickup sale paid by QR (PayNow / UPI): "Payment pending" with a payment link and QR, until the customer
   * presses "I have paid" on the link or the kiosk confirms it; only then is the order placed.
   */
  @Post("payment-requests")
  async createPaymentRequest(@Req() req: any, @Body() dto: IntegrationPaymentRequestDto) {
    const shopId = req.user.userId;
    const prepared = await this.integrationOrders.preparePickupOrder(shopId, dto);
    return this.kioskPayments.create(shopId, {
      source: "combox-kiosk",
      externalRef: dto.externalRef,
      amount: prepared.totals.total,
      currency: prepared.currency,
      customerName: dto.customer.name,
      customerWhatsApp: prepared.order.whatsAppNumber,
      lines: prepared.lines,
      order: prepared.order,
    });
  }

  @Get("payment-requests")
  paymentRequests(@Req() req: any, @Query("status") status?: string) {
    const valid = ["pending", "paid", "cancelled", "expired"].includes(String(status)) ? String(status) : undefined;
    return this.kioskPayments.list(req.user.userId, { source: "combox-kiosk", status: valid });
  }

  @Get("payment-requests/:id")
  paymentRequest(@Req() req: any, @Param("id") id: string) {
    return this.kioskPayments.getForShop(req.user.userId, id);
  }

  @Post("payment-requests/:id/paid")
  markPaymentRequestPaid(@Req() req: any, @Param("id") id: string) {
    return this.kioskPayments.markPaidByStaff(req.user.userId, id);
  }

  @Post("payment-requests/:id/cancel")
  cancelPaymentRequest(@Req() req: any, @Param("id") id: string) {
    return this.kioskPayments.cancel(req.user.userId, id);
  }

  @Get("orders/:id")
  getOrder(@Req() req: any, @Param("id") id: string) {
    return this.integrationOrders.getOrder(req.user.userId, id);
  }

  @Patch("orders/:id/status")
  updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: IntegrationStatusDto,
  ) {
    return this.integration.updateOrderStatus(
      req.user.userId,
      id,
      dto.status,
      dto.notes,
    );
  }
}
