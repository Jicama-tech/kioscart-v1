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

class IntegrationStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Shopkeeper dashboard: create / rotate / revoke the connector key. */
@Controller("integration/api-key")
@UseGuards(AuthGuard("jwt"))
export class IntegrationKeyController {
  constructor(private readonly integration: IntegrationService) {}

  // Operators (staff) must not mint credentials for the whole shop.
  private shopId(req: any): string {
    if (req.user?.operatorId) {
      throw new ForbiddenException("Only the shop owner can manage API keys");
    }
    return req.user.userId;
  }

  @Get()
  info(@Req() req: any) {
    return this.integration.getKeyInfo(this.shopId(req));
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
  constructor(private readonly integration: IntegrationService) {}

  @Get("shop")
  shop(@Req() req: any) {
    return this.integration.getShop(req.user.userId);
  }

  @Get("products")
  products(@Req() req: any, @Query() q: any) {
    return this.integration.listProducts(req.user.userId, q);
  }

  @Get("orders")
  orders(@Req() req: any, @Query() q: any) {
    return this.integration.listOrders(req.user.userId, q);
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
