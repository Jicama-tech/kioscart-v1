import { OrderStatus } from "./create-order.dto";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateOrderDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  changedBy?: string; // Track who made the update
}
