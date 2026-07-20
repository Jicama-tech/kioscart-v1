import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateOperatorDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Optional — operators sign in with Google (email), not WhatsApp OTP.
  @IsString()
  @IsOptional()
  whatsAppNumber?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  shopkeeperId?: string;

  @IsString()
  @IsOptional()
  organizerId?: string;

  @IsArray()
  @IsOptional()
  accessTabs?: string[];
}
