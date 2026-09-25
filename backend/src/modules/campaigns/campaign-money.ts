/**
 * Prices as a campaign message shows them.
 *
 * The formatting is OrdersService.formatPriceByCountry's, copied rather than
 * shared: that method is private to the orders flow, and a campaign's
 * `{{price}}` should read exactly like the amount on the customer's order
 * confirmation from the same shop. If one changes, change the other.
 */

type PricedItem = {
  price?: number | null;
  isDiscounted?: boolean | null;
  discountedPrice?: number | null;
};

const CURRENCIES: Record<
  string,
  { locale: string; currency: string; symbol?: string }
> = {
  IN: { locale: "en-IN", currency: "INR", symbol: "₹" },
  SG: { locale: "en-SG", currency: "SGD", symbol: "S$" },
  US: { locale: "en-US", currency: "USD" },
  GB: { locale: "en-GB", currency: "GBP" },
};

/** Older shop rows store the country as a name rather than a code. */
const COUNTRY_NAMES: Record<string, string> = {
  INDIA: "IN",
  SINGAPORE: "SG",
  UNITEDSTATES: "US",
  USA: "US",
  UNITEDKINGDOM: "GB",
  UK: "GB",
};

function countryCode(country?: string | null): string {
  const key = String(country ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return COUNTRY_NAMES[key] ?? key;
}

/** What the customer actually pays: the discounted price when a discount is
 * switched on AND set, else the list price. A discount flag left on with no
 * amount would otherwise advertise the item as free. */
export function effectivePrice(item: PricedItem | null | undefined): number {
  const discounted = Number(item?.discountedPrice);
  if (item?.isDiscounted && Number.isFinite(discounted) && discounted > 0) {
    return discounted;
  }
  const price = Number(item?.price);
  return Number.isFinite(price) ? price : 0;
}

/** "₹1,499.00" for an Indian shop, "S$1,499.00" for a Singapore one. */
export function formatPrice(amount: number, country?: string | null): string {
  if (amount == null || !Number.isFinite(Number(amount))) return "0.00";
  const value = Number(amount);
  const cfg = CURRENCIES[countryCode(country)] || {
    locale: "en-US",
    currency: "USD",
  };
  if (cfg.symbol) {
    return `${cfg.symbol}${value.toLocaleString(cfg.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return value.toLocaleString(cfg.locale, {
    style: "currency",
    currency: cfg.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
