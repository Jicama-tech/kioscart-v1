import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  BadRequestException,
  ForbiddenException,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { ShopkeeperAnalyticsService } from "./shopkeeper-analytics-report.service";
import { ReportPeriod } from "./dto/analytics-report.dto";
import { AuthGuard } from "@nestjs/passport";
import { SubscriptionGuard } from "../../common/subscription/subscription.guard";
import { RequiresFeature } from "../../common/subscription/requires-feature.decorator";

/**
 * ShopkeeperAnalyticsController
 * Handles all analytics and reporting endpoints for shopkeepers
 *
 * All endpoints require JWT authentication
 * Supports Monthly, Quarterly, and Yearly reports
 * Includes data export to Excel format
 */
@Controller("shopkeeper/analytics")
// The docblock above always claimed these endpoints were authenticated; until
// now nothing enforced it, so any caller could read another shop's revenue by
// guessing an id. The JWT guard makes the claim true and the subscription
// guard puts the reports behind the plan feature that sells them.
@UseGuards(AuthGuard("jwt"), SubscriptionGuard)
@RequiresFeature("analytics")
export class ShopkeeperAnalyticsController {
  constructor(private readonly analyticsService: ShopkeeperAnalyticsService) {}

  /**
   * Every route below is keyed on a :shopkeeperId taken from the URL, and the
   * guards above only prove the caller is signed in and that *their own* plan
   * sells analytics — neither says the id is theirs. Without this check any
   * shopkeeper could read another shop's revenue, customers and P&L by
   * editing the id in the URL.
   *
   * The identity comes from `userId` (not `sub`) because these routes use the
   * passport strategy, which maps sub -> userId (see auth/strategies/
   * jwt.strategy.ts). On an operator-minted token that is still the parent
   * owner's id, so operators pass their owner's check — same rule the
   * SubscriptionGuard already uses to bill an operator against the shop.
   *
   * No admin escape hatch: admins have their own module, and the sibling
   * lockdown in suppliers.controller.ts made the shop-scoped routes owner-only.
   */
  private assertOwnShop(req: any, shopkeeperId: string) {
    const callerId = String(req?.user?.userId || req?.user?.sub || "");
    if (!callerId || callerId !== String(shopkeeperId)) {
      throw new ForbiddenException("Not your shop");
    }
  }

  /**
   * Generate complete analytics report (Monthly, Quarterly, Yearly)
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/report/:period
   *
   * Params:
   * - shopkeeperId: string - The ID of the shopkeeper
   * - period: string - Report period (monthly, quarterly, yearly)
   *
   * Returns: Complete analytics report with all metrics and data
   *
   * Example:
   * GET /shopkeeper/analytics/123/report/monthly
   *
   * Response:
   * {
   *   "success": true,
   *   "message": "MONTHLY Analytics Report Generated",
   *   "data": { ... full report ... },
   *   "timestamp": "2025-12-29T19:30:00Z"
   * }
   */
  @Get(":shopkeeperId/report/:period")
  @HttpCode(HttpStatus.OK)
  async getAnalyticsReport(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string
  ) {
    this.assertOwnShop(req, shopkeeperId);

    // Validate period parameter
    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      throw new BadRequestException(
        `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`
      );
    }

    // Generate the complete analytics report
    const report = await this.analyticsService.generateAnalyticsReport(
      shopkeeperId,
      period as ReportPeriod
    );

