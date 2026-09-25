import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Operator,
  OperatorDocument,
} from "../../modules/operators/entities/operator.entity";
import { TABS_KEY } from "./tabs.decorator";

type RequestUser = {
  userId?: string;
  operatorId?: string;
  accessTabs?: string[];
};

/** How a tab is named in the refusal, so the message says what was refused. */
const TAB_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
};

/**
 * Enforces operator access tabs on the API.
 *
 * Until now `accessTabs` was only a display rule: the dashboard used it to hide
 * sidebar items, and nothing on the server checked it. That is not
 * authorization — an operator could take the token out of their own browser and
 * call anything the owner can. This guard makes the tab a real permission on
 * the routes that declare one with @Tabs().
 *
 * OWNERS ARE EXEMPT, and that is not a loophole: only operator-minted tokens
 * carry an `operatorId` (see AuthController.mintShopkeeperToken). An owner's
 * token has none, and requiring tabs of owners would lock them out of their own
 * shop.
 *
 * THE OPERATOR RECORD IS RE-READ on every request instead of trusting the
 * `accessTabs` claim, because that claim is a snapshot taken at login and the
 * token lives for 24 hours. When an owner takes a tab away — or deletes the
 * operator — they expect it to stop working now, not tomorrow. It is one
 * indexed lookup on routes that are called rarely.
 *
 * A route with no @Tabs() is not restricted by this guard, so it is safe to
 * apply at controller level.
 */
@Injectable()
export class TabsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Operator.name)
    private readonly operatorModel: Model<OperatorDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(TABS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: RequestUser }>();
    const user = request.user;
    const refusal = new ForbiddenException(
      `Your account does not have access to ${describeTabs(required)}.`,
    );

    // No identity at all means the route was wired without the JWT guard in
    // front of this one. Failing closed keeps that mistake from quietly
    // opening a tab-restricted route to the world.
    if (!user?.userId) throw refusal;

    // Owners: see the note above.
    if (!user.operatorId) return true;

    if (!Types.ObjectId.isValid(String(user.operatorId))) throw refusal;
    const operator = await this.operatorModel
      .findById(String(user.operatorId))
      .select("accessTabs isSoftDeleted shopkeeperId")
      .lean();

    // The shop check matters as much as the tab check: an operator record that
    // has been moved to, or belongs to, another shop grants nothing here.
    if (
      !operator ||
      operator.isSoftDeleted ||
      String(operator.shopkeeperId || "") !== String(user.userId)
    ) {
      throw refusal;
    }

    const held = Array.isArray(operator.accessTabs) ? operator.accessTabs : [];
    if (!required.some((tab) => held.includes(tab))) throw refusal;
    return true;
  }
}

function describeTabs(tabs: string[]): string {
  const names = tabs.map((t) => TAB_NAMES[t]).filter(Boolean);
  return names.length ? names.join(" or ") : "that section";
}
