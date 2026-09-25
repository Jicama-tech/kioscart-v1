import { SetMetadata } from "@nestjs/common";

export const TABS_KEY = "accessTabs";

/**
 * Which operator access tab (Operator.accessTabs) is needed to reach a route.
 * Listing several means ANY one of them is enough.
 *
 * Checked by TabsGuard, which must run after the JWT guard because it reads
 * `req.user`:
 *
 *   @UseGuards(AuthGuard("jwt"), TabsGuard)
 *   @Tabs("whatsapp")
 *
 * Shop owners are never restricted by this — tabs are an operator-only concept.
 * The tab names are the ones the operator form in
 * frontend/src/components/shopkeeper/ShopkeeperSettings.tsx (ALL_TABS) writes.
 */
export const Tabs = (...tabs: string[]) => SetMetadata(TABS_KEY, tabs);
