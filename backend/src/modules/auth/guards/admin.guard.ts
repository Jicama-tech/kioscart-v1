// auth/guards/admin.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

/**
 * Verifies a JWT AND requires the caller to carry the "admin" role.
 * Admin tokens are minted with roles: ["admin"] (see admin.service login);
 * shopkeeper/organizer/buyer tokens carry their own roles, so they are
 * rejected with 403 even though their token is otherwise valid.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException("No token found");
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    request.user = payload;

    // roles may be an array (["admin"]) or, defensively, a single string.
    const roles = Array.isArray(payload?.roles)
      ? payload.roles
      : payload?.roles
        ? [payload.roles]
        : [];
    const isAdmin = roles.some(
      (r: any) => String(r).toLowerCase() === "admin",
    );
    if (!isAdmin) {
      throw new ForbiddenException("Admin access required");
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;
    const [type, token] = authHeader.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
