import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { IntegrationService } from "./integration.service";

/**
 * Authenticates `Authorization: Bearer ksk_...` (or `x-api-key`). On success
 * `req.user` has the same `userId` shape the JWT strategy produces, so the
 * shop is always taken from the key and never from the URL.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly integration: IntegrationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const key = bearer || (req.headers["x-api-key"] as string | undefined);
    if (!key) throw new UnauthorizedException("API key required");

    const shopkeeperId = await this.integration.resolveKey(key.trim());
    if (!shopkeeperId) throw new UnauthorizedException("Invalid API key");

    req.user = { userId: shopkeeperId, roles: ["integration"] };
    return true;
  }
}
