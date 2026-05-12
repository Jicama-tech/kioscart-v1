import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminPaymentsService } from "./admin-payments.service";

@Controller("admin/payments")
@UseGuards(JwtAuthGuard)
export class AdminPaymentsController {
  constructor(private readonly service: AdminPaymentsService) {}

  @Get("pending-releases")
  pendingReleases(
    @Query("shopkeeperId") shopkeeperId?: string,
    @Query("country") country?: string,
    @Query("minAgeDays") minAgeDays?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listPendingReleases({
      shopkeeperId,
      country,
      minAgeDays: minAgeDays ? Number(minAgeDays) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("released")
  released(
    @Query("shopkeeperId") shopkeeperId?: string,
    @Query("country") country?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listReleased({
      shopkeeperId,
      country,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("refunded")
  refunded(
    @Query("shopkeeperId") shopkeeperId?: string,
    @Query("country") country?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listRefunded({
      shopkeeperId,
      country,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch(":id/release")
  release(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { note?: string },
  ) {
    return this.service.releasePayment(id, req.user.sub, body?.note);
  }

  @Post("bulk-release")
  bulkRelease(
    @Req() req: any,
    @Body() body: { paymentIds: string[]; note?: string },
  ) {
    if (!Array.isArray(body?.paymentIds) || !body.paymentIds.length) {
      throw new BadRequestException("paymentIds[] required");
    }
    return this.service.bulkRelease(body.paymentIds, req.user.sub, body.note);
  }

  @Patch(":id/refund")
  refund(
    @Param("id") id: string,
    @Req() req: any,
    @Body() body: { amount?: number; reason?: string },
  ) {
    return this.service.refundPayment(id, req.user.sub, {
      amount: body?.amount,
      reason: body?.reason,
    });
  }
}
