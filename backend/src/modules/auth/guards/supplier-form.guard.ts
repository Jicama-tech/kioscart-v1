import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

/**
 * Marks a token as belonging to the public supplier quotation form rather
 * than to a kioscart account. Carried in `typ` so a supplier token can never
 * be replayed against the shopkeeper endpoints: those read `sub`, which this
 * token deliberately never sets.
 */
export const SUPPLIER_FORM_TOKEN_TYPE = "supplier-form";

/** How long a supplier stays signed in on the form after the Google popup. */
export const SUPPLIER_FORM_TOKEN_TTL = "2h";

/**
 * Guards the supplier-facing half of the quotation form.
 *
 * Google verifies the supplier's Gmail in a popup, but the verified email
 * used to travel onward as a bare URL segment — so knowing a supplier's
 * address plus a product or shop id was enough to read their quotation, and
 * to approve or reject on their behalf. The callback now mints a short-lived
 * signed token for that address; this guard verifies it and hands the email
 * it vouches for to the controller, which checks it matches the record being
 * touched.
 */
@Injectable()
export class SupplierFormGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException(
        "Sign in with Google to continue.",
      );
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        "Your sign-in has expired. Please sign in with Google again.",
      );
    }

    if (payload?.typ !== SUPPLIER_FORM_TOKEN_TYPE || !payload?.email) {
      throw new UnauthorizedException("Sign in with Google to continue.");
    }

    // The one thing this guard establishes: which address Google vouched for.
    (request as any).supplierEmail = String(payload.email).trim().toLowerCase();
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
