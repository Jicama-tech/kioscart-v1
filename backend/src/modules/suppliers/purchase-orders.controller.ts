import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";

@Controller("purchase-orders")
@UseGuards(AuthGuard("jwt"))
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  private getActor(req: any) {
    const roles: string[] = Array.isArray(req.user.roles) ? req.user.roles : [];
    const role = roles.includes("organizer") ? "organizer" : "shopkeeper";
    return { id: req.user.userId, role, name: req.user.name } as const;
  }

  @Post()
  create(@Body() dto: CreatePurchaseOrderDto, @Req() req: any) {
    return this.purchaseOrdersService.create(dto, req.user.userId);
  }

  @Get()
  findAll(@Req() req: any, @Query("status") status?: string) {
    return this.purchaseOrdersService.findAll(req.user.userId, status);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.purchaseOrdersService.findOne(id);
  }

  @Patch(":id/ordered")
  markOrdered(@Param("id") id: string) {
    return this.purchaseOrdersService.markOrdered(id);
  }

  @Patch(":id/received")
  markReceived(@Param("id") id: string, @Req() req: any) {
    return this.purchaseOrdersService.markReceived(id, this.getActor(req));
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.purchaseOrdersService.remove(id);
  }
}
