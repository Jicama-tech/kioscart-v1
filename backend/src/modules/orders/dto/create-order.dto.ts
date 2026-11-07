import {
  IsString,
  IsMongoId,
  IsArray,
  IsNumber,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsDateString,
  ValidateIf,
  IsObject,
  IsBoolean,
  Matches,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

export enum OrderStatus {
  Pending = "pending",
  Processing = "processing",
  Ready = "ready",
  Shipped = "shipped",
  Cancelled = "cancelled",
  Completed = "completed",
}

export enum OrderType {
  Delivery = "delivery",
  Pickup = "pickup",
}

class AddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;

  @IsString()
  state: string;

  zip: string;
}

class OrderItemDto {
  @IsString()
  productId: string;

  @IsString()
  productName: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  variantTitle?: string;

  @IsOptional()
  @IsString()
  subcategoryName?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsBoolean()
  trackQuantity: boolean;

  @IsOptional()
  @IsString()
  optionTitle?: string;

  @IsOptional()
  @IsNumber()
  optionPrice?: number;

  // a one-off line that is not in the catalog (no product to look up, no stock to deduct)
  @IsOptional()
  @IsBoolean()
  custom?: boolean;
}

export class CreateOrderDto {
  @IsString()
  orderId: string;

  @IsOptional()
  @IsMongoId()
  userId?: string; // now optional, will be filled automatically when found or created

  @IsMongoId()
  shopkeeperId: string;

  @IsArray()
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsNumber()
  totalAmount: number;

  @IsEnum(OrderType)
  orderType: OrderType;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  deliveryAddress?: AddressDto;

  @IsOptional()
  pickupDate?: string;

  // The day the order was really made, when it is entered afterwards (a kiosk sale written up later): YYYY-MM-DD, not in the
  // future. Left out, the order is dated now.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "orderDate must be a date as YYYY-MM-DD" })
  orderDate?: string;

  @IsOptional()
  pickupTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  instructions?: string;

  // new field for WhatsApp-based identity
  @IsString()
  whatsAppNumber: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // Kiosk order placed for a company: the customer name is the company name and WhatsApp is optional.
  @IsOptional()
  @IsBoolean()
  isCompanyOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentConfirmed?: boolean;

  @IsOptional()
  @IsString()
  transactionId?: string;

  // Where the order was taken. Only the shop's own kiosk says so; other sources (e.g. "integration") are set by the server.
  @IsOptional()
  @IsIn(["kiosk"])
  source?: "kiosk";
}
