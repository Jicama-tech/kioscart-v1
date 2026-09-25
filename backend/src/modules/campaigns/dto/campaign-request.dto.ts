import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

/**
 * A campaign as the composer describes it — used for both the preview and
 * the real send, so what was previewed is what is sent.
 *
 * Deliberately carries NO names and NO phone numbers. The audience is only
 * ever a list of customer ids, and the server looks each one up and checks
 * it belongs to the shop; a browser that could post numbers here could use
 * the shop's WhatsApp to message anyone.
 *
 * Exactly one of `customerIds` / `allCustomers` must be given; that rule
 * spans two fields, so the service enforces it.
 */
export class CampaignRequestDto {
  @IsString()
  @Length(1, 3000)
  @Matches(/\S/, { message: "Write a message first." })
  template: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsMongoId({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsBoolean()
  allCustomers?: boolean;

  // "" is what a cleared product picker tends to send; it means "none".
  @Transform(({ value }) => (value === "" ? undefined : value))
  @IsOptional()
  @IsMongoId()
  productId?: string;

  // Variant ids are numbers on the product; accepted as either and compared
  // as strings, so the composer need not care which it holds.
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === "number" ? String(v) : v))
      : value,
  )
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  variantIds?: string[];

  @IsOptional()
  @IsBoolean()
  attachProductImage?: boolean;

  @IsOptional()
  @IsBoolean()
  includePriceList?: boolean;
}
