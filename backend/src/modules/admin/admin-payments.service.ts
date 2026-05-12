import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Payment,
  PaymentDocument,
  PaymentStatus,
  TransferStatus,
} from "../payments/schemas/payment.schema";
import { Order } from "../orders/entities/order.entity";
import { PaymentGatewayFactory } from "../payment-gateways/gateway.factory";

interface ListFilters {
  shopkeeperId?: string;
  country?: string;
  minAgeDays?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class AdminPaymentsService {
  private readonly logger = new Logger(AdminPaymentsService.name);

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly gatewayFactory: PaymentGatewayFactory,
  ) {}

  private buildQuery(
    transferStatus: TransferStatus | TransferStatus[],
    f: ListFilters,
  ) {
    const q: any = {};
    q.transferStatus = Array.isArray(transferStatus)
      ? { $in: transferStatus }
      : transferStatus;
    if (f.shopkeeperId) q.shopkeeperId = new Types.ObjectId(f.shopkeeperId);
    if (f.country) q.country = f.country.toUpperCase();
    if (f.minAgeDays && f.minAgeDays > 0) {
      const cutoff = new Date(Date.now() - f.minAgeDays * 86400000);
      q.heldAt = { $lte: cutoff };
    }
    return q;
  }

  async listPendingReleases(f: ListFilters) {
    const page = Math.max(1, f.page || 1);
    const limit = Math.min(200, f.limit || 50);
    const query = this.buildQuery(TransferStatus.OnHold, f);

    const [items, total, totals] = await Promise.all([
      this.paymentModel
        .find(query)
        .populate({ path: "shopkeeperId", select: "name shopName country" })
        .populate({ path: "orderId", select: "orderId totalAmount customerName createdAt" })
        .sort({ heldAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.paymentModel.countDocuments(query),
      this.paymentModel.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$currency",
            grossAmount: { $sum: "$amount" },
            commission: { $sum: "$commissionAmount" },
            netAmount: { $sum: "$netAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    return { items, total, page, limit, totalsByCurrency: totals };
  }

  async listReleased(f: ListFilters) {
    const page = Math.max(1, f.page || 1);
    const limit = Math.min(200, f.limit || 50);
    const query = this.buildQuery(TransferStatus.Released, f);
    const [items, total] = await Promise.all([
      this.paymentModel
        .find(query)
        .populate({ path: "shopkeeperId", select: "name shopName country" })
        .populate({ path: "orderId", select: "orderId totalAmount customerName" })
        .sort({ releasedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.paymentModel.countDocuments(query),
    ]);
    return { items, total, page, limit };
  }

  async listRefunded(f: ListFilters) {
    const page = Math.max(1, f.page || 1);
    const limit = Math.min(200, f.limit || 50);
    const query: any = { status: PaymentStatus.Refunded };
    if (f.shopkeeperId) query.shopkeeperId = new Types.ObjectId(f.shopkeeperId);
    if (f.country) query.country = f.country.toUpperCase();
    const [items, total] = await Promise.all([
      this.paymentModel
        .find(query)
        .populate({ path: "shopkeeperId", select: "name shopName country" })
        .populate({ path: "orderId", select: "orderId totalAmount customerName" })
        .sort({ refundedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.paymentModel.countDocuments(query),
    ]);
    return { items, total, page, limit };
  }

  async releasePayment(paymentId: string, adminId: string, note?: string) {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.transferStatus === TransferStatus.Released) {
      return { alreadyReleased: true, payment };
    }
    if (payment.transferStatus !== TransferStatus.OnHold) {
      throw new BadRequestException(
        `Cannot release: transferStatus is ${payment.transferStatus}`,
      );
    }
    if (!payment.transferId) {
      throw new BadRequestException("Payment has no transferId.");
    }

    const gateway = this.gatewayFactory.forProvider(payment.gateway);
    const result = await gateway.releaseTransfer(payment.transferId);

    payment.transferStatus = TransferStatus.Released;
    payment.releasedAt = new Date();
    payment.releasedBy = new Types.ObjectId(adminId);
    if (note) payment.releaseNote = note;
    await payment.save();

    this.logger.log(
      `Released transfer ${payment.transferId} for payment ${payment._id}`,
    );
    return { released: true, payment, gatewayResult: result };
  }

  async bulkRelease(paymentIds: string[], adminId: string, note?: string) {
    const results: Array<{
      paymentId: string;
      ok: boolean;
      error?: string;
    }> = [];
    for (const id of paymentIds) {
      try {
        await this.releasePayment(id, adminId, note);
        results.push({ paymentId: id, ok: true });
      } catch (err: any) {
        results.push({ paymentId: id, ok: false, error: err.message });
      }
    }
    return {
      total: paymentIds.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async refundPayment(
    paymentId: string,
    adminId: string,
    opts: { amount?: number; reason?: string },
  ) {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.status !== PaymentStatus.Captured) {
      throw new BadRequestException("Only captured payments can be refunded.");
    }
    if (!payment.gatewayPaymentId) {
      throw new BadRequestException("Payment has no gatewayPaymentId.");
    }

    const gateway = this.gatewayFactory.forProvider(payment.gateway);

    // If money is still on hold with the shopkeeper, reverse the transfer
    // first so the funds return to KiosCart's master balance before the
    // refund pulls from there. If already released, the refund will be
    // funded from KiosCart's balance and we'll need to recover separately.
    if (
      payment.transferId &&
      payment.transferStatus === TransferStatus.OnHold
    ) {
      try {
        await gateway.reverseTransfer(payment.transferId, opts.amount);
        payment.transferStatus = TransferStatus.Reversed;
      } catch (err: any) {
        this.logger.error(
          `Reverse transfer ${payment.transferId} failed: ${err.message}`,
        );
        // Continue to refund — the reversal can be retried separately.
      }
    }

    const refund = await gateway.refundPayment({
      gatewayPaymentId: payment.gatewayPaymentId,
      amount: opts.amount,
      notes: { reason: opts.reason || "admin_refund", admin_id: adminId },
    });

    payment.refundId = refund.refundId;
    payment.refundedAt = new Date();
    payment.refundReason = opts.reason;
    payment.status = PaymentStatus.Refunded;
    await payment.save();

    await this.orderModel.findByIdAndUpdate(payment.orderId, {
      paymentStatus: "refunded",
    });

    return { refunded: true, refundId: refund.refundId, payment };
  }
}
