import {
  Controller,
  Get,
  Req,
  UseGuards,
  Res,
  InternalServerErrorException,
  ConflictException,
  Body,
  Post,
  Param,
  BadRequestException,
  ForbiddenException,
  Query,
  Patch,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request, Response } from "express";
import { UsersService } from "./users.service";
import { JwtService } from "@nestjs/jwt";
import { CreateUserDto } from "./dto/create-users.dto";
import { TabsGuard } from "../../common/tabs/tabs.guard";
import { Tabs } from "../../common/tabs/tabs.decorator";

@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * The three CRM routes below (fetch/create/update-user-by-shopkeeper) take
   * the shop id from the URL, and shop ids are public — they sit in storefront
   * and cart links — so a valid token alone proves nothing. The shop in the URL
   * has to be the caller's own. Unguarded, anyone could download a shop's
   * customer list with phone numbers, or rename any user in the database.
   *
   * The JWT subject is always the owning shopkeeper: an operator token is
   * minted with the parent owner's id (auth.controller mintShopkeeperToken),
   * so operators pass their owner's checks without a separate branch. A
   * buyer's token carries the buyer's own user id, which never equals a shop
   * id, so it is refused here too.
   *
   * Platform admins are let through so support can repair a shop's customer
   * records, the same convention as ShopkeepersController.isSelfOrAdmin.
   *
   * Passing as the shop is not the whole answer for operators, though: their
   * token carries the owner's id, so the check above lets every operator in.
   * TabsGuard adds the owner's per-operator choice — the `crm` tab, the same
   * one the campaign routes require for the same customer numbers — so an
   * operator kept out of the CRM cannot read or repoint customers' numbers
   * (which a later campaign would then message).
   */
  private isSelfOrAdmin(req: any, shopkeeperId: string): boolean {
    const roles = Array.isArray(req?.user?.roles) ? req.user.roles : [];
    if (roles.some((r: any) => String(r).toLowerCase() === "admin")) return true;

    const callerId = String(req?.user?.userId || req?.user?.sub || "");
    return !!callerId && callerId === String(shopkeeperId);
  }

  private assertSelfOrAdmin(req: any, shopkeeperId: string) {
    if (!this.isSelfOrAdmin(req, shopkeeperId)) {
      throw new ForbiddenException("Not your shop");
    }
  }

  @Get("google")
  @UseGuards(AuthGuard("google"))
  async googleAuth(@Req() req: Request) {
    // Passport will handle the redirect. No code needed here.
  }

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const userFromGoogle = req.user as any;
      if (!userFromGoogle) {
        return res.redirect("http://localhost:8080/login?error=auth_failed");
      }

      let user = await this.usersService.findByProviderId(
        userFromGoogle.providerId,
        userFromGoogle.provider,
      );

      if (!user) {
        const createUserDto: CreateUserDto = {
          name: userFromGoogle.name,
          email: userFromGoogle.email,
          password: userFromGoogle.password,
          provider: userFromGoogle.provider,
          providerId: userFromGoogle.providerId,
        };
        user = await this.usersService.create(createUserDto);
      }

      const payload = { email: user.email, sub: user._id, roles: user.roles };
      const token = this.jwtService.sign(payload);
      return res.redirect(`http://localhost:8080/user-dashboard?token=${token}`);
    } catch (error) {
      return res.redirect("http://localhost:8080/login?error=auth_failed");
    }
  }

  @Get("verify/:email")
  async verifyEmail(@Param("email") email: string) {
    try {
      return await this.usersService.findByEmail(email);
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  @Post("register")
  async register(@Body() createUserDto: CreateUserDto) {
    try {
      const existingUser = await this.usersService.findByEmail(
        createUserDto.email,
      );
      if (existingUser) {
        throw new ConflictException("User with this email already exists.");
      }
      // Never the caller's provider/providerId — see AuthController.register:
      // { provider: "Shopkeeper", providerId } would make this user one of
      // any shop's campaign audience.
      return await this.usersService.create({
        ...createUserDto,
        provider: undefined,
        providerId: undefined,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        "An error occurred during registration.",
      );
    }
  }

  @Get("get-user-by-whatsAppNumber/:whatsAppNumber")
  async getUserByWhatsAppNumber(
    @Param("whatsAppNumber") whatsAppNumber: string,
  ) {
    try {
      return await this.usersService.fetchUserByWhatsAppNumber(whatsAppNumber);
    } catch (error) {
      throw error;
    }
  }

  /**
   * NEW: Email verification for cart
   */
  @Post("verify-email-for-cart")
  async verifyEmailForCart(
    @Body() body: { email: string; whatsAppNumber?: string },
  ) {
    try {
      if (!body.email) {
        throw new BadRequestException("Please provide email");
      }
      return await this.usersService.verifyEmailForCart(
        body.email,
        body.whatsAppNumber || "",
      );
    } catch (error) {
      console.error("Email verification error:", error);
      throw error;
    }
  }

  /**
   * NEW: Send WhatsApp OTP
   */
  @Post("send-whatsapp-otp")
  async sendWhatsAppOtp(@Body() body: { whatsAppNumber: string }) {
    try {
      if (!body.whatsAppNumber) {
        throw new BadRequestException("userId and whatsAppNumber are required");
      }
      return await this.usersService.sendWhatsAppOtp(body.whatsAppNumber);
    } catch (error) {
      console.error("WhatsApp OTP send error:", error);
      throw error;
    }
  }

  /**
   * NEW: Verify WhatsApp OTP
   */
  @Post("verify-whatsapp-otp")
  async verifyWhatsAppOtp(
    @Body()
    body: {
      // userId: string;
      whatsAppNumber: string;
      otp: string;
      fullName: string;
    },
  ) {
    try {
      if (!body.whatsAppNumber || !body.otp) {
        throw new BadRequestException(
          "userId, whatsAppNumber, and otp are required",
        );
      }
      return await this.usersService.verifyWhatsAppOtp(
        body.fullName,
        body.whatsAppNumber,
        body.otp,
      );
    } catch (error) {
      console.error("WhatsApp OTP verification error:", error);
      throw error;
    }
  }

  @Get("reverse")
  async reverseGeocode(@Query("lat") lat: string, @Query("lng") lng: string) {
    const apiKey = process.env.GEOAPIFY_KEY; // or any provider key
    console.log(apiKey, "apiKey");
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Reverse geocoding failed");
    }
    const json = await res.json();

    const props = json.features?.[0]?.properties;
    return {
      country: props?.country,
      state: props?.state || props?.state_code,
      city: props?.city || props?.town || props?.village,
      postcode: props?.postcode,
      fullAddress: props?.formatted,
    };
  }

  /**
   * NEW: Check WhatsApp verification status
   */
  // @Get("whatsapp-status/:userId")
  // async checkWhatsAppStatus(@Param("userId") userId: string) {
  //   try {
  //     if (!userId) {
  //       throw new BadRequestException("userId is required");
  //     }
  //     return await this.usersService.checkWhatsAppStatus(userId);
  //   } catch (error) {
  //     console.error("WhatsApp status check error:", error);
  //     throw error;
  //   }
  // }
  @Post("get-by-email")
  async getProfile(@Body() email: string) {
    try {
      return await this.usersService.findByEmail(email);
    } catch (error) {
      throw error;
    }
  }

  @Get("get-user-By-id/:id")
  async getUserById(@Param("id") id: string) {
    try {
      return await this.usersService.findById(id);
    } catch (error) {
      throw error;
    }
  }

  // Called by the CRM "Add customer" form and the assistant's inline customer
  // form (ChatbotWidget); both send the shop's own token — hence either tab.
  @Post("create-user-by-shopkeeper/:shopkeeperId")
  @UseGuards(AuthGuard("jwt"), TabsGuard)
  @Tabs("crm", "chat")
  async createUserByShopkeeper(
    @Body() createUserDto: CreateUserDto,
    @Param("shopkeeperId") shopkeeperId: string,
    @Req() req: any,
  ) {
    this.assertSelfOrAdmin(req, shopkeeperId);
    try {
      return await this.usersService.createUserByShopkeeper(
        createUserDto,
        shopkeeperId,
      );
    } catch (error) {
      throw error;
    }
  }

  // Owning the shop is not enough here: the user id is a second, independent
  // URL parameter, so the service also refuses (403) a user who is not one of
  // this shop's customers.
  @Patch("update-user-by-shopkeeper/:shopkeeperId/:userId")
  @UseGuards(AuthGuard("jwt"), TabsGuard)
  @Tabs("crm")
  async updateUserByShopkeeper(
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("userId") userId: string,
    @Body() updateUserDto: CreateUserDto,
    @Req() req: any,
  ) {
    this.assertSelfOrAdmin(req, shopkeeperId);
    try {
      return await this.usersService.updateUserByShopkeeper(
        userId,
        updateUserDto,
        shopkeeperId,
      );
    } catch (error) {
      throw error;
    }
  }

  @Get("fetch-users-by-shopkeeper/:shopkeeperId")
  @UseGuards(AuthGuard("jwt"), TabsGuard)
  @Tabs("crm")
  async fetchUsersByShopkeeperId(
    @Param("shopkeeperId") shopkeeperId: string,
    @Req() req: any,
  ) {
    this.assertSelfOrAdmin(req, shopkeeperId);
    try {
      return await this.usersService.fetchUsersByShopkeeperId(shopkeeperId);
    } catch (error) {
      throw error;
    }
  }
}
