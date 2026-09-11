import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Shopkeeper } from "../../modules/shopkeepers/schemas/shopkeeper.schema";
import { Plan } from "../../modules/plans/entities/plan.entity";

type ModuleMap = Record<string, { enabled?: boolean; limit?: number }>;

interface CachedAccess {
  modules: ModuleMap;
  /** False once the plan is past expiry AND past its grace window. */
  active: boolean;
  expiresAt: number;
}

/**
 * How long a resolved plan is reused before hitting Mongo again.
 *
 * Every guarded request would otherwise cost two extra queries (shopkeeper,
 * then plan) on a document that changes maybe monthly. Thirty seconds keeps
 * a plan change visible almost immediately while removing essentially all of
 * the per-request cost.
 */
const CACHE_TTL_MS = 30_000;

/** Matches getSubscription(): expiry plus a seven-day grace window. */
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SubscriptionAccessService {
  private cache = new Map<string, CachedAccess>();

  constructor(
    @InjectModel(Shopkeeper.name)
    private readonly shopModel: Model<Shopkeeper>,
    @InjectModel(Plan.name) private readonly planModel: Model<Plan>,
  ) {}

  /** Drops a shopkeeper's cached plan; call after a plan change. */
  invalidate(shopkeeperId: string) {
    this.cache.delete(String(shopkeeperId));
  }

  /**
   * Drops every cached plan. Used when a Plan document itself is edited: the
   * cache is keyed by shopkeeper, so there is no cheap way to find just the
   * shopkeepers sitting on that plan, and a plan edit is rare enough that
   * rebuilding the whole (small) map costs nothing.
   */
  invalidateAll() {
    this.cache.clear();
  }

  private async load(shopkeeperId: string): Promise<CachedAccess> {
    const id = String(shopkeeperId);
    const hit = this.cache.get(id);
    if (hit && hit.expiresAt > Date.now()) return hit;

    const shopkeeper = await this.shopModel
      .findById(id)
      .select("subscribed planId planExpiryDate")
      .lean();

    let resolved: CachedAccess;
    if (!shopkeeper?.subscribed || !shopkeeper?.planId) {
      // No plan at all. Everything stays open, matching the dashboard: this
      // codebase has always treated "unsubscribed" as unrestricted, and having
      // the API disagree with the UI would lock people out of screens they can
      // still see. Tightening this is a product decision, not a guard fix.
      resolved = { modules: {}, active: true, expiresAt: Date.now() + CACHE_TTL_MS };
    } else {
      const plan = await this.planModel
        .findById(shopkeeper.planId)
        .select("modules")
        .lean();
      const expiry = shopkeeper.planExpiryDate
        ? new Date(shopkeeper.planExpiryDate).getTime()
        : null;
      const active = expiry === null ? true : Date.now() <= expiry + GRACE_MS;
      resolved = {
        modules: ((plan?.modules as ModuleMap) || {}) as ModuleMap,
        active,
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    }
    this.cache.set(id, resolved);
    return resolved;
  }

  /**
   * Is `feature` available to this shopkeeper?
   *
   * A key the plan does not mention counts as ENABLED, deliberately mirroring
   * `isModuleEnabled` on the frontend. Plans in the database predate most of
   * these keys, so denying unknown keys would revoke features from paying
   * shopkeepers the moment this guard shipped. Only an explicit
   * `{ enabled: false }` blocks a request.
   */
  async isEnabled(shopkeeperId: string, feature: string): Promise<boolean> {
    const access = await this.load(shopkeeperId);
    if (!access.active) return false;
    return access.modules?.[feature]?.enabled !== false;
  }

  /** Numeric cap for a feature, or 0 when uncapped. */
  async limitFor(shopkeeperId: string, feature: string): Promise<number> {
    const access = await this.load(shopkeeperId);
    return access.modules?.[feature]?.limit || 0;
  }
}
