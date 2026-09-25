import { OrderStatus } from "./entities/order.entity";

/** What a customer is told when their order moves to a status. */
export type OrderStatusCopy = {
  /** "Order Confirmed", "Ready for Pickup", … — the email subject and heading. */
  title: string;
  /** Leads the WhatsApp message. */
  emoji: string;
  /** One sentence saying what happened, naming the shop. */
  sentence: string;
  /** False only for a cancellation — the email colours itself by it. */
  good: boolean;
};

/**
 * The wording for a status change, shared by the status email and the status
 * WhatsApp so the two never describe the same change differently.
 *
 * Both used to know only "confirmed" or "rejected", so every change that was
 * not a cancellation — ready, shipped, even completed — told the customer
 * their payment had just been confirmed and the order was being processed.
 *
 * Returns null for `pending`: moving an order back to pending is the shop
 * correcting itself, not news for the customer, so nothing is sent.
 */
export function orderStatusCopy(
  status: string,
  shopName: string,
): OrderStatusCopy | null {
  const shop = shopName || "the shop";
  switch (status) {
    case OrderStatus.Pending:
      return null;
    case OrderStatus.Processing:
      return {
        title: "Order Confirmed",
        emoji: "✅",
        sentence: `Your order has been confirmed by ${shop} and is being prepared.`,
        good: true,
      };
    case OrderStatus.Ready:
      return {
        title: "Ready for Pickup",
        emoji: "📦",
        sentence: `Your order from ${shop} is ready for pickup.`,
        good: true,
      };
    case OrderStatus.Shipped:
      return {
        title: "Order Shipped",
        emoji: "🚚",
        sentence: `Your order from ${shop} is on its way.`,
        good: true,
      };
    case OrderStatus.Completed:
      return {
        title: "Order Completed",
        emoji: "🎉",
        sentence: `Your order from ${shop} is complete. Thank you for shopping with us!`,
        good: true,
      };
    case OrderStatus.Cancelled:
      return {
        title: "Order Cancelled",
        emoji: "❌",
        sentence: `Your order was cancelled by ${shop}. Please contact the shop for details.`,
        good: false,
      };
    default:
      return {
        title: "Order Update",
        emoji: "📋",
        sentence: `Your order from ${shop} is now ${status}.`,
        good: true,
      };
  }
}
