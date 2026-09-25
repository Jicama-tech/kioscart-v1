import { SetMetadata } from "@nestjs/common";

export const REQUIRES_FEATURE_KEY = "requiresFeature";

/**
 * Marks a route (or a whole controller) as needing one or more plan features.
 *
 * Keys are the same ones the Super Admin plan editor writes and the dashboard
 * gates on — see frontend/src/lib/planModules.ts, which is the catalog both
 * sides share. Listing several means ALL of them must be enabled; that is the
 * conservative reading for a route that genuinely does two gated things.
 *
 *   @RequiresFeature("bulkImport")
 *   @Post("import")
 *   importProducts() { ... }
 */
export const RequiresFeature = (...features: string[]) =>
  SetMetadata(REQUIRES_FEATURE_KEY, features);
