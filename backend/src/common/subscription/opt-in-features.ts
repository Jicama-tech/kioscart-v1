/**
 * Plan keys that are OFF unless a plan explicitly switches them on.
 *
 * Every other key follows the old rule — a key the plan does not mention is
 * enabled — because plans in the database predate most keys and denying them
 * would have taken features away from paying shops. These are the reverse:
 * paid add-ons that no existing plan has ever sold, so treating "missing" as
 * "on" would hand them to every shop for free the day they ship.
 *
 * Keep this in step with the `optIn: true` items in
 * frontend/src/lib/planModules.ts (exported there as OPT_IN_MODULE_KEYS), which
 * is what the dashboard gates on. If the two disagree, the dashboard shows a
 * screen the API refuses, or hides one the shop has paid for.
 */
export const OPT_IN_FEATURES: ReadonlySet<string> = new Set([
  // The shop's own WhatsApp number, linked by QR (modules/whatsapp).
  "whatsappConnect",
]);
