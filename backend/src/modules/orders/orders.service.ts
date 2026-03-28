import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Order, OrderStatus } from "./entities/order.entity";
import { CreateOrderDto } from "./dto/create-order.dto";
import { Product } from "../products/entities/product.entity";
import { User } from "../users/schemas/user.schema";
import {
  ReceiptType,
  Shopkeeper,
} from "../shopkeepers/schemas/shopkeeper.schema";
import { MailService } from "../roles/mail.service";
import axios from "axios";
import * as PDFKit from "pdfkit";
import { v4 as uuidv4 } from "uuid";
import { CreateUserDto } from "../users/dto/create-users.dto";
import { UsersService } from "../users/users.service";
import fontkit from "fontkit";
import * as QRCode from "qrcode";
import { CouponService } from "../coupon/coupon.service";
import { ShopkeeperStoresService } from "../shopkeeper-stores/shopkeeper-stores.service";
import { ShopfrontStore } from "../shopkeeper-stores/entities/shopkeeper-store.entity";
import { UpdateOrderDto } from "./dto/update-order.dto";

function asObjectId(id: string | Types.ObjectId): Types.ObjectId | string {
  // If already an ObjectId
  if (id instanceof Types.ObjectId) return id;
  // If valid string ObjectId
  if (typeof id === "string" && Types.ObjectId.isValid(id))
    return new Types.ObjectId(id);
  // Else keep as string
  return id;
}

