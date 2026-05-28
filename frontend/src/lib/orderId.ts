/**
 * Build a human-readable order ID scoped to a shop.
 *
 * Format: `{shopslug}-order-{unique}`
 *   - shopslug = lowercase alphanumeric of the shop name, max 20 chars
 *     (spaces/punctuation stripped, NOT replaced — "Shree Sai Selection"
 *     becomes "shreesaiselection")
 *   - unique = base36(Date.now()) + 4 random base36 chars
 *     → ~13 chars, effectively collision-free across the platform
 *
 * Example: "Shree Sai Selection" → "shreesaiselection-order-mwxy3kab4f7g"
 *
 * NOTE: Existing orders created before this util landed retain their old
 * `ORDER-{timestamp}-{random}` IDs. Both formats coexist forever — the
 * `orderId` field is just a unique string, no parser depends on the shape.
 */
export function generateOrderId(shopName?: string | null): string {
  const slug =
    (shopName || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "store";
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}-order-${ts}${rand}`;
}
