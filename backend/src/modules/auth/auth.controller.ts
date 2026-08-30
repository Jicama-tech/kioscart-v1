import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  Res,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LocalDto } from "./dto/local.dto";
import { GoogleAuthGuard } from "./guards/google.guard";
import { InstagramAuthGuard } from "./guards/instagram.guard";
import { Request, Response } from "express";
import { CreateUserDto } from "../users/dto/create-users.dto";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import { AuthGuard } from "@nestjs/passport";
import { RoleService } from "../roles/roles.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import {
  SUPPLIER_FORM_TOKEN_TTL,
  SUPPLIER_FORM_TOKEN_TYPE,
} from "./guards/supplier-form.guard";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";

@Controller("auth")
export class AuthController {
  private readonly frontendUrl: string;

  private readonly allowedOrigins = new Set([
    "https://kioscart.com",
    "https://www.kioscart.com",
    "https://thefoxsg.com",
    "https://www.thefoxsg.com",
    "https://xcionasia.com",
    "https://www.xcionasia.com",
    "http://localhost:8080",
    "http://localhost:8081",
  ]);

  constructor(
    private authService: AuthService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly rolesService: RoleService,
    @InjectModel("Shopkeeper") private readonly shopkeeperModel: Model<any>,
    @InjectModel("Operator") private readonly operatorModel: Model<any>,
  ) {
    this.frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
  }

  /**
   * Extracts the redirect origin from OAuth state parameter.
   * Falls back to FRONTEND_URL if origin is not in the allowed list.
   */
  private getRedirectOrigin(req: Request): string {
    const state = (req.query as any).state || "";
    const origin = decodeURIComponent(state);
    if (origin && this.allowedOrigins.has(origin)) {
      return origin;
    }
    return this.frontendUrl;
  }

