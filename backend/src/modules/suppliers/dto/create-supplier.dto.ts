import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

/**
 * Shopkeeper-side create of a Supplier identity (the "Add Supplier" form).
 * The supplier persists across products; per-product quotations are separate
 * (SupplierRequest).
 */
export class CreateSupplierDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  // "Service provided" — free-text category (packaging, ingredients, …).
  @IsOptional()
  @IsString()
  serviceCategory?: string;

  // Personal / login email (the Gmail the supplier signs in with).
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  whatsAppNumber?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
