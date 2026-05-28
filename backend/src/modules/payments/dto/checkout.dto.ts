import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsObject,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { CreateOrderDto } from "../../orders/dto/create-order.dto";

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