    return {
      success: true,
      message: `${period.toUpperCase()} Analytics Report Generated`,
      data: report,
      timestamp: new Date(),
    };
  }

  /**
   * Get quick summary dashboard data
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/quick-summary
   *
   * Query Parameters:
   * - days: number (optional) - Number of days to include (default: 30)
   *
   * Returns: Lightweight summary with key metrics
   *
   * Example:
   * GET /shopkeeper/analytics/123/quick-summary?days=7
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "totalRevenue": 50000,
   *     "totalOrders": 125,
   *     "topProducts": [...],
   *     "revenueTrend": [...]
   *   },
   *   "timestamp": "2025-12-29T19:30:00Z"
   * }
   */
  @Get(":shopkeeperId/quick-summary")
  @HttpCode(HttpStatus.OK)
  async getQuickSummary(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Query("days") days?: number
  ) {
    this.assertOwnShop(req, shopkeeperId);

    // Use default of 30 days if not specified
    const lookbackDays = days || 30;

    // Validate days parameter
    if (lookbackDays < 1 || lookbackDays > 365) {
      throw new BadRequestException("Days parameter must be between 1 and 365");
    }

    // Get quick summary
    const summary = await this.analyticsService.getQuickSummary(shopkeeperId);

    return {
      success: true,
      data: summary,
      timestamp: new Date(),
    };
  }

  /**
   * Export analytics report to Excel
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/export/excel/:period
   *
   * Params:
   * - shopkeeperId: string - The ID of the shopkeeper
   * - period: string - Report period (monthly, quarterly, yearly)
   *
   * Returns: Excel file ready for download
   *
   * File Structure:
   * - Sheet 1: Summary Metrics
   * - Sheet 2: Detailed Orders
   * - Sheet 3: Product Performance
   * - Sheet 4: Customer Insights
   * - Sheet 5: Revenue Trend
   * - Sheet 6: Order Type Breakdown
   *
   * Example:
   * GET /shopkeeper/analytics/123/export/excel/monthly
   *
   * Headers:
   * Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   * Content-Disposition: attachment; filename="analytics_monthly_123.xlsx"
   */
  @Get(":shopkeeperId/export/excel/:period")
  @RequiresFeature("analytics", "analyticsExport")
  @HttpCode(HttpStatus.OK)
  async exportToExcel(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string,
    @Res() res: Response
  ) {
    // Thrown, not written to `res`, because nothing has been sent yet — Nest's
    // exception filter still owns the response until the export starts.
    this.assertOwnShop(req, shopkeeperId);

    // Validate period parameter
    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`,
        timestamp: new Date(),
      });
    }

    try {
      // Call service to generate and send Excel file
      await this.analyticsService.exportToExcel(
        shopkeeperId,
        period as ReportPeriod,
        res
      );
    } catch (error) {
      console.error("Excel export error:", error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message || "Failed to generate Excel report",
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get detailed orders for report
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/orders/:period
   *
   * Params:
   * - shopkeeperId: string - The ID of the shopkeeper
   * - period: string - Report period (monthly, quarterly, yearly)
   *
   * Returns: All orders with customer details and items
   *
   * Example:
   * GET /shopkeeper/analytics/123/orders/monthly
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "period": "monthly",
   *     "dateRange": { "start": "2025-12-01", "end": "2025-12-29" },
   *     "totalOrders": 125,
   *     "currency": "INR",
   *     "currencySymbol": "₹",
   *     "orders": [
   *       {
   *         "orderId": "ORD-123",
   *         "orderDate": "2025-12-15",
   *         "customerName": "John Doe",
   *         "customerEmail": "john@example.com",
   *         "whatsappNumber": "+91-9876543210",
   *         "totalPrice": 1500,
   *         "orderType": "delivery",
   *         "status": "completed",
   *         "items": [...]
   *       }
   *     ]
   *   },
   *   "timestamp": "2025-12-29T19:30:00Z"
   * }
   */
  @Get(":shopkeeperId/orders/:period")
  @HttpCode(HttpStatus.OK)
  async getDetailedOrders(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string
  ) {
    this.assertOwnShop(req, shopkeeperId);

    // Validate period parameter
    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      throw new BadRequestException(
        `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`
      );
    }

    // Generate full report to extract orders data
    const report = await this.analyticsService.generateAnalyticsReport(
      shopkeeperId,
      period as ReportPeriod
    );

    return {
      success: true,
      data: {
        period: report.period,
        dateRange: {
          start: report.startDate,
          end: report.endDate,
        },
        totalOrders: report.totalOrders,
        currency: report.currency,
        currencySymbol: report.currencySymbol,
        orders: report.orders,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Get product performance metrics
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/products/:period
   *
   * Params:
   * - shopkeeperId: string - The ID of the shopkeeper
   * - period: string - Report period (monthly, quarterly, yearly)
   *
   * Returns: Top and bottom performing products with variant breakdown
   *
   * Example:
   * GET /shopkeeper/analytics/123/products/monthly
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "period": "monthly",
   *     "dateRange": { "start": "2025-12-01", "end": "2025-12-29" },
   *     "currency": "INR",
   *     "currencySymbol": "₹",
   *     "totalRevenue": 50000,
   *     "topProducts": [
   *       {
   *         "productName": "Laptop",
   *         "totalQuantity": 25,
   *         "totalRevenue": 750000,
   *         "percentage": 45.5,
   *         "rank": 1,
   *         "variants": [
   *           { "variantTitle": "Red", "quantity": 15, "revenue": 450000, "percentage": 60 },
   *           { "variantTitle": "Blue", "quantity": 10, "revenue": 300000, "percentage": 40 }
   *         ]
   *       }
   *     ],
   *     "bottomProducts": [...],
   *     "categoryBreakdown": { "Electronics": { "count": 50, "revenue": 100000, "percentage": 33.3 } }
   *   },
   *   "timestamp": "2025-12-29T19:30:00Z"
   * }
   */
  @Get(":shopkeeperId/products/:period")
  @HttpCode(HttpStatus.OK)
  async getProductPerformance(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string
  ) {
    this.assertOwnShop(req, shopkeeperId);

    // Validate period parameter
    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      throw new BadRequestException(
        `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`
      );
    }

    // Generate full report to extract product data
    const report = await this.analyticsService.generateAnalyticsReport(
      shopkeeperId,
      period as ReportPeriod
    );

    return {
      success: true,
      data: {
        period: report.period,
        dateRange: {
          start: report.startDate,
          end: report.endDate,
        },
        currency: report.currency,
        currencySymbol: report.currencySymbol,
        totalRevenue: report.totalRevenue,
        topProducts: report.topProducts,
        bottomProducts: report.bottomProducts,
        categoryBreakdown: report.categoryPerformance,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Get customer insights and analytics
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/customers/:period
   *
   * Params:
   * - shopkeeperId: string - The ID of the shopkeeper
   * - period: string - Report period (monthly, quarterly, yearly)
   *
   * Returns: Top customers, inactive customers, repeat rates, and customer segments
   *
   * Example:
   * GET /shopkeeper/analytics/123/customers/monthly
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "period": "monthly",
   *     "dateRange": { "start": "2025-12-01", "end": "2025-12-29" },
   *     "currency": "INR",
   *     "currencySymbol": "₹",
   *     "totalCustomers": 98,
   *     "repeatCustomerRate": 35.5,
   *     "conversionRate": 12.8,
   *     "topCustomers": [
   *       {
   *         "customerName": "Raj Kumar",
   *         "email": "raj@example.com",
   *         "whatsappNumber": "+91-9876543210",
   *         "totalOrders": 12,
   *         "totalSpent": 45000,
   *         "avgOrderValue": 3750,
   *         "lastOrderDate": "2025-12-28",
   *         "daysSinceLastOrder": 1,
   *         "orderFrequency": "high"
   *       }
   *     ],
   *     "inactiveCustomers": [
   *       {
   *         "customerName": "Priya Singh",
   *         "email": "priya@example.com",
   *         "totalOrders": 2,
   *         "totalSpent": 5000,
   *         "lastOrderDate": "2025-10-15",
   *         "daysSinceLastOrder": 75
   *       }
   *     ]
   *   },
   *   "timestamp": "2025-12-29T19:30:00Z"
   * }
   */
  @Get(":shopkeeperId/customers/:period")
  @HttpCode(HttpStatus.OK)
  async getCustomerInsights(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string
  ) {
    this.assertOwnShop(req, shopkeeperId);

    // Validate period parameter
    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      throw new BadRequestException(
        `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`
      );
    }

    // Generate full report to extract customer data
    const report = await this.analyticsService.generateAnalyticsReport(
      shopkeeperId,
      period as ReportPeriod
    );

    return {
      success: true,
      data: {
        period: report.period,
        dateRange: {
          start: report.startDate,
          end: report.endDate,
        },
        currency: report.currency,
        currencySymbol: report.currencySymbol,
        totalCustomers: report.totalCustomers,
        repeatCustomerRate: report.repeatCustomerRate,
        conversionRate: report.conversionRate,
        topCustomers: report.topCustomers,
        inactiveCustomers: report.inactiveCustomers,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Get revenue trends and breakdowns
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/trends/:period
   *
   * Params:
   * - shopkeeperId: string - The ID of the shopkeeper
   * - period: string - Report period (monthly, quarterly, yearly)
   *
   * Returns: Daily revenue trends, order type breakdown, order status breakdown
   *
   * Example:
   * GET /shopkeeper/analytics/123/trends/monthly
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "period": "monthly",
   *     "dateRange": { "start": "2025-12-01", "end": "2025-12-29" },
   *     "currency": "INR",
   *     "currencySymbol": "₹",
   *     "summary": {
   *       "totalRevenue": 50000,
   *       "totalOrders": 125,
   *       "avgOrderValue": 400
   *     },
   *     "revenueTrend": [
   *       { "date": "2025-12-01", "revenue": 1500, "orders": 5 },
   *       { "date": "2025-12-02", "revenue": 2000, "orders": 7 }
   *     ],
   *     "orderTypeBreakdown": [
   *       { "type": "delivery", "count": 90, "percentage": 72, "revenue": 36000 },
   *       { "type": "pickup", "count": 35, "percentage": 28, "revenue": 14000 }
   *     ],
   *     "orderStatusBreakdown": [
   *       { "status": "completed", "count": 120, "percentage": 96, "revenue": 48000 },
   *       { "status": "pending", "count": 5, "percentage": 4, "revenue": 2000 }
   *     ]
   *   },
   *   "timestamp": "2025-12-29T19:30:00Z"
   * }
   */
  @Get(":shopkeeperId/trends/:period")
  @HttpCode(HttpStatus.OK)
  async getRevenueTrends(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string
  ) {
    this.assertOwnShop(req, shopkeeperId);

    // Validate period parameter
    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      throw new BadRequestException(
        `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`
      );
    }

    // Generate full report to extract trends data
    const report = await this.analyticsService.generateAnalyticsReport(
      shopkeeperId,
      period as ReportPeriod
    );

    return {
      success: true,
      data: {
        period: report.period,
        dateRange: {
          start: report.startDate,
          end: report.endDate,
        },
        currency: report.currency,
        currencySymbol: report.currencySymbol,
        summary: {
          totalRevenue: report.totalRevenue,
          totalOrders: report.totalOrders,
          avgOrderValue: report.avgOrderValue,
        },
        revenueTrend: report.revenueTrend,
        orderTypeBreakdown: report.orderTypeBreakdown,
        orderStatusBreakdown: report.orderStatusBreakdown,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Get all summary metrics
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/summary/:period
   *
   * Params:
   * - shopkeeperId: string - The ID of the shopkeeper
   * - period: string - Report period (monthly, quarterly, yearly)
   *
   * Returns: Comprehensive summary metrics for specified period
   *
   * Example:
   * GET /shopkeeper/analytics/123/summary/monthly
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "shopName": "My Shop",
   *     "country": "India",
   *     "currency": "INR",
   *     "currencySymbol": "₹",
   *     "period": "monthly",
   *     "dateRange": { "start": "2025-12-01", "end": "2025-12-29" },
   *     "metrics": {
   *       "revenue": { "total": 50000, "avg": 400 },
   *       "orders": { "total": 125, "avgItems": 2.5 },
   *       "customers": {
   *         "total": 98,
   *         "repeatRate": 35.5,
   *         "conversionRate": 12.8
   *       },
   *       "items": { "total": 312, "avgPerOrder": 2.5 }
   *     },
   *     "generatedAt": "2025-12-29T19:30:00Z"
   *   },
   *   "timestamp": "2025-12-29T19:30:00Z"
   * }
   */
  @Get(":shopkeeperId/summary/:period")
  @HttpCode(HttpStatus.OK)
  async getSummaryMetrics(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string
  ) {
    this.assertOwnShop(req, shopkeeperId);

    // Validate period parameter
    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      throw new BadRequestException(
        `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`
      );
    }

    // Generate full report to extract summary metrics
    const report = await this.analyticsService.generateAnalyticsReport(
      shopkeeperId,
      period as ReportPeriod
    );

    return {
      success: true,
      data: {
        shopName: report.shopName,
        country: report.country,
        currency: report.currency,
        currencySymbol: report.currencySymbol,
        period: report.period,
        dateRange: {
          start: report.startDate,
          end: report.endDate,
        },
        metrics: {
          revenue: {
            total: report.totalRevenue,
            avg: report.avgOrderValue,
          },
          orders: {
            total: report.totalOrders,
            avgItems: report.avgItemsPerOrder,
          },
          customers: {
            total: report.totalCustomers,
            repeatRate: report.repeatCustomerRate,
            conversionRate: report.conversionRate,
          },
          items: {
            total: report.totalItems,
            avgPerOrder: report.avgItemsPerOrder,
          },
        },
        generatedAt: report.generatedAt,
      },
      timestamp: new Date(),
    };
  }

  /**
   * Profit & Loss report for a given period — revenue (from orders) minus
   * approved expenses, broken down by category.
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/pnl/:period
   */
  @Get(":shopkeeperId/pnl/:period")
  @RequiresFeature("analytics", "pnlReport")
  @HttpCode(HttpStatus.OK)
  async getPnLReport(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string,
  ) {
    this.assertOwnShop(req, shopkeeperId);

    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      throw new BadRequestException(
        `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`,
      );
    }

    const report = await this.analyticsService.generatePnLReport(
      shopkeeperId,
      period as ReportPeriod,
    );

    return { success: true, data: report, timestamp: new Date() };
  }

  /**
   * Download the P&L report as a PDF.
   *
   * Endpoint: GET /shopkeeper/analytics/:shopkeeperId/pnl/export/pdf/:period
   */
  @Get(":shopkeeperId/pnl/export/pdf/:period")
  @RequiresFeature("analytics", "pnlReport", "analyticsExport")
  @HttpCode(HttpStatus.OK)
  async exportPnLPdf(
    @Req() req: any,
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("period") period: string,
    @Res() res: Response,
  ) {
    this.assertOwnShop(req, shopkeeperId);

    if (!Object.values(ReportPeriod).includes(period as ReportPeriod)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        error: `Invalid period. Use: ${Object.values(ReportPeriod).join(", ")}`,
        timestamp: new Date(),
      });
    }

    try {
      await this.analyticsService.exportPnLPdf(shopkeeperId, period as ReportPeriod, res);
    } catch (error) {
      console.error("P&L PDF export error:", error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error.message || "Failed to generate P&L PDF",
        timestamp: new Date(),
      });
    }
  }
}