  @Post("login")
  async login(@Body() dto: LocalDto) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    if (!user) return { error: "Invalid credentials" };
    return this.authService.login(user);
  }

  @Post("register")
  async register(@Body() createUserDto: CreateUserDto) {
    try {
      const result = await this.usersService.create(createUserDto);
      return result;
    } catch (error) {
      console.error("Registration error:", error);
      throw new InternalServerErrorException(
        "An error occurred during registration.",
      );
    }
  }

  @Get("google")
  @UseGuards(AuthGuard("google"))
  async googleAuth() {
    // This is the initial endpoint to start the Google auth flow.
  }

  @Get("google/redirect")
  @UseGuards(AuthGuard("google"))
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const userFromGoogle = req.user as any;
      if (!userFromGoogle) {
        return res.redirect(`${this.frontendUrl}/login?error=auth_failed`);
        // return res.redirect(`${this.frontendUrl}/login?error=auth_failed`);
      }

      // 1. Check if the user already exists in your database
      let user = await this.usersService.findByEmail(userFromGoogle.email);

      // 2. If the user doesn't exist, create a new one
      if (!user) {
        const createUserDto: CreateUserDto = {
          name: userFromGoogle.name,
          email: userFromGoogle.email,
          password: userFromGoogle.password,
          provider: userFromGoogle.oauthProvider,
          providerId: userFromGoogle.oauthId,
        };
        user = await this.usersService.create(createUserDto);
      }

      // 3. Generate a JWT token
      const payload = {
        name: user.name,
        email: user.email,
        sub: user._id,
        roles: user.roles,
      };
      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "1h",
      });

      // 4. Redirect to the frontend with the token
      // This is the correct line to use!
      return res.redirect(`${this.frontendUrl}/user-dashboard?token=${token}`);

      // return res.redirect(
      //   `${this.frontendUrl}/user-dashboard?token=${token}`
      // );
      // Remove the res.json line
      // res.json({ message: "User logged in successfully", token });
    } catch (error) {
      return res.redirect(`${this.frontendUrl}/login?error=auth_failed`);
      // return res.redirect(`${this.frontendUrl}/login?error=auth_failed`);
    }
  }

  @Get("google-shopkeeper")
  @UseGuards(AuthGuard("google-shopkeeper"))
  async googleShopkeeperAuth() {
    // Initiates Google OAuth for shopkeeper login
  }

  @Get("google-shopkeeper/redirect")
  @UseGuards(AuthGuard("google-shopkeeper"))
  async googleShopkeeperRedirect(@Req() req: Request, @Res() res: Response) {
    // Redirect back to the domain the login was started from (custom domains
    // included, validated against allowedOrigins) — not the fixed FRONTEND_URL.
    const FRONTEND = this.getRedirectOrigin(req);
    try {
      const userFromGoogle = req.user as any;
      if (!userFromGoogle?.email) {
        return res.redirect(`${FRONTEND}/estore/login?error=auth_failed`);
      }
      const email = String(userFromGoogle.email).toLowerCase();
      const name = userFromGoogle.name || "";

      // Case-insensitive match — operator emails aren't normalized, so a
      // plain equality check would silently miss them.
      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const emailRegex = new RegExp(`^${escaped}$`, "i");

      // Gather every shopkeeper + (non-deleted) operator tied to this email.
      const [shopkeepers, operators] = await Promise.all([
        this.shopkeeperModel.find({ email: emailRegex }).lean(),
        this.operatorModel
          .find({ email: emailRegex, isSoftDeleted: { $ne: true } })
          .lean(),
      ]);

      // Resolve parent shopkeepers for any operator hits.
      const parentIds = Array.from(
        new Set(
          operators
            .filter((o: any) => o.shopkeeperId)
            .map((o: any) => String(o.shopkeeperId)),
        ),
      );
      const parentShops = parentIds.length
        ? await this.shopkeeperModel.find({ _id: { $in: parentIds } }).lean()
        : [];
      const parentLookup = new Map<string, any>(
        parentShops.map((p: any) => [String(p._id), p]),
      );

      // Unified account list. Pending shops stay in but flagged approved=false
      // so the picker can grey them out; operators inherit parent approval.
      const accounts: Array<{
        accountId: string;
        accountType: "shopkeeper" | "operator";
        shopName: string;
        approved: boolean;
      }> = [];
      for (const shop of shopkeepers as any[]) {
        accounts.push({
          accountId: String(shop._id),
          accountType: "shopkeeper",
          shopName: shop.shopName || shop.name || "My Shop",
          approved: !!shop.approved && !shop.rejected,
        });
      }
      for (const op of operators as any[]) {
        if (!op.shopkeeperId) continue;
        const parent = parentLookup.get(String(op.shopkeeperId));
        if (!parent) continue;
        accounts.push({
          accountId: String(op._id),
          accountType: "operator",
          shopName: `${parent.shopName || parent.name} (Operator: ${op.name})`,
          approved: !!parent.approved && !parent.rejected,
        });
      }

      // 0 accounts → this Google user isn't a shopkeeper or operator yet.
      // Send them to the registration form (admin-approval gate preserved),
      // prefilling what Google told us.
      if (accounts.length === 0) {
        return res.redirect(
          `${FRONTEND}/estore-register?google=1&email=${encodeURIComponent(
            email,
          )}&name=${encodeURIComponent(name)}`,
        );
      }

      // 1 → direct login (or pending block).
      if (accounts.length === 1) {
        const only = accounts[0];
        if (!only.approved) {
          return res.redirect(`${FRONTEND}/estore/login?error=pending_approval`);
        }
        const token = await this.mintShopkeeperToken(
          only.accountId,
          only.accountType,
        );
        return res.redirect(
          `${FRONTEND}/estore/login?token=${encodeURIComponent(token)}&direct=1`,
        );
      }

      // 2+ → mint short-lived selection token, send user to the picker UI.
      const selToken = this.jwtService.sign(
        { typ: "shopkeeper-select", email, name, accounts },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "5m" } as any,
      );
      return res.redirect(
        `${FRONTEND}/estore/login?selToken=${encodeURIComponent(selToken)}`,
      );
    } catch (error) {
      return res.redirect(`${FRONTEND}/estore/login?error=auth_failed`);
    }
  }

  // Exchange a selection token + chosen account for the real shopkeeper JWT.
  // Used by the multi-account dropdown after Google sign-in.
  @Post("select-shopkeeper-account")
  async selectShopkeeperAccount(
    @Body()
    body: {
      selToken: string;
      accountId: string;
      accountType: "shopkeeper" | "operator";
    },
  ) {
    if (!body?.selToken || !body?.accountId || !body?.accountType) {
      throw new UnauthorizedException("Missing selection payload");
    }
    let payload: any;
    try {
      payload = this.jwtService.verify(body.selToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        "Selection link expired. Please sign in again.",
      );
    }
    if (payload?.typ !== "shopkeeper-select") {
      throw new UnauthorizedException("Invalid selection token");
    }
    const match = (payload.accounts || []).find(
      (a: any) =>
        a.accountId === body.accountId && a.accountType === body.accountType,
    );
    if (!match) {
      throw new UnauthorizedException("Account not in selection list");
    }
    if (!match.approved) {
      throw new ForbiddenException(
        "This account is awaiting approval and cannot be used yet.",
      );
    }
    const token = await this.mintShopkeeperToken(
      body.accountId,
      body.accountType,
    );
    return { token };
  }

  // Mint the dashboard JWT for either a shopkeeper or an operator (which
  // logs in under the parent shopkeeper's identity, with tab restrictions).
  private async mintShopkeeperToken(
    accountId: string,
    accountType: "shopkeeper" | "operator",
  ): Promise<string> {
    if (accountType === "shopkeeper") {
      const shop: any = await this.shopkeeperModel.findById(accountId).lean();
      if (!shop) throw new NotFoundException("Shopkeeper not found");
      return this.jwtService.sign(
        {
          name: shop.name,
          email: shop.email,
          sub: shop._id.toString(),
          country: shop.country,
          shopName: shop.shopName,
          roles: ["shopkeeper"],
        },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "24h" } as any,
      );
    }
    const op: any = await this.operatorModel.findById(accountId).lean();
    if (!op?.shopkeeperId) throw new NotFoundException("Operator not found");
    const parent: any = await this.shopkeeperModel
      .findById(op.shopkeeperId)
      .lean();
    if (!parent) throw new NotFoundException("Parent shop not found");
    return this.jwtService.sign(
      {
        name: op.name,
        email: op.email,
        sub: parent._id.toString(),
        operatorId: op._id.toString(),
        accessTabs: op.accessTabs || [],
        country: parent.country,
        shopName: parent.shopName,
        roles: ["shopkeeper"],
      },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: "24h" } as any,
    );
  }

  // ===== Google Supplier Auth (public supplier quotation form popup) =====
  // Backend-mediated OAuth, ported from eventsh-v1's "google-member" flow.
  // Verifies the supplier's Gmail without creating any account — flow:
  // frontend opens this URL in a popup → Google → /google-supplier/redirect
  // → backend redirects to a frontend-hosted static callback page that
  // postMessages {email, name, picture} back to the opener and closes
  // itself. Living on the frontend origin keeps `window.opener.postMessage`
  // reliable even under strict Cross-Origin-Opener-Policy.
  @Get("google-supplier")
  @UseGuards(AuthGuard("google-supplier"))
  async googleSupplierAuth() {
    // Passport handles the Google consent redirect.
  }

  @Get("google-supplier/redirect")
  @UseGuards(AuthGuard("google-supplier"))
  async googleSupplierRedirect(@Req() req: Request, @Res() res: Response) {
    const user = (req.user as any) || {};
    const email = String(user.email || "").trim().toLowerCase();
    // Proof, for the supplier endpoints, that Google vouched for this
    // address — without it the email is just a string in a URL that anyone
    // could type. Deliberately carries no `sub`, so it is useless against
    // the shopkeeper routes even though the signing secret is shared.
    const supplierToken = email
      ? await this.jwtService.signAsync(
          { typ: SUPPLIER_FORM_TOKEN_TYPE, email },
          {
            secret: process.env.JWT_ACCESS_SECRET,
            expiresIn: SUPPLIER_FORM_TOKEN_TTL,
          } as any,
        )
      : "";
    const params = new URLSearchParams({
      email: user.email || "",
      name: user.name || "",
      picture: user.picture || "",
      token: supplierToken,
    });
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    return res.redirect(
      `${this.frontendUrl}/kioscart-google-supplier-callback?${params.toString()}`,
    );
  }

  // Google OAuth for buyers (cart checkout)
  @Get("google-buyer")
  @UseGuards(AuthGuard("google-buyer"))
  async googleBuyerAuth() {
    // Initiates Google OAuth for buyer login from cart
  }

  @Get("google-buyer/redirect")
  @UseGuards(AuthGuard("google-buyer"))
  async googleBuyerRedirect(@Req() req: Request, @Res() res: Response) {
    // Determine which frontend to redirect to based on Referer or state
    const FRONTEND = this.getRedirectOrigin(req);

    try {
      const userFromGoogle = req.user as any;

      if (!userFromGoogle) {
        return res.redirect(`${FRONTEND}/cart-auth-return?error=auth_failed`);
      }

      // Find or create buyer user
      let user = await this.usersService.findByEmail(userFromGoogle.email);

      if (!user) {
        const createUserDto: CreateUserDto = {
          name: userFromGoogle.name,
          email: userFromGoogle.email,
          password: userFromGoogle.password || "oauth-" + userFromGoogle.oauthId,
          provider: userFromGoogle.oauthProvider,
          providerId: userFromGoogle.oauthId,
          firstName: userFromGoogle.firstName,
          lastName: userFromGoogle.lastName,
        };
        user = await this.usersService.create(createUserDto);
      }

      const payload = {
        name: user.name,
        email: user.email,
        sub: user._id,
        roles: user.roles,
        firstName: user.firstName || userFromGoogle.firstName || "",
        lastName: user.lastName || userFromGoogle.lastName || "",
        whatsAppNumber: user.whatsAppNumber || "",
      };

      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "24h",
      });

      return res.redirect(
        `${FRONTEND}/cart-auth-return?userToken=${encodeURIComponent(token)}`,
      );
    } catch (error) {
      return res.redirect(`${FRONTEND}/cart-auth-return?error=auth_failed`);
    }
  }

  @Get("google-organizer")
  @UseGuards(AuthGuard("google-organizer"))
  async googleOrganizerAuth() {
    // This is the initial endpoint to start the Google auth flow.
  }

  // 1) Start Google flow for SHOPKEEPER
  @Get("google-organizer/redirect")
  @UseGuards(AuthGuard("google-organizer"))
  async googleOrganizerRedirect(@Req() req: Request, @Res() res: Response) {
    try {
      const userFromGoogle = req.user as any;

      if (!userFromGoogle) {
        return res.redirect(
          `${this.frontendUrl}/login?error=auth_failed`,
        );
        // return res.redirect(
        //   `${this.frontendUrl}/organizer/login?error=auth_failed`,
        // );
      }

      // Check if user exists, create if not
      let user = await this.usersService.findByEmail(userFromGoogle.email);

      if (!user) {
        const createUserDto: CreateUserDto = {
          name: userFromGoogle.name,
          email: userFromGoogle.email,
          password:
            userFromGoogle.password || "oauth-" + userFromGoogle.oauthId,
          provider: userFromGoogle.oauthProvider,
          providerId: userFromGoogle.oauthId,
        };
        user = await this.usersService.create(createUserDto);
      }

      // Generate JWT for this user
      const payload = {
        name: user.name,
        email: user.email,
        sub: user._id,
        roles: user.roles,
      };

      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "1h",
      });

      // ✅ IMPORTANT: redirect to eshop-login with token & email
      // Frontend useEffect will detect token in URL params and call check-role API
      return res.redirect(
        `${this.frontendUrl}/estore-dashboard?token=${encodeURIComponent(
          token,
        )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(
          user.name,
        )}`,
      );
      // return res.redirect(
      //   `${this.frontendUrl}/organizer/login?token=${encodeURIComponent(
      //     token,
      //   )}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(
      //     user.name,
      //   )}`,
      // );
    } catch (error) {
      return res.redirect(
        `${this.frontendUrl}/login?error=auth_failed`,
      );
      // return res.redirect(
      //   `${this.frontendUrl}/organizer/login?error=auth_failed`,
      // );
    }
  }

  @Post("check-role") // e.g. /auth/check-role
  @UseGuards(JwtAuthGuard)
  async checkRoleFromAuth(
    @Req() req: any,
    @Body() body: { role: "organizer" | "shopkeeper" },
  ) {
    try {
      const email = req.user.email;
      const name = req.user.name;

      return this.rolesService.checkRoleAvailability1(email, name, body.role);
    } catch (error) {
      console.error("checkRoleFromAuth error:", error);
      throw error;
    }
  }

  @Get("instagram")
  @UseGuards(InstagramAuthGuard)
  async instagramAuth() {}

  @Get("instagram/redirect")
  @UseGuards(InstagramAuthGuard)
  async instagramRedirect(@Req() req: Request, @Res() res: Response) {
    const user = req.user as any;
    if (!user) {
      return res.redirect(`${this.frontendUrl}/login?error=auth_failed`);
    }

    // Check if the user exists based on provider ID, and if not, create them.
    // This is a placeholder for your logic.
    // The correct approach is to call a service method to handle this.
    // const createdUser = await this.authService.findOrCreateSocialUser({
    //   email: user.email,
    //   name: user.name,
    //   provider: "instagram",
    //   providerId: user.providerId,
    // });

    // const result = await this.authService.login(createdUser);
    // return res.redirect(
    //   `${this.frontendUrl}/dashboard?token=${result.token}`
    // );
  }
}
