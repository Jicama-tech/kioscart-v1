import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * What a chat integration may send when it places an order for a customer. There is deliberately no price, total,
 * delivery fee or discount field: the server prices everything from the shop's own data (integration-pricing.ts), and
 * the global ValidationPipe rejects any unknown field, so a price sent by a caller is an error, not a suggestion.
 */
/** A line is either a catalog product (productId) or a custom line, never both. */
@ValidatorConstraint({ name: "noProductWithCustom", async: false })
export class NoProductWithCustom implements ValidatorConstraintInterface {
  validate(_value: unknown, args: { object: any }) {
    return args.object.productId === undefined || args.object.productId === null;
  }
  defaultMessage() {
    return "a line is either a product (productId) or a custom line (custom), not both";
  }
}

/** A one-off line for something that is not in the catalog; only this carries a price from the caller. */
export class IntegrationCustomLineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subcategoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variantTitle?: string;

  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999)
  unitPrice: number;
}

export class IntegrationOrderItemDto {
  // required for a catalog product; a custom line has no productId
  @ValidateIf((o) => o.custom === undefined || o.custom === null || o.productId !== undefined)
  @IsMongoId()
  productId?: string;

  // set instead of productId for a one-off line that is not in the catalog
  @ValidateIf((o) => o.custom !== undefined && o.custom !== null)
  @IsDefined()
  @ValidateNested()
  @Type(() => IntegrationCustomLineDto)
  @Validate(NoProductWithCustom)
  custom?: IntegrationCustomLineDto;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  optionTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  subcategoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variantTitle?: string;
}

export class IntegrationCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  // International format; spaces, dashes and brackets are tolerated and removed.
  @IsString()
  @Matches(/^\+?[\d\s\-().]{8,20}$/, { message: "whatsAppNumber must be a phone number with country code" })
  whatsAppNumber: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class IntegrationAddressDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  street: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  zip?: string;
}

/** POST /integration/v1/orders/quote — what would this basket cost? Nothing is created. */
export class IntegrationQuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => IntegrationOrderItemDto)
  items: IntegrationOrderItemDto[];

  @IsOptional()
  @IsIn(["delivery", "pickup"])
  orderType?: "delivery" | "pickup";
}

/**
 * POST /integration/v1/payment-requests — a kiosk pickup sale paid by QR (PayNow / UPI): "Payment pending" until the
 * customer (on the payment link) or the kiosk confirms the payment; only then is the order placed.
 */
export class IntegrationPaymentRequestDto extends IntegrationQuoteDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => IntegrationCustomerDto)
  customer: IntegrationCustomerDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // The caller's own id for this sale. Repeating it returns the same payment; the order placed gets it as integrationRef.
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  externalRef: string;
}

/** POST /integration/v1/orders — place the order. */
export class IntegrationCreateOrderDto extends IntegrationQuoteDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => IntegrationCustomerDto)
  customer: IntegrationCustomerDto;

  @ValidateIf((o) => (o.orderType || "delivery") === "delivery")
  @IsDefined({ message: "deliveryAddress is required for delivery orders" })
  @ValidateNested()
  @Type(() => IntegrationAddressDto)
  deliveryAddress?: IntegrationAddressDto;

  // cod = pay on delivery / at pickup; online = pay through a payment link sent in the chat;
  // cash = already paid in cash at the counter (ComBox self-kiosk mode)
  @IsIn(["cod", "online", "cash"])
  paymentMethod: "cod" | "online" | "cash";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  // The caller's own id for this request (e.g. the chat message id). Repeating it returns the same order.
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(80)
  externalRef?: string;
}
