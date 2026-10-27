import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { IsArray, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { CART_KEY_PATTERN, StorefrontCartsService } from "./storefront-carts.service";

class SaveStorefrontCartDto {
  @Matches(CART_KEY_PATTERN)
  cartKey: string;

  @IsString()
  @IsNotEmpty()
  shopkeeperId: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  customerWhatsApp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsArray()
  items: any[];
}

/**
 * Public storefront endpoints (no login: guests shop too). A cart is only saved once we can reach the customer
 * (WhatsApp number or email), and is reached again only with its random cart key.
 */
@Controller("storefront-carts")
export class StorefrontCartsController {
  constructor(private readonly carts: StorefrontCartsService) {}

  @Post()
  @HttpCode(200)
  save(@Body() dto: SaveStorefrontCartDto) {
    return this.carts.save(dto);
  }

  @Get(":cartKey")
  restore(@Param("cartKey") cartKey: string) {
    return this.carts.restore(cartKey);
  }
}