@Injectable()
export class OrdersService {
  private printDataStore = new Map<string, { data: any[]; createdAt: number }>();
  private readonly PRINT_DATA_TTL_MS = 10 * 60 * 1000; // 10 minutes
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Shopkeeper.name)
    private readonly shopkeeperModel: Model<Shopkeeper>,
    @InjectModel(ShopfrontStore.name)
    private readonly shopkeeperStoreModel: Model<ShopfrontStore>,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly couponService: CouponService,
    private readonly shopkeeperStoreService: ShopkeeperStoresService,
  ) {}

  private formatPriceByCountry(amount: number, countryCode: string): string {
    if (amount == null) return "0.00";

    const map: Record<
      string,
      { locale: string; currency: string; symbol?: string }
    > = {
      IN: { locale: "en-IN", currency: "INR", symbol: "₹" },
      SG: { locale: "en-SG", currency: "SGD", symbol: "S$" },
      US: { locale: "en-US", currency: "USD" },
      GB: { locale: "en-GB", currency: "GBP" },
    };

    const cfg = map[countryCode] || { locale: "en-US", currency: "USD" };

    const formatted = amount.toLocaleString(cfg.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (cfg.symbol) {
      return `${cfg.symbol}${formatted}`;
    }

    return amount.toLocaleString(cfg.locale, {
      style: "currency",
      currency: cfg.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    try {
      // Step 1. Find or create user by WhatsApp number
      let user = await this.userModel
        .findOne({ whatsAppNumber: dto.whatsAppNumber })
        .exec();

      if (!user) {
        // Create new user if none exists
        const createUserDto: CreateUserDto = {
          name: dto.fullName || "Guest User",
          email: null,
          password: null,
          provider: "whatsapp",
          providerId: null,
          whatsAppNumber: dto.whatsAppNumber,
        };

        user = await this.usersService.create(createUserDto);
      }

      if (dto.items[0].trackQuantity) {
        await this.updateProductInventory(dto.items, "deduct");
      }

      if (dto.couponCode) {
        await this.couponService.incrementUsageCount(dto.couponCode);
      }

      // Step 3. Create order associated with the user
      const order = new this.orderModel({
        ...dto,
        userId: user._id.toString(),
        status: OrderStatus.Pending,
      });

      const savedOrder = await order.save();

      // Send notifications (non-blocking — don't fail the order if notifications fail)
      this.sendOrderCreationNotifications(savedOrder, user, dto).catch(
        (err) =>
          console.error("Order notification failed:", err.message),
      );

      return savedOrder;
    } catch (error) {
      throw new InternalServerErrorException(
        "Failed to create order: " + error.message,
      );
    }
  }

  private async sendOrderCreationNotifications(
    order: any,
    user: any,
    dto: CreateOrderDto,
  ) {
    // Fetch shopkeeper details
    const shopkeeper = await this.shopkeeperModel
      .findById(dto.shopkeeperId)
      .exec();

    const shopkeeperName = shopkeeper?.shopName || "Merchant";
    const shopkeeperCountry = shopkeeper?.country || "IN";
    const formattedAmount = this.formatPriceByCountry(
      order.totalAmount,
      shopkeeperCountry,
    );

    // 1. Email to customer (if email available)
    if (user?.email) {
      try {
        const items = (dto.items || []).map((item) => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price || 0,
        }));
        await this.mailService.sendOrderConfirmationEmail(
          dto.fullName || user.name || "Customer",
          user.email,
          order.orderId,
          formattedAmount,
          shopkeeperName,
          dto.orderType || "pickup",
          items,
        );
      } catch (err) {
        console.error("Order confirmation email failed:", err.message);
      }
    }

    // 2. WhatsApp to customer (if WhatsApp available)
    if (dto.whatsAppNumber && dto.whatsAppNumber !== "kiosk-order") {
      try {
        const customerName = dto.fullName || user?.name || "Customer";
        const message =
          `🛒 Order Received!\n\n` +
          `Hi ${customerName},\n\n` +
          `Your order has been placed successfully!\n\n` +
          `📋 Order ID: ${order.orderId}\n` +
          `💰 Amount: ${formattedAmount}\n` +
          `📦 Items: ${dto.items?.length || 0}\n` +
          `🏪 Merchant: ${shopkeeperName}\n\n` +
          `⏳ Waiting for merchant confirmation.\n` +
          `We'll notify you once your order is confirmed.\n\n` +
          `Thank you! 🙏`;
        await this.sendWhatsAppMessage(dto.whatsAppNumber, message);
      } catch (err) {
        console.error("Order confirmation WhatsApp failed:", err.message);
      }
    }

    // 3. WhatsApp to shopkeeper (new order alert)
    if (shopkeeper?.whatsappNumber) {
      try {
        await this.sendWhatsAppToShopkeeper(
          shopkeeper.whatsappNumber,
          shopkeeperName,
          order.orderId,
          order.totalAmount,
          dto.items?.length || 0,
        );
      } catch (err) {
        console.error("Shopkeeper WhatsApp alert failed:", err.message);
      }
    }
  }

  // WhatsApp chat link generator
  private getWhatsAppLink(rawNumber: string): string {
    const cleaned = rawNumber.replace(/\D/g, "");

    // WhatsApp requires country code
    if (!cleaned.startsWith("91")) {
      return `https://wa.me/91${cleaned}`;
    }

    return `https://wa.me/${cleaned}`;
  }

  async generateReceipt(
    orderId: string,
    receiptType?: string,
  ): Promise<Buffer> {
    const order = await this.orderModel
      .findOne({ _id: orderId })
      .populate("userId")
      .populate("shopkeeperId")
      .lean()
      .exec();

    if (!order) throw new NotFoundException("Order not found");

    const customerDetail: any = order.userId;
    const shopkeeperDetail: any = order.shopkeeperId;

    // Only fetch store detail (not already populated on order)
    const shopkeeperId = shopkeeperDetail._id.toString();
    const shopkeeperStoreDetail = await this.shopkeeperStoreModel
      .findOne({ shopkeeperId })
      .lean()
      .exec();

    const primaryColor = shopkeeperStoreDetail?.settings?.design?.primaryColor;

    const formatToUse = receiptType || "A4";

    if (!shopkeeperDetail) throw new NotFoundException("Shopkeeper Not Found");
    if (!customerDetail) throw new NotFoundException("Customer Not Found");

    // Helper: format date/time similar to frontend
    const formatDate = (d: Date) =>
      new Date(d).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

    const formatTime = (d: Date) =>
      new Date(d).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });

    // Helper: currency formatting - FIXED to always return symbol
    const formatPriceByCountry = (amount: number, countryCode: string) => {
      if (amount == null) return "0.00";

      const map: Record<
        string,
        { locale: string; currency: string; symbol: string }
      > = {
        IN: { locale: "en-IN", currency: "INR", symbol: "Rs." },
        SG: { locale: "en-SG", currency: "SGD", symbol: "SGD." },
        US: { locale: "en-US", currency: "USD", symbol: "USD." },
      };

      const cfg = map[countryCode] || map["US"];
      const formatted = amount.toLocaleString(cfg.locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

      // Always return with symbol - NO OPTIONAL SYMBOL
      return `${cfg.symbol}${formatted}`;
    };

    const countryCode = shopkeeperDetail.country || "IN";

    // Delivery address one line (same as frontend)
    const deliveryAddressLine = order.deliveryAddress
      ? [
          order.deliveryAddress.street,
          order.deliveryAddress.city,
          order.deliveryAddress.state,
        ]
          .filter(Boolean)
          .join(", ")
      : "";

    let storeQrBuffer: Buffer | null = null;
    let storeUrl = "";

    if (shopkeeperStoreDetail?.slug) {
      storeUrl = `https://kioscart.com/estore/${shopkeeperStoreDetail.slug}`;

      storeQrBuffer = await QRCode.toBuffer(storeUrl, {
        type: "png",
        width: 90, // SMALL QR
        margin: 1,
        errorCorrectionLevel: "H",
      });
    }

    // Note: async in Promise constructor is intentional — inner code uses await for PDF generation
    return new Promise(async (resolve, reject) => {
      try {
        if (formatToUse === "58MM") {
          const PDFDocument = (PDFKit as any).default || PDFKit;

          // ========== CALCULATE DYNAMIC HEIGHT ==========
          let contentHeight = 0;

          // Shop info height
          contentHeight += 20; // shop name
          if (shopkeeperDetail.whatsappNumber) contentHeight += 12 + 3;
          if (shopkeeperDetail.businessEmail) contentHeight += 12 + 3;
          if (shopkeeperDetail.GSTNumber) contentHeight += 12 + 3;
          contentHeight += 15; // spacing + separator

          // Order info height
          contentHeight += 13 + 12 + 12 + 15; // order #, date, time + separator

          // Customer info height
          contentHeight += 12 + 12; // "Customer:" + name
          if (customerDetail.whatsAppNumber) contentHeight += 12 + 2;
          if (customerDetail.email) contentHeight += 12 + 2;
          if (order.orderType === "pickup") {
            contentHeight += 12 + 2;
            if (order.pickupDate || order.pickupTime) contentHeight += 12 + 2;
          } else if (order.orderType === "delivery") {
            contentHeight += 12 + 2;
            if (deliveryAddressLine) contentHeight += 12 + 2;
          }
          contentHeight += 15; // separator

          // Items height
          contentHeight += 13; // "Items:" heading
          order.items.forEach((item: any) => {
            contentHeight += 12 + 2; // product name
            if (item.subcategoryName) contentHeight += 11 + 2; // variant
            contentHeight += 11 + 6; // price line + spacing
          });
          contentHeight += 15; // separator

          // Totals height
          if (shopkeeperDetail.taxPercentage) {
            contentHeight += 12 + 12 + 12 + 15; // subtotal + tax + total + separator
          } else {
            contentHeight += 12 + 15; // total + separator
          }

          // Payment info height
          contentHeight += 12 + 12 + 15; // payment + status + separator

          // Footer height
          contentHeight += 12 + 12; // thank you + visit again

          // Add padding
          contentHeight += 20;

          // Minimum height and calculate final size
          const finalHeight = Math.max(contentHeight, 400);

          // ========== CREATE PDF DOCUMENT WITH DYNAMIC HEIGHT ==========
          const doc = new PDFDocument({
            size: [227, finalHeight],
            margins: { top: 10, bottom: 10, left: 10, right: 10 },
          });

          const chunks: Buffer[] = [];
          doc.on("data", (chunk) => chunks.push(chunk));
          doc.on("end", () => resolve(Buffer.concat(chunks)));
          doc.on("error", (error) => reject(error));

          // ========== SHOP INFO (header) ==========
          doc
            .fontSize(16)
            .font("Helvetica-Bold")
            .text(shopkeeperDetail.shopName || "Shop Name", {
              align: "center",
            });

          doc.fontSize(10).font("Helvetica");
          if (shopkeeperDetail.whatsappNumber) {
            doc.text(`Phone: ${shopkeeperDetail.whatsappNumber}`, {
              align: "center",
            });
          }
          if (shopkeeperDetail.businessEmail) {
            doc.text(`Email: ${shopkeeperDetail.businessEmail}`, {
              align: "center",
            });
          }

          if (shopkeeperDetail.GSTNumber) {
            doc.text(`GSTIN: ${shopkeeperDetail.GSTNumber}`, {
              align: "center",
            });
          }

          doc.moveDown(0.2);
          doc
            .fontSize(12)
            .text("---------------------------------------------------", {
              align: "center",
            });

          // ========== ORDER INFO ==========
          doc.moveDown(0.15);
          doc.fontSize(11).font("Helvetica-Bold");
          doc.text(
            `Order #: ${order.orderId?.slice(-6)?.toUpperCase() || "N/A"}`,
            { align: "left" },
          );
          doc.font("Helvetica").fontSize(10);
          doc.text(`Date: ${formatDate(order.createdAt)}`);
          doc.text(`Time: ${formatTime(order.createdAt)}`);

          doc.moveDown(0.2);
          doc
            .fontSize(12)
            .text("---------------------------------------------------", {
              align: "center",
            });

          // ========== CUSTOMER INFO ==========
          doc.moveDown(0.15);
          doc.font("Helvetica-Bold").fontSize(10).text("Customer:");
          doc.font("Helvetica").fontSize(10);
          doc.text(`Name: ${customerDetail.name}`);
          if (customerDetail.whatsAppNumber) {
            doc.text(`Phone: ${customerDetail.whatsAppNumber}`);
          }
          if (customerDetail.email) {
            doc.text(`Email: ${customerDetail.email}`);
          }

          // Pickup / Delivery (match frontend conditions)
          if (order.orderType === "pickup") {
            doc.text(`Order Type: Pickup`);
            if (order.pickupDate || order.pickupTime) {
              const pickDate = order.pickupDate
                ? formatDate(order.pickupDate)
                : "";
              doc.text(`PickUp: ${pickDate} ${order.pickupTime || ""}`.trim());
            }
          } else if (order.orderType === "delivery") {
            doc.text(`Order Type: Delivery`);
            if (deliveryAddressLine) {
              doc.text(`Delivery Address: ${deliveryAddressLine}`);
            }
          }

          doc.moveDown(0.2);
          doc
            .fontSize(12)
            .text("---------------------------------------------------", {
              align: "center",
            });

          // ========== ITEMS ==========
          doc.moveDown(0.15);
          doc.font("Helvetica-Bold").fontSize(11).text("Items:");
          doc.moveDown(0.1);

          let itemTotal = 0;
          let totalafterDiscount = 0;

          order.items.forEach((item: any) => {
            const itemPrice = item.price * item.quantity;
            itemTotal += itemPrice;

            doc.font("Helvetica-Bold").fontSize(10);
            doc.text(item.productName);

            if (item.subcategoryName) {
              doc.font("Helvetica").fontSize(9);
              const variantLabel = item.variantTitle
                ? `, ${item.variantTitle}`
                : "";
              doc.text(`(${item.subcategoryName}${variantLabel})`);
            }

            doc.font("Helvetica").fontSize(9);
            const priceLine = `${item.quantity} x ${formatPriceByCountry(
              item.price,
              countryCode,
            )} = ${formatPriceByCountry(itemPrice, countryCode)}`;
            doc.text(priceLine);
            doc.moveDown(0.15);
          });

          doc.moveDown(0.15);
          doc
            .fontSize(12)
            .text("---------------------------------------------------", {
              align: "center",
            });

          // ========== TOTALS (match frontend tax calc) ==========
          doc.moveDown(0.15);
          doc.font("Helvetica").fontSize(10);

          doc.text(
            `Subtotal: ${formatPriceByCountry(itemTotal, countryCode)}`,
            {
              align: "right",
            },
          );

          if (shopkeeperDetail.discountPercentage) {
            const taxPercent = shopkeeperDetail.discountPercentage;
            // same formula as frontend: tax from tax-inclusive total
            const taxAmount = (taxPercent * itemTotal) / 100;
            totalafterDiscount = itemTotal - taxAmount;

            doc.text(
              `Discount: -${formatPriceByCountry(taxAmount, countryCode)}`,
              {
                align: "right",
              },
            );
          }

          if (order.couponCode) {
            const coupon = await this.couponService.findOne(order.couponCode);
            if (coupon.discountType === "PERCENTAGE") {
              const taxPercent = coupon.discountPercentage;
              const taxAmount = (taxPercent * itemTotal) / 100;
              totalafterDiscount = totalafterDiscount - taxAmount;

              doc.text(
                `Coupon Discount (${coupon.code}): -${formatPriceByCountry(taxAmount, countryCode)}`,
                {
                  align: "right",
                },
              );
            }

            if (coupon.discountType === "FLAT") {
              const taxAmount = order.totalAmount - coupon.flatDiscountAmount;
              totalafterDiscount = totalafterDiscount - taxAmount;

              doc.text(
                `Coupon Discount (${coupon.code}): -${formatPriceByCountry(taxAmount, countryCode)}`,
                {
                  align: "right",
                },
              );
            }
          }

          if (shopkeeperDetail.taxPercentage) {
            const taxPercent = shopkeeperDetail.taxPercentage;
            const taxAmount = (taxPercent * totalafterDiscount) / 100;

            doc.text(`Tax: +${formatPriceByCountry(taxAmount, countryCode)}`, {
              align: "right",
            });
          }

          if (order.orderType === "delivery") {
            const deliveryFee = 30;

            doc.text(
              `Delivery Fees: +${formatPriceByCountry(deliveryFee, countryCode)}`,
              {
                align: "right",
              },
            );
          }

          doc.font("Helvetica-Bold").fontSize(11);
          doc.text(
            `Total: ${formatPriceByCountry(order.totalAmount, countryCode)}`,
            { align: "right" },
          );

          doc.moveDown(0.2);
          doc
            .fontSize(12)
            .text("---------------------------------------------------", {
              align: "center",
            });

          // ========== STATUS NOTES (History) ==========
          if (order.statusHistory && order.statusHistory.length > 0) {
            doc.moveDown(0.5);
            doc
              .font("Helvetica-Bold")
              .fontSize(10)
              .text("Status Updates / Notes:");

            order.statusHistory.forEach((history) => {
              if (history.note) {
                // Only show entries that have actual notes
                doc.font("Helvetica-Oblique").fontSize(9).fillColor("#475569");
                doc.text(`${history.status.toUpperCase()}: ${history.note}`);
              }
            });
            doc.fillColor("#000000"); // Reset color
          }

          doc.moveDown(0.2);
          doc
            .fontSize(12)
            .text("---------------------------------------------------", {
              align: "center",
            });

          // ========== PAYMENT INFO ==========
          doc.moveDown(0.15);
          doc.font("Helvetica").fontSize(10);
          doc.text(`Payment: Online`);
          doc.text(`Status: ${order.status?.toUpperCase() || "PAID"}`);

          doc.moveDown(0.2);
          doc
            .fontSize(12)
            .text("---------------------------------------------------", {
              align: "center",
            });

          let whatsappQRBuffer: Buffer | null = null;
          let instagramQRBuffer: Buffer | null = null;

          if (
            shopkeeperDetail.whatsAppQR &&
            shopkeeperDetail.whatsAppQRNumber
          ) {
            whatsappQRBuffer = await QRCode.toBuffer(
              this.getWhatsAppLink(shopkeeperDetail.whatsAppQRNumber),
              {
                type: "png",
                width: 140,
                margin: 2,
                errorCorrectionLevel: "H",
              },
            );
          }

          if (
            shopkeeperDetail.instagramQR &&
            shopkeeperDetail.instagramHandle
          ) {
            instagramQRBuffer = await QRCode.toBuffer(
              shopkeeperDetail.instagramHandle,
              {
                type: "png",
                width: 140,
                margin: 2,
                errorCorrectionLevel: "H",
              },
            );
          }

          // ========== FOOTER ==========
          doc.moveDown(0.15);
          doc.fontSize(10).font("Helvetica-Bold");
          doc.text("Thank you for your order!", { align: "center" });
          doc.font("Helvetica");
          doc.text("Visit us again!", { align: "center" });

          if (storeQrBuffer) {
            doc.moveDown(0.6);

            doc
              .fontSize(12)
              .text("---------------------------------------------------", {
                align: "center",
              });

            doc.moveDown(0.4);

            doc.font("Helvetica-Bold").fontSize(10);
            doc.text("Visit Our Store", { align: "center" });

            doc.moveDown(0.4);

            const qrSize = 110;
            const centerX = (doc.page.width - qrSize) / 2;
            const y = doc.y;

            doc.image(storeQrBuffer, centerX, y, { width: qrSize });
            doc.y = y + qrSize + 6;

            doc
              .font("Helvetica")
              .fontSize(9)
              .text("Scan to open our online store", { align: "center" });

            doc.moveDown(0.6);
          }

          if (whatsappQRBuffer || instagramQRBuffer) {
            doc.moveDown(0.5);

            doc
              .fontSize(12)
              .text("---------------------------------------------------", {
                align: "center",
              });

            doc.moveDown(0.3);
            doc.font("Helvetica-Bold").fontSize(10);
            doc.text("Connect With Us", { align: "center" });

            doc.moveDown(0.4);

            const qrSize = 70; // ✅ SMALL QR
            const gap = 20;
            const totalWidth =
              (whatsappQRBuffer ? qrSize : 0) +
              (instagramQRBuffer ? qrSize : 0) +
              (whatsappQRBuffer && instagramQRBuffer ? gap : 0);

            const startX = (doc.page.width - totalWidth) / 2;
            const y = doc.y;

            let currentX = startX;

            // WhatsApp QR
            if (whatsappQRBuffer) {
              doc.image(whatsappQRBuffer, currentX, y, { width: qrSize });

              doc
                .font("Helvetica")
                .fontSize(8)
                .text("WhatsApp", currentX, y + qrSize + 4, {
                  width: qrSize,
                  align: "center",
                });

              currentX += qrSize + gap;
            }

            // Instagram QR
            if (instagramQRBuffer) {
              doc.image(instagramQRBuffer, currentX, y, { width: qrSize });

              doc
                .font("Helvetica")
                .fontSize(8)
                .text("Instagram", currentX, y + qrSize + 4, {
                  width: qrSize,
                  align: "center",
                });
            }

            // Move cursor below QR row
            doc.y = y + qrSize + 20;
          }

          doc.end();
        }
        if (formatToUse === "A4") {
          const secondaryColor = "#475569";
          const borderColor = "#E2E8F0";
          const textColor = "#1E293B";

          const PDFDocument = (PDFKit as any).default || PDFKit;

          const doc = new PDFDocument({
            size: "A4",
            margins: { top: 40, bottom: 40, left: 40, right: 40 },
          });

          const chunks: Buffer[] = [];
          doc.on("data", (c) => chunks.push(c));
          doc.on("end", () => resolve(Buffer.concat(chunks)));
          doc.on("error", (e) => reject(e));

          /* ================= 1. HEADER & BRANDING ================= */
          doc.rect(0, 0, 10, 842).fill(primaryColor);

          doc
            .fillColor(primaryColor)
            .font("Helvetica-Bold")
            .fontSize(22)
            .text(shopkeeperDetail.shopName.toUpperCase(), 40, 45);

          doc
            .fontSize(9)
            .fillColor(secondaryColor)
            .font("Helvetica-Oblique")
            .text(
              shopkeeperStoreDetail?.settings?.general?.tagline ||
                "Premium Quality Selection",
              40,
              72,
            );

          doc.rect(400, 40, 160, 40).fill("#F8FAFC");
          doc
            .fillColor(primaryColor)
            .font("Helvetica-Bold")
            .fontSize(24)
            .text("INVOICE", 400, 52, { align: "center", width: 160 });

          /* ================= 2. INFORMATION GRID ================= */
          const gridTop = 115;
          const colWidth = 160;

          // FROM Section
          doc
            .fillColor(textColor)
            .font("Helvetica-Bold")
            .fontSize(10)
            .text("FROM:", 40, gridTop);

          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor(secondaryColor)
            // Specify width and fixed start position
            .text(shopkeeperDetail.shopName, 40, gridTop + 15, {
              width: colWidth,
            })
            .font("Helvetica") // Switch back to regular for address
            .text(shopkeeperDetail.address || "", { width: colWidth })
            .text(`Phone: ${shopkeeperDetail.whatsappNumber}`, {
              width: colWidth,
            })
            .text(`Email: ${shopkeeperDetail.businessEmail || ""}`, {
              width: colWidth,
            })
            .text(`GSTIN: ${shopkeeperDetail.GSTNumber || "N/A"}`, {
              width: colWidth,
            });

          // BILL TO Section
          doc
            .fillColor(textColor)
            .font("Helvetica-Bold")
            .fontSize(10)
            .text("BILL TO:", 220, gridTop);

          doc
            .font("Helvetica-Bold")
            .fontSize(9)
            .fillColor(secondaryColor)
            .text(customerDetail.name, 220, gridTop + 15, { width: colWidth })
            .font("Helvetica")
            .text(`WhatsApp: ${customerDetail.whatsAppNumber || "-"}`, {
              width: colWidth,
            })
            .text(`Email: ${customerDetail.email || "-"}`, { width: colWidth });

          if (order.orderType === "pickup") {
            doc
              .text(`Type: PICKUP`, { width: colWidth })
              .text(
                `Date: ${order.pickupDate ? formatDate(order.pickupDate) : ""} ${order.pickupTime || ""}`,
                { width: colWidth },
              );
          } else {
            doc
              .text(`Type: DELIVERY`, { width: colWidth })
              .text(`Address: ${deliveryAddressLine}`, { width: colWidth });
          }

          // ORDER INFO
          const metaX = 390;
          doc
            .fillColor(textColor)
            .font("Helvetica-Bold")
            .fontSize(10)
            .text("ORDER INFO:", metaX, gridTop);

          const drawOrderRow = (label: string, value: string, y: number) => {
            doc
              .fillColor(secondaryColor)
              .font("Helvetica")
              .fontSize(9)
              .text(label, metaX, y);
            doc
              .fillColor(textColor)
              .font("Helvetica-Bold")
              .text(value, metaX + 75, y, { align: "right", width: 95 });
          };

          drawOrderRow(
            "Invoice ID:",
            order.orderId?.slice(-6)?.toUpperCase() || "N/A",
            gridTop + 18,
          );
          drawOrderRow("Date:", formatDate(order.createdAt), gridTop + 30);
          drawOrderRow("Time:", formatTime(order.createdAt), gridTop + 42);

          doc.rect(metaX + 90, gridTop + 54, 80, 16).fill(primaryColor);
          doc
            .fillColor("#FFFFFF")
            .font("Helvetica-Bold")
            .fontSize(8)
            .text(order.status.toUpperCase(), metaX + 90, gridTop + 59, {
              align: "center",
              width: 80,
            });

          /* ================= 3. ITEMS TABLE ================= */
          /* ================= 3. ITEMS TABLE ================= */
          const tableTop = 235;
          doc.rect(40, tableTop, 520, 25).fill(primaryColor);
          doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
          doc.text("Item Details", 50, tableTop + 9);
          doc.text("Qty", 280, tableTop + 9, { width: 40, align: "center" });
          doc.text("Price", 330, tableTop + 9, { width: 70, align: "right" });
          doc.text("Total", 485, tableTop + 9, { width: 70, align: "right" });

          let yPos = tableTop + 35;
          let itemTotal = 0;

          order.items.forEach((item: any) => {
            const lineTotal =
              (item.discountedPrice || item.price) * item.quantity;
            itemTotal += lineTotal;

            // 1. Calculate the height of the product name to handle wrapping
            const nameHeight = doc.heightOfString(item.productName, {
              width: 220,
            });

            doc
              .fillColor(textColor)
              .font("Helvetica-Bold")
              .fontSize(9)
              .text(item.productName, 50, yPos, { width: 220 });

            doc.font("Helvetica").text(item.quantity.toString(), 280, yPos, {
              width: 40,
              align: "center",
            });

            const unitPrice = item.discountedPrice || item.price;
            doc.text(formatPriceByCountry(unitPrice, countryCode), 330, yPos, {
              width: 70,
              align: "right",
            });

            doc
              .font("Helvetica-Bold")
              .text(formatPriceByCountry(lineTotal, countryCode), 485, yPos, {
                width: 70,
                align: "right",
              });

            // 2. Adjust yPos based on name height
            yPos += nameHeight + 2;

            if (item.subcategoryName) {
              const variantLabel = item.variantTitle
                ? `, ${item.variantTitle}`
                : "";
              const variantText = `(${item.subcategoryName}${variantLabel})`;
              const variantHeight = doc.heightOfString(variantText, {
                width: 220,
              });

              doc
                .fontSize(8)
                .fillColor(secondaryColor)
                .font("Helvetica-Oblique")
                .text(variantText, 50, yPos, { width: 220 });

              yPos += variantHeight + 5;
            } else {
              yPos += 8; // Small gap if no subcategory
            }

            // Draw the separator line
            doc
              .moveTo(40, yPos)
              .lineTo(560, yPos)
              .lineWidth(0.5)
              .strokeColor(borderColor)
              .stroke();

            yPos += 10; // Space before next item
          });

          /* ================= 4. SUMMARY (Now Dynamic) ================= */
          yPos += 5; // Extra padding after the last item line

          // Check if summary will overflow page; if so, move to new page (Optional but recommended)
          if (yPos > 600) {
            doc.addPage();
            yPos = 40;
          }

          let runningTotal = itemTotal;
          const summX = 350;
          const summValX = 475;

          const drawSummary = (
            label: string,
            value: string,
            currY: number,
            isBold = false,
          ) => {
            doc
              .fillColor(isBold ? textColor : secondaryColor)
              .font(isBold ? "Helvetica-Bold" : "Helvetica")
              .fontSize(10)
              .text(label, summX, currY);
            doc.text(value, summValX, currY, { width: 80, align: "right" });
          };

          drawSummary(
            "Subtotal:",
            formatPriceByCountry(itemTotal, countryCode),
            yPos,
          );

          if (shopkeeperDetail.discountPercentage) {
            const discAmt =
              (shopkeeperDetail.discountPercentage * itemTotal) / 100;
            runningTotal -= discAmt;
            yPos += 18;
            drawSummary(
              `Store Discount (${shopkeeperDetail.discountPercentage}%):`,
              `-${formatPriceByCountry(discAmt, countryCode)}`,
              yPos,
            );
          }

          if (order.couponCode) {
            const coupon = await this.couponService.findOne(order.couponCode);
            let couponAmt = 0;
            if (coupon.discountType === "PERCENTAGE") {
              couponAmt = (coupon.discountPercentage * itemTotal) / 100;
            } else {
              couponAmt =
                order.totalAmount -
                (itemTotal -
                  (shopkeeperDetail.discountPercentage
                    ? (shopkeeperDetail.discountPercentage * itemTotal) / 100
                    : 0));
              // Note: Simplified for logic flow, usually matches order.totalAmount calculation
            }
            runningTotal -= couponAmt;
            yPos += 18;
            drawSummary(
              `Coupon (${coupon.code}):`,
              `-${formatPriceByCountry(couponAmt, countryCode)}`,
              yPos,
            );
          }

          if (shopkeeperDetail.taxPercentage) {
            const taxAmt =
              (shopkeeperDetail.taxPercentage * runningTotal) / 100;
            yPos += 18;
            drawSummary(
              `Tax (${shopkeeperDetail.taxPercentage}%):`,
              `+${formatPriceByCountry(taxAmt, countryCode)}`,
              yPos,
            );
          }

          if (order.orderType === "delivery") {
            yPos += 18;
            drawSummary(
              "Delivery Fees:",
              `+${formatPriceByCountry(30, countryCode)}`,
              yPos,
            );
          }

          // Total Box
          yPos += 25;
          doc.rect(summX - 10, yPos - 8, 220, 30).fill(primaryColor);
          doc
            .fillColor("#FFFFFF")
            .font("Helvetica-Bold")
            .fontSize(12)
            .text("TOTAL AMOUNT:", summX, yPos + 2);
          doc.text(
            formatPriceByCountry(order.totalAmount, countryCode),
            summValX,
            yPos + 2,
            { width: 80, align: "right" },
          );

          /* ================= 4.5 STATUS NOTES (History) ================= */
          yPos += 40; // Add spacing after the Total Box

          if (order.statusHistory && order.statusHistory.length > 0) {
            // Check if there are any notes to display
            const historyWithNotes = order.statusHistory.filter(
              (h: any) => h.note,
            );

            if (historyWithNotes.length > 0) {
              // Check for page overflow
              if (yPos > 600) {
                doc.addPage();
                yPos = 40;
              }

              doc
                .fillColor(textColor)
                .font("Helvetica-Bold")
                .fontSize(10)
                .text("STATUS UPDATES / NOTES:", 40, yPos);

              yPos += 15;

              historyWithNotes.forEach((history: any) => {
                const noteText = `${history.status.toUpperCase()}: ${history.note}`;
                const noteHeight = doc.heightOfString(noteText, { width: 520 });

                doc
                  .font("Helvetica-Oblique")
                  .fontSize(9)
                  .fillColor(secondaryColor)
                  .text(noteText, 40, yPos, { width: 520 });

                yPos += noteHeight + 5;
              });
            }
          }

          /* ================= 5. FOOTER & QRs ================= */
          const footerY = 650;
          doc.rect(40, footerY, 520, 1).fill(borderColor);

          // Connect Section
          doc
            .fillColor(textColor)
            .font("Helvetica-Bold")
            .fontSize(10)
            .text("CONNECT WITH US", 40, footerY + 15);

          let qrX = 40;
          if (shopkeeperDetail.whatsAppQR) {
            const wa = await QRCode.toBuffer(
              `https://wa.me/${shopkeeperDetail.whatsAppQRNumber}`,
            );
            doc.image(wa, qrX, footerY + 35, { width: 65 });
            doc
              .fontSize(7)
              .fillColor(secondaryColor)
              .text("WhatsApp", qrX, footerY + 105, {
                width: 65,
                align: "center",
              });
            qrX += 85;
          }

          if (shopkeeperDetail.instagramQR) {
            const insta = await QRCode.toBuffer(
              shopkeeperDetail.instagramHandle,
            );
            doc.image(insta, qrX, footerY + 35, { width: 65 });
            doc.fontSize(7).text("Instagram", qrX, footerY + 105, {
              width: 65,
              align: "center",
            });
            qrX += 85;
          }

          // Store QR (New for A4)
          if (storeQrBuffer) {
            doc.image(storeQrBuffer, 480, footerY + 25, { width: 75 });
            doc.fontSize(7).text("Scan to Shop Online", 480, footerY + 105, {
              width: 75,
              align: "center",
            });
          }

          // T&C
          doc.text(
            "Computer generated invoice. No signature required.",
            220,
            footerY + 47,
          );

          doc
            .fillColor(primaryColor)
            .font("Helvetica-Bold")
            .fontSize(12)
            .text("Thank you for shopping!", 0, 780, {
              align: "center",
              width: 595,
            });

          doc.end();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  async updateOrderStatus(
    orderId: string,
    updateDto: UpdateOrderDto, // Use the DTO
  ): Promise<Order> {
    const { status: newStatus, notes, changedBy } = updateDto;

    try {
      const order = await this.orderModel.findById(orderId);
      if (!order) throw new NotFoundException("Order not found");

      if (order.status === OrderStatus.Cancelled) {
        throw new BadRequestException(
          "Cannot change status of a cancelled order",
        );
      }

      // 1. Prepare the history entry
      const historyEntry = {
        status: newStatus,
        note: notes || "",
        changedAt: new Date(),
        changedBy: changedBy || "System",
      };

      // 2. Update status and push to history
      const updatedOrder = await this.orderModel
        .findByIdAndUpdate(
          orderId,
          {
            $set: { status: newStatus },
            $push: { statusHistory: historyEntry },
          },
          { new: true },
        )
        .populate("userId shopkeeperId");

      // Inventory logic for cancellation
      if (newStatus === OrderStatus.Cancelled) {
        await this.updateProductInventory(updatedOrder.items, "restore");
      }

      await order.save();

      const user = order.userId as any;
      const shopkeeper = order.shopkeeperId as any;

      if (user?.email) {
        await this.mailService.sendOrderStatusEmail(
          user.name,
          user.email,
          order.orderId,
          newStatus !== OrderStatus.Cancelled,
          newStatus,
          order.totalAmount,
          shopkeeper.name || shopkeeper.shopName,
        );
      }

      if (user?.whatsAppNumber && shopkeeper?.whatsappNumber) {
        await this.sendWhatsAppToUser(
          user.whatsAppNumber, // Corrected casing
          user.name,
          order.orderId,
          newStatus !== OrderStatus.Cancelled,
          newStatus,
          shopkeeper.name || shopkeeper.shopName,
          shopkeeper.whatsappNumber, // Corrected casing
        );
      }
      return order;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        "Failed to update order status: " + error.message,
      );
    }
  }

  // Update product inventory
  private async updateProductInventory(
    items: any[],
    action: "deduct" | "restore",
  ) {
    // Collect all unique product IDs and fetch them in a single query
    const uniqueProductIds = [
      ...new Set(items.map((item) => item.productId.toString())),
    ];
    const products = await this.productModel.find({
      _id: { $in: uniqueProductIds },
    });

    // Build a Map for O(1) lookup by product ID
    const productMap = new Map<string, any>();
    for (const product of products) {
      productMap.set(product._id.toString(), product);
    }

    // Validate all products exist before making any changes
    for (const item of items) {
      if (!productMap.has(item.productId.toString())) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
    }

    // Prepare bulk operations
    const bulkOps: any[] = [];

    for (const item of items) {
      const product = productMap.get(item.productId.toString());
      const quantityChange =
        action === "deduct" ? -item.quantity : item.quantity;

      // Check if this is a product with subcategories and variants
      if (item.subcategoryName && item.variantTitle) {
        const subcategory = product.subcategories?.find(
          (sub: any) => sub.name === item.subcategoryName,
        );
        if (!subcategory) {
          throw new NotFoundException(
            `Subcategory '${item.subcategoryName}' not found`,
          );
        }

        const variant = subcategory.variants?.find(
          (v: any) => v.title === item.variantTitle,
        );
        if (!variant) {
          throw new NotFoundException(
            `Variant '${item.variantTitle}' not found`,
          );
        }

        if (action === "deduct" && variant.inventory < item.quantity) {
          throw new InternalServerErrorException(
            `Insufficient stock for ${item.productName}. Available: ${variant.inventory}, Requested: ${item.quantity}`,
          );
        }

        const subcategoryIndex = product.subcategories.findIndex(
          (sub: any) => sub.name === item.subcategoryName,
        );
        const variantIndex = subcategory.variants.findIndex(
          (v: any) => v.title === item.variantTitle,
        );

        // Update in-memory value so subsequent items referencing the same variant see the updated inventory
        variant.inventory += quantityChange;

        bulkOps.push({
          updateOne: {
            filter: { _id: product._id },
            update: {
              $inc: {
                [`subcategories.${subcategoryIndex}.variants.${variantIndex}.inventory`]:
                  quantityChange,
              },
            },
          },
        });
      }
      // Handle products without subcategories (simple products)
      else {
        if (product.trackQuantity) {
          if (action === "deduct" && product.inventory < item.quantity) {
            throw new InternalServerErrorException(
              `Insufficient stock for ${item.productName}. Available: ${product.inventory}, Requested: ${item.quantity}`,
            );
          }

          // Update in-memory value so subsequent items referencing the same product see the updated inventory
          product.inventory += quantityChange;

          bulkOps.push({
            updateOne: {
              filter: { _id: product._id },
              update: { $inc: { inventory: quantityChange } },
            },
          });
        }
      }
    }

    // Execute all updates in a single bulk operation
    if (bulkOps.length > 0) {
      await this.productModel.bulkWrite(bulkOps);
    }
  }

  // WhatsApp to Shopkeeper (New Order)
  private async sendWhatsAppToShopkeeper(
    phone: string,
    shopkeeperName: string,
    orderId: string,
    amount: number,
    itemCount: number,
  ) {
    const message = `🔔 New Order Alert!\n\nHi ${shopkeeperName},\n\nYou received a new order:\n📋 Order ID: ${orderId}\n💰 Amount: ₹${amount.toFixed(
      2,
    )}\n📦 Items: ${itemCount}\n\nPlease confirm or reject the payment in your dashboard.\n\nThank you! 🙏`;
    await this.sendWhatsAppMessage(phone, message);
  }

  // WhatsApp to User (Order Status Update)
  private async sendWhatsAppToUser(
    phone: string,
    userName: string,
    orderId: string,
    accepted: boolean,
    status: string,
    shopkeeperName: string,
    shopkeeperPhone: string,
  ) {
    const statusText = accepted ? "✅ Confirmed" : "❌ Rejected";
    const message = `${statusText} Order Update\n\nHi ${userName},\n\nYour order ${orderId} has been ${
      accepted ? "confirmed" : "rejected"
    } by ${shopkeeperName}.\n\n📋 Current Status: ${status.toUpperCase()}\n\n${
      accepted
        ? "Your order is being processed!"
        : "Please contact the shopkeeper for more details."
    }\n\nThank you! 🙏\n\nContact Shopkeeper: ${shopkeeperPhone}`;
    await this.sendWhatsAppMessage(phone, message);
  }

  // Generic WhatsApp sender using CallMeBot (Free)
  private async sendWhatsAppMessage(phone: string, message: string) {
    try {
      const apiKey = process.env.CALLMEBOT_API_KEY;

      if (!apiKey) {
        throw new InternalServerErrorException(
          "WhatsApp API key not configured.",
        );
      }
      const url = `https://api.callmebot.com/whatsapp.php`;
      const params = {
        phone: phone,
        text: encodeURIComponent(message),
        apikey: apiKey,
      };
      await axios.get(url, { params });
    } catch (error) {
      throw error; // Re-throw to propagate the error
    }
  }

  async getOrderById(orderId: string): Promise<Order> {
    try {
      const order = await this.orderModel
        .findOne({ _id: orderId })
        .populate("userId")
        .populate("shopkeeperId")
        .exec();

      if (!order) throw new NotFoundException("Order not found");
      return order;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        "Failed to get order: " + error.message,
      );
    }
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new NotFoundException("Invalid userId");
      }
      return await this.orderModel
        .find({ userId })
        .populate("shopkeeperId")
        .exec();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        "Failed to get orders by user: " + error.message,
      );
    }
  }

  async getOrdersByShopkeeperId(shopkeeperId: string): Promise<Order[]> {
    try {
      if (!Types.ObjectId.isValid(shopkeeperId)) {
        throw new NotFoundException("Invalid shopkeeperId");
      }
      return await this.orderModel
        .find({ shopkeeperId })
        .populate("userId")
        .sort({ createdAt: -1 })
        .exec();
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException(
        "Failed to get orders by shopkeeper: " + error.message,
      );
    }
  }

  async listAll(): Promise<Order[]> {
    try {
      return await this.orderModel
        .find()
        .populate("userId")
        .populate("shopkeeperId")
        .exec();
    } catch (error) {
      throw new InternalServerErrorException(
        "Failed to list orders: " + error.message,
      );
    }
  }

  async getCustomersWithOrderSummary(shopkeeperId: string) {
    try {
      const customersData = await this.orderModel.aggregate([
        { $match: { shopkeeperId } },
        { $sort: { userId: 1, createdAt: -1 } },

        // Add ObjectId field for lookup
        {
          $addFields: {
            userObjId: { $toObjectId: "$userId" },
          },
        },

        {
          $group: {
            _id: "$userId",
            orders: {
              $push: {
                orderId: "$orderId",
                createdAt: "$createdAt",
                totalAmount: "$totalAmount",
                items: "$items",
                status: "$status",
                orderType: "$orderType",
                deliveryAddress: "$deliveryAddress",
                pickupDate: "$pickupDate",
                pickupTime: "$pickupTime",
              },
            },
            orderCount: { $sum: 1 },
            totalSpent: { $sum: "$totalAmount" },
            userObjId: { $first: "$userObjId" }, // track converted ObjectId
          },
        },

        // Now lookup using converted ObjectId
        {
          $lookup: {
            from: "users",
            localField: "userObjId",
            foreignField: "_id",
            as: "user",
          },
        },

        { $addFields: { user: { $arrayElemAt: ["$user", 0] } } },

        {
          $addFields: {
            avgOrderValue: {
              $cond: [
                { $eq: ["$orderCount", 0] },
                0,
                { $divide: ["$totalSpent", "$orderCount"] },
              ],
            },
          },
        },

        {
          $project: {
            _id: 0,
            userId: "$_id",
            user: {
              userId: "$user._id",
              name: "$user.name",
              email: "$user.email",
              whatsapp: "$user.whatsAppNumber",
            },
            orders: 1,
            orderCount: 1,
            totalSpent: 1,
            avgOrderValue: 1,
          },
        },
      ]);

      return {
        message: "Customers with order summary retrieved successfully",
        data: customersData,
        customerCount: customersData.length,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        "Failed to retrieve customers order summary",
      );
    }
  }

  async deleteOrder(orderId: string) {
    try {
      const order = await this.orderModel.findOne({ orderId: orderId });
      if (!order) {
        throw new NotFoundException("Order Not Found");
      }

      await this.orderModel.deleteOne({ orderId: orderId });
      return { message: "Order Deleted Successfully" };
    } catch (error) {
      throw error;
    }
  }

  async generatePrintReceipt(orderId: string): Promise<any[]> {
    const order = await this.orderModel
      .findOne({ _id: orderId })
      .populate("userId")
      .populate("shopkeeperId")
      .lean();

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const user = await this.userModel.findOne({ _id: order.userId });
    if (!user) {
      throw new NotFoundException("User Not Found");
    }
    const shopkeeper = await this.shopkeeperModel.findOne({
      _id: order.shopkeeperId,
    });

    const countryCode = shopkeeper.country || "IN";

    if (!shopkeeper) {
      throw new NotFoundException("Shopkeeper Not Found");
    }

    const printData = [];

    // Header/Title
    printData.push({
      type: 0,
      content: "ORDER RECEIPT",
      bold: 1,
      align: 1, // center
      format: 2, // double Height + Width
    });

    printData.push({ type: 0, content: " ", bold: 0, align: 0 });

    printData.push({
      type: 0,
      content: `Order ID: ${order._id.toString().slice(-6).toUpperCase()}`,
      bold: 1,
      align: 0,
      format: 0,
    });

    printData.push({
      type: 0,
      content: `Customer: ${user.name}`,
      bold: 0,
      align: 0,
      format: 0,
    });

    if (user.email) {
      printData.push({
        type: 0,
        content: `Email: ${user.email}`,
        bold: 0,
        align: 0,
        format: 0,
      });
    }

    if (user.whatsAppNumber) {
      printData.push({
        type: 0,
        content: `WhatsApp: ${user.whatsAppNumber}`,
        bold: 0,
        align: 0,
        format: 0,
      });
    }

    printData.push({ type: 0, content: " ", bold: 0, align: 0 });

    printData.push({
      type: 0,
      content: "ITEMS:",
      bold: 1,
      align: 0,
      format: 0,
    });
    printData.push({
      type: 0,
      content: "--------------------------------",
      bold: 0,
      align: 0,
      format: 0,
    });

    order.items.forEach((item) => {
      printData.push({
        type: 0,
        content: item.productName,
        bold: 0,
        align: 0,
        format: 0,
      });

      if (item.variantTitle) {
        printData.push({
          type: 0,
          content: `Variant: ${item.variantTitle}`,
          bold: 0,
          align: 0,
          format: 4, // small text
        });
      }

      printData.push({
        type: 0,
        content: `Qty: ${item.quantity} x ${this.formatPriceByCountry(item.price, countryCode)} = ${this.formatPriceByCountry(item.quantity * item.price, countryCode)}`,
        bold: 0,
        align: 0,
        format: 0,
      });

      printData.push({ type: 0, content: " ", bold: 0, align: 0 });
    });

    printData.push({
      type: 0,
      content: "--------------------------------",
      bold: 0,
      align: 0,
      format: 0,
    });

    printData.push({
      type: 0,
      content: `TOTAL: ${this.formatPriceByCountry(order.totalAmount, countryCode)}`,
      bold: 1,
      align: 2, // right align
      format: 1, // double height
    });

    printData.push({ type: 0, content: " ", bold: 0, align: 0 });

    printData.push({
      type: 0,
      content: `Order Type: ${order.orderType.toUpperCase()}`,
      bold: 1,
      align: 0,
      format: 0,
    });

    if (order.orderType === "delivery" && order.deliveryAddress) {
      printData.push({
        type: 0,
        content: "Delivery Address:",
        bold: 0,
        align: 0,
        format: 0,
      });
      printData.push({
        type: 0,
        content: order.deliveryAddress.street,
        bold: 0,
        align: 0,
        format: 0,
      });
      printData.push({
        type: 0,
        content: `${order.deliveryAddress.city}, ${order.deliveryAddress.state}`,
        bold: 0,
        align: 0,
        format: 0,
      });

      if (order.instructions) {
        printData.push({
          type: 0,
          content: `Instructions: ${order.instructions}`,
          bold: 0,
          align: 0,
          format: 0,
        });
      }
    }

    if (order.orderType === "pickup" && order.pickupDate && order.pickupTime) {
      printData.push({
        type: 0,
        content: `Pickup Date: ${new Date(order.pickupDate).toLocaleDateString()}`,
        bold: 0,
        align: 0,
        format: 0,
      });
      printData.push({
        type: 0,
        content: `Pickup Time: ${order.pickupTime}`,
        bold: 0,
        align: 0,
        format: 0,
      });
    }

    printData.push({ type: 0, content: " ", bold: 0, align: 0 });

    printData.push({
      type: 0,
      content: `Order Date: ${new Date(order.createdAt).toLocaleDateString()}`,
      bold: 0,
      align: 1, // center
      format: 4, // small text
    });

    printData.push({
      type: 0,
      content: "Thank you for your business!",
      bold: 1,
      align: 1,
      format: 0,
    });

    return printData;
  }

  private cleanupExpiredPrintData() {
    const now = Date.now();
    for (const [key, entry] of this.printDataStore) {
      if (now - entry.createdAt > this.PRINT_DATA_TTL_MS) {
        this.printDataStore.delete(key);
      }
    }
  }

  async createPrintData(orderId: string, printData: any[]): Promise<string> {
    try {
      // Clean up expired entries before adding new ones
      this.cleanupExpiredPrintData();

      const printId = uuidv4();
      this.printDataStore.set(printId, { data: printData, createdAt: Date.now() });

      return printId;
    } catch (error) {
      throw new InternalServerErrorException("Failed to store print data");
    }
  }

  async getPrintData(printId: string): Promise<any[] | null> {
    try {
      const entry = this.printDataStore.get(printId);
      if (!entry) return null;

      // Check if expired
      if (Date.now() - entry.createdAt > this.PRINT_DATA_TTL_MS) {
        this.printDataStore.delete(printId);
        return null;
      }

      // Remove after retrieval (one-time use)
      this.printDataStore.delete(printId);
      return entry.data;
    } catch (error) {
      throw new InternalServerErrorException("Failed to retrieve print data");
    }
  }

  async getShopkeeperInfo(shopkeeperId: string): Promise<any> {
    try {
      if (!Types.ObjectId.isValid(shopkeeperId)) {
        throw new NotFoundException("Invalid shopkeeper ID");
      }

      const shopkeeper = await this.shopkeeperModel
        .findById(shopkeeperId)
        .lean();

      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper not found");
      }

      return {
        shopName: shopkeeper.shopName,
        name: shopkeeper.name,
        address: shopkeeper.address,
        phone: shopkeeper.whatsappNumber,
        businessEmail: shopkeeper.businessEmail,
        taxPercentage: shopkeeper.taxPercentage || 0,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException("Failed to get shopkeeper info");
    }
  }

  async generateThermalPrintData(orderId: string): Promise<any[]> {
    try {
      const order = await this.orderModel
        .findById(orderId)
        .populate("userId")
        .populate("shopkeeperId")
        .lean();

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const user = await this.userModel.findById(order.userId).lean();
      const shopkeeper = await this.shopkeeperModel
        .findById(order.shopkeeperId)
        .lean();

      if (!user || !shopkeeper) {
        throw new NotFoundException("User or shopkeeper not found");
      }

      const printData: any[] = [];

      // Store Header
      printData.push({
        type: 0,
        content: shopkeeper.shopName || "Your Store",
        bold: 1,
        align: 1,
        format: 2,
      });

      // Store Info
      if (shopkeeper.address) {
        printData.push({
          type: 0,
          content: shopkeeper.address,
          bold: 0,
          align: 1,
          format: 4,
        });
      }

      if (shopkeeper.whatsappNumber) {
        printData.push({
          type: 0,
          content: `Tel: ${shopkeeper.whatsappNumber}`,
          bold: 0,
          align: 1,
          format: 4,
        });
      }

      // Separator line
      printData.push({
        type: 0,
        content: "================================",
        bold: 0,
        align: 1,
        format: 4,
      });

      // Receipt title
      printData.push({
        type: 0,
        content: "ORDER RECEIPT",
        bold: 1,
        align: 1,
        format: 3,
      });

      // Order details
      printData.push({
        type: 0,
        content: `Order #: ${order._id.toString().slice(-6).toUpperCase()}`,
        bold: 1,
        align: 0,
        format: 0,
      });

      printData.push({
        type: 0,
        content: `Date: ${new Date(order.createdAt).toLocaleDateString()}`,
        bold: 0,
        align: 0,
        format: 0,
      });

      printData.push({
        type: 0,
        content: `Time: ${new Date(order.createdAt).toLocaleTimeString()}`,
        bold: 0,
        align: 0,
        format: 0,
      });

      // Customer info
      printData.push({
        type: 0,
        content: "--------------------------------",
        bold: 0,
        align: 0,
        format: 4,
      });

      printData.push({
        type: 0,
        content: `Customer: ${user.name}`,
        bold: 1,
        align: 0,
        format: 0,
      });

      printData.push({
        type: 0,
        content: `Email: ${user.email}`,
        bold: 0,
        align: 0,
        format: 4,
      });

      if (user.whatsAppNumber) {
        printData.push({
          type: 0,
          content: `Phone: ${user.whatsAppNumber}`,
          bold: 0,
          align: 0,
          format: 4,
        });
      }

      // Order type and delivery details
      printData.push({
        type: 0,
        content: `Type: ${order.orderType.toUpperCase()}`,
        bold: 1,
        align: 0,
        format: 0,
      });

      if (order.orderType === "delivery" && order.deliveryAddress) {
        printData.push({
          type: 0,
          content: "Delivery Address:",
          bold: 1,
          align: 0,
          format: 0,
        });

        printData.push({
          type: 0,
          content: order.deliveryAddress.street,
          bold: 0,
          align: 0,
          format: 4,
        });

        printData.push({
          type: 0,
          content: `${order.deliveryAddress.city}, ${order.deliveryAddress.state}`,
          bold: 0,
          align: 0,
          format: 4,
        });

        if (order.instructions) {
          printData.push({
            type: 0,
            content: `Notes: ${order.instructions}`,
            bold: 0,
            align: 0,
            format: 4,
          });
        }
      }

      if (order.orderType === "pickup" && order.pickupDate) {
        printData.push({
          type: 0,
          content: `Pickup Date: ${new Date(order.pickupDate).toLocaleDateString()}`,
          bold: 0,
          align: 0,
          format: 0,
        });

        if (order.pickupTime) {
          printData.push({
            type: 0,
            content: `Pickup Time: ${order.pickupTime}`,
            bold: 0,
            align: 0,
            format: 0,
          });
        }
      }

      // Items header
      printData.push({
        type: 0,
        content: "================================",
        bold: 0,
        align: 0,
        format: 4,
      });

      printData.push({
        type: 0,
        content: "ITEMS ORDERED",
        bold: 1,
        align: 1,
        format: 3,
      });

      printData.push({
        type: 0,
        content: "--------------------------------",
        bold: 0,
        align: 0,
        format: 4,
      });

      // Items list
      order.items.forEach((item: any) => {
        printData.push({
          type: 0,
          content: item.productName,
          bold: 1,
          align: 0,
          format: 0,
        });

        if (item.subcategoryName) {
          printData.push({
            type: 0,
            content: `Category: ${item.subcategoryName}`,
            bold: 0,
            align: 0,
            format: 4,
          });
        }

        if (item.variantTitle) {
          printData.push({
            type: 0,
            content: `Variant: ${item.variantTitle}`,
            bold: 0,
            align: 0,
            format: 4,
          });
        }

        printData.push({
          type: 0,
          content: `Qty: ${item.quantity} x $${item.price.toFixed(2)} = $${(item.quantity * item.price).toFixed(2)}`,
          bold: 0,
          align: 0,
          format: 0,
        });

        // Empty line between items
        printData.push({
          type: 0,
          content: " ",
          bold: 0,
          align: 0,
          format: 4,
        });
      });

      // Total section
      printData.push({
        type: 0,
        content: "================================",
        bold: 0,
        align: 0,
        format: 4,
      });

      const subtotal = order.items.reduce(
        (sum: number, item: any) => sum + item.quantity * item.price,
        0,
      );
      const tax = order.totalAmount - subtotal;
      const discount = (subtotal * shopkeeper.discountPercentage) / 100;

      printData.push({
        type: 0,
        content: `Subtotal: $${subtotal.toFixed(2)}`,
        bold: 0,
        align: 2,
        format: 0,
      });

      if (tax > 0) {
        printData.push({
          type: 0,
          content: `Tax: $${tax.toFixed(2)}`,
          bold: 0,
          align: 2,
          format: 0,
        });
      }

      printData.push({
        type: 0,
        content: `TOTAL: $${order.totalAmount.toFixed(2)}`,
        bold: 1,
        align: 2,
        format: 1,
      });

      // Status
      printData.push({
        type: 0,
        content: "--------------------------------",
        bold: 0,
        align: 0,
        format: 4,
      });

      printData.push({
        type: 0,
        content: `Status: ${order.status.toString().toUpperCase()}`,
        bold: 1,
        align: 1,
        format: 0,
      });

      // QR Code for order tracking (optional)
      printData.push({
        type: 3,
        value: `Order: ${order._id.toString().slice(-6).toUpperCase()}`,
        size: 40,
        align: 1,
      });

      // Footer
      printData.push({
        type: 0,
        content: " ",
        bold: 0,
        align: 0,
        format: 4,
      });

      printData.push({
        type: 0,
        content: "Thank you for your order!",
        bold: 1,
        align: 1,
        format: 0,
      });

      printData.push({
        type: 0,
        content: "Visit us again!",
        bold: 0,
        align: 1,
        format: 4,
      });

      return printData;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        "Failed to generate thermal print data",
      );
    }
  }

  async getCouponAppliedStatus(userId: string, couponCode: string) {
    try {
      const order = await this.orderModel.findOne({
        userId,
        couponCode,
      });

      if (!order) {
        return { message: "Coupon not applied yet", applied: false };
      }
      return { message: "Coupon is Already Applied", applied: true };
    } catch (error) {
      throw new InternalServerErrorException(
        "Failed to check coupon applied status",
      );
    }
  }
}
