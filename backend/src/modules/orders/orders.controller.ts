import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Query,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Delete,
  Req,
  Res,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { OrderStatus } from "./entities/order.entity";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";
import { Response } from "express";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * The shop id in these URLs is not a secret — it is decoded from the login
   * token by the dashboard, printed in storefront links and pasted into QR
   * codes — so a valid token on its own proves nothing about whose orders are
   * being read. The JWT `userId` is the owning shopkeeper even on an
   * operator-minted token (see auth/strategies/jwt.strategy.ts), so an
   * operator passes their parent shop's check without a separate branch.
   */
  private assertOwnShop(req: any, shopkeeperId: string) {
    if (String(req?.user?.userId || "") !== String(shopkeeperId || "")) {
      throw new ForbiddenException("Not your shop");
    }
  }

  // Status updates are keyed on an order id, not a shop id, so ownership has
  // to be read off the order itself. getOrderById populates shopkeeperId,
  // hence the _id-or-raw-id unwrap.
  private async assertOwnsOrder(req: any, orderId: string) {
    const order: any = await this.ordersService.getOrderById(orderId);
    const ownerId = String(order?.shopkeeperId?._id || order?.shopkeeperId || "");
    this.assertOwnShop(req, ownerId);
  }

  // Deliberately public: this is the storefront checkout. The buyer is a
  // customer, not a shopkeeper, and carries no token — see paymentPage.tsx.
  // Locking it (or gating it on a plan key) would take the shop offline.
  @Post("create-order")
  async create(@Body() dto: CreateOrderDto) {
    try {
      return await this.ordersService.createOrder(dto);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get("get-orders/:orderId")
  async getByOrderId(@Param("orderId") orderId: string) {
    try {
      return await this.ordersService.getOrderById(orderId);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get("get-orders/shopkeeper/:shopkeeperId")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("orders")
  async getByField(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    this.assertOwnShop(req, shopkeeperId);
    try {
      const pageNum = page ? parseInt(page, 10) : undefined;
      const limitNum = limit ? parseInt(limit, 10) : undefined;
      return await this.ordersService.getOrdersByShopkeeperId(shopkeeperId, pageNum, limitNum);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get("get-orders/user/:userId")
  async getByUser(@Param("userId") userId: string) {
    try {
      return await this.ordersService.getOrdersByUserId(userId);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Patch(":orderId/status")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("orders", "ordersStatusUpdate")
  async updateOrderStatus(
    @Req() req: any,
    @Param("orderId") orderId: string,
    @Body() updateDTO: UpdateOrderDto,
  ) {
    // Outside the try below on purpose — that catch turns everything into a
    // 400, which would hide the 403/404 this check is meant to return.
    await this.assertOwnsOrder(req, orderId);
    try {
      return await this.ordersService.updateOrderStatus(orderId, updateDTO);
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Get("customers/:shopkeeperId")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  // Keyed on "orders" rather than "crm": the dashboard overview reads this
  // list too, so gating it on the CRM tab would blank out a plan that only
  // bought Orders.
  @RequiresFeature("orders")
  async getCustomersByShopkeeper(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
  ) {
    this.assertOwnShop(req, shopkeeperId);
    try {
      return await this.ordersService.getCustomersWithOrderSummary(
        shopkeeperId,
      );
    } catch (error) {
      throw new InternalServerErrorException("Failed to retrieve customers");
    }
  }

  @Get(":id/receipt")
  async downloadReceipt(
    @Param("id") id: string,
    @Query("type") type: string,
    @Query("disposition") disposition: string,
    @Res() res: Response,
  ) {
    try {
      const receipt = await this.ordersService.generateReceipt(id, type);

      const mode = disposition === "inline" ? "inline" : "attachment";
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `${mode}; filename=receipt-${id.slice(-8)}.pdf`,
        "Content-Length": receipt.length,
      });

      return res.end(receipt);
    } catch (error) {
      throw new InternalServerErrorException("Failed to generate receipt");
    }
  }

  // Ownership is read off the order, same as the status update — deleting
  // someone else's order was reachable with no token at all.
  @Delete("delete-order/:orderId")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("orders")
  async deleteOrder(@Param("orderId") orderId: string, @Req() req: any) {
    await this.assertOwnsOrder(req, orderId);
    try {
      return await this.ordersService.deleteOrder(orderId);
    } catch (error) {
      throw error;
    }
  }

  @Get("print-receipt/:id")
  async getPrintReceipt(@Param("id") orderId: string) {
    const printData = await this.ordersService.generatePrintReceipt(orderId);
    return printData;
  }

  @Post("create-print-data")
  async createPrintData(@Body() body: { orderId: string; printData: any[] }) {
    try {
      const printId = await this.ordersService.createPrintData(
        body.orderId,
        body.printData,
      );
      return { printId };
    } catch (error) {
      throw new InternalServerErrorException("Failed to create print data");
    }
  }

  @Get("print-data/:printId")
  async getPrintData(@Param("printId") printId: string) {
    try {
      const printData = await this.ordersService.getPrintData(printId);
      if (!printData) {
        throw new NotFoundException("Print data not found");
      }
      return printData;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException("Failed to get print data");
    }
  }

  @Get("thermal-print/:id")
  async getThermalPrintData(@Param("id") orderId: string) {
    try {
      const printData =
        await this.ordersService.generateThermalPrintData(orderId);
      return printData;
    } catch (error) {
      throw new InternalServerErrorException(
        "Failed to generate thermal print data",
      );
    }
  }

  @Get("shopkeeper-info/:shopkeeperId")
  @UseGuards(AuthGuard("jwt"), SubscriptionGuard)
  @RequiresFeature("orders")
  async getShopkeeperInfo(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
  ) {
    this.assertOwnShop(req, shopkeeperId);
    try {
      const shopkeeperInfo =
        await this.ordersService.getShopkeeperInfo(shopkeeperId);
      return shopkeeperInfo;
    } catch (error) {
      throw new InternalServerErrorException("Failed to get shopkeeper info");
    }
  }

  @Get("coupon-code-validation/:userId/coupon/:code")
  async validateCouponCode(
    @Param("userId") userId: string,
    @Param("code") code: string,
  ) {
    try {
      return await this.ordersService.getCouponAppliedStatus(userId, code);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
