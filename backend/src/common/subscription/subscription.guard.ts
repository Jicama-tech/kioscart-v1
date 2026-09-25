import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRES_FEATURE_KEY } from "./requires-feature.decorator";
import { SubscriptionAccessService } from "./subscription-access.service";

/**
 * Blocks a request whose route needs a plan feature the caller does not have.
 *
 * Runs after the JWT guard, so `req.user` is already populated. On an
 * operator-minted token `userId` is the parent owner's id (see JwtStrategy),
 * which is exactly what we want — an operator inherits the shop's plan rather
 * than having one of their own.
 *
 * Routes without @RequiresFeature pass straight through, so this is safe to
 * apply broadly; it only ever acts where a feature was named.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: SubscriptionAccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRES_FEATURE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest();
    const shopkeeperId = req.user?.userId;
    // No identity means no plan to read. Authentication is another guard's
    // job — refusing here rather than allowing keeps an unauthenticated route
    // from quietly bypassing the paywall if someone forgets @UseGuards(Jwt).
    if (!shopkeeperId) {
      throw new ForbiddenException(
        "Subscription could not be verified for this request",
      );
    }

    for (const feature of required) {
      const ok = await this.access.isEnabled(shopkeeperId, feature);
      if (!ok) {
        throw new ForbiddenException({
          statusCode: 403,
          error: "FeatureNotInPlan",
          feature,
          message: `Your current plan does not include this feature. Upgrade your plan to continue.`,
        });
      }
    }
    return true;
  }
}
