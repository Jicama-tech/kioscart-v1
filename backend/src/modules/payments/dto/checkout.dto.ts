import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  IsObject,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CreateOrderDto } from "../../orders/dto/create-order.dto";

/**
 * Lazy-creation Razorpay flow: customer hits "Pay with Razorpay", frontend
 * posts THIS dto. We create a Razorpay order + stash the full cart in a
 * CheckoutIntent — but we do NOT touch the Orders or Payments collections
 * until payment captures. Empty cart? Customer abandons? Intent TTL-expires
 * and the DB stays clean.
 */
export class InitiateRazorpayPaymentDto {
  // The pre-generated shopslug-order-xxx — also stored on the intent so
  // receipts/UI have a stable reference before the Order doc exists.
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  shopkeeperId: string;

  @IsArray()
  items: any[];

  @IsNumber()
  @Min(1)
  totalAmount: number;

  @IsString()
  @IsNotEmpty()
  orderType: string; // "pickup" | "delivery"

  @IsOptional()
  @IsObject()
  deliveryAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  @IsOptional()
  pickupDate?: string;

  @IsOptional()
  @IsString()
  pickupTime?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsString()
  @IsNotEmpty()
  customerWhatsApp: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  currency?: "INR" | "SGD";
}

export class CreatePaymentOrderDto {
  @IsString()
  @IsNotEmpty()
  shopkeeperId: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: "INR" | "SGD";

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  // Full cart payload. The Order is NOT created here — only after Razorpay
  // confirms capture. This is the snapshot we'll materialize from.
  @IsObject()
  @ValidateNested()
  @Type(() => CreateOrderDto)
  order: CreateOrderDto;
}

export class VerifyPaymentDto {
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string;

  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string;

  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}
