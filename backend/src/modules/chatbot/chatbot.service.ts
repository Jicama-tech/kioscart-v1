import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import OpenAI from "openai";

export interface QuickAction { label: string; action: string; }
export type BotAction =
  | { type: "navigate"; tab: string }
  | {
      type: "showQR";
      orderId: string;
      amount: number;
      country: string;
      shopName?: string;
      shopkeeperPhone?: string;
      paymentURL?: string;
    };
export interface BotResponse { text: string; quickActions?: QuickAction[]; botAction?: BotAction; }

interface ConvEntry { role: "user" | "assistant"; content: string; ts: number }

@Injectable()
export class ChatbotService {
  private logger = new Logger(ChatbotService.name);
  private ai: OpenAI;
  // Rolling per-shopkeeper chat history. Keeps last MAX_TURNS pairs for ~TTL_MINUTES
  // so follow-ups like "use T-shirt XL" are interpreted in the context of the prior
  // order attempt. In-memory is fine for a single-node dev server; for a multi-node
  // prod deploy swap this for Redis keyed on shopkeeperId.
  private conversations = new Map<string, ConvEntry[]>();
  private static readonly MAX_TURNS = 6; // i.e. 12 messages
  private static readonly TTL_MINUTES = 30;

  constructor(
    @InjectModel("Product") private productModel: Model<any>,
    @InjectModel("Order") private orderModel: Model<any>,
    @InjectModel("Shopkeeper") private shopkeeperModel: Model<any>,
    @InjectModel("Coupon") private couponModel: Model<any>,
    @InjectModel("Operator") private operatorModel: Model<any>,
    @InjectModel("Plan") private planModel: Model<any>,
    @InjectModel("PaymentEmail") private paymentEmailModel: Model<any>,
    @InjectModel("User") private userModel: Model<any>,
  ) {
    // Provider: Groq (free, fast tool-calling). Override with QWEN_* env vars if needed.
    const apiKey = process.env.GROQ_API_KEY || process.env.QWEN_API_KEY || "";
    const baseURL = process.env.GROQ_API_KEY
      ? "https://api.groq.com/openai/v1"
      : process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
    this.ai = new OpenAI({ apiKey, baseURL });
  }

  private get model() {
    if (process.env.GROQ_API_KEY) return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    return process.env.QWEN_MODEL || "qwen-plus";
  }

  // Small/cheap model used for routing (doesn't need 70B). Falls back to the
  // main model if the smaller one isn't configured.
  private get routerModel() {
    if (process.env.GROQ_API_KEY) return process.env.GROQ_ROUTER_MODEL || "llama-3.1-8b-instant";
    return this.model;
  }

  // Fallback model used when the primary returns 429 (daily TPD exceeded).
  private get fallbackModel() {
    if (process.env.GROQ_API_KEY) return process.env.GROQ_FALLBACK_MODEL || "llama-3.1-8b-instant";
    return this.model;
  }

  private isRateLimit(err: any): boolean {
    const status = err?.status || err?.response?.status;
    return status === 429 || /rate limit|TPD|tokens per day/i.test(err?.message || "");
  }

  private hasApiKey() {
    return !!(process.env.GROQ_API_KEY || process.env.QWEN_API_KEY);
  }

  private tools: OpenAI.ChatCompletionTool[] = [
    { type: "function", function: { name: "get_today_orders", description: "Get today's orders summary — count, revenue, pending/completed breakdown", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_pending_orders", description: "Get list of pending orders", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_recent_orders", description: "Get recent orders", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_order_detail", description: "Get details of a specific order by ID", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
    { type: "function", function: { name: "update_order_status", description: "Update order status (processing/ready/completed/cancelled)", parameters: { type: "object", properties: { order_id: { type: "string" }, status: { type: "string", enum: ["processing", "ready", "completed", "cancelled"] } }, required: ["order_id", "status"] } } },
    { type: "function", function: { name: "get_products", description: "Get shopkeeper's products list", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_product_count", description: "Get product counts", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_low_stock", description: "Get products with low stock", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_product_detail", description: "Get full structure of a single product — including its variants, subcategories, and options. Use this before editing when the user mentions a variant, size, or pack.", parameters: { type: "object", properties: { product_name: { type: "string", description: "Name or partial name of the product" } }, required: ["product_name"] } } },
    { type: "function", function: { name: "update_product", description: "Update a product's top-level fields (name, price, inventory, status, etc). Works on any product regardless of variants. To edit a specific variant or subcategory, use update_variant or update_subcategory instead.", parameters: { type: "object", properties: { product_name: { type: "string" }, new_name: { type: "string" }, price: { type: "number" }, inventory: { type: "number" }, status: { type: "string", enum: ["active", "draft", "archived"] }, lowstockThreshold: { type: "number" }, trackQuantity: { type: "boolean" }, isDiscounted: { type: "boolean" }, discountedPrice: { type: "number" } }, required: ["product_name"] } } },
    { type: "function", function: { name: "update_variant", description: "Update a variant inside a product by title or SKU. For tree-structured products with the same variant title under multiple subcategories (e.g. Veg>Medium and Non-Veg>Medium), pass subcategory_name to disambiguate.", parameters: { type: "object", properties: { product_name: { type: "string" }, variant_title: { type: "string", description: "Variant title or SKU to match" }, subcategory_name: { type: "string", description: "Optional: restrict the match to a specific subcategory" }, price: { type: "number" }, inventory: { type: "number" }, lowstockThreshold: { type: "number" }, trackQuantity: { type: "boolean" }, isDiscounted: { type: "boolean" }, discountedPrice: { type: "number" } }, required: ["product_name", "variant_title"] } } },
    { type: "function", function: { name: "update_subcategory", description: "Update a subcategory inside a product (matched by name). Edits subcategory-level fields like basePrice and inventory.", parameters: { type: "object", properties: { product_name: { type: "string" }, subcategory_name: { type: "string" }, basePrice: { type: "number" }, additionalPrice: { type: "number" }, inventory: { type: "number" }, lowstockThreshold: { type: "number" }, trackQuantity: { type: "boolean" } }, required: ["product_name", "subcategory_name"] } } },
    { type: "function", function: { name: "update_option", description: "Update a product option (e.g. Size/Quantity/Pack) by its title. Only for products that have productOptions.", parameters: { type: "object", properties: { product_name: { type: "string" }, option_title: { type: "string" }, price: { type: "number" }, inventory: { type: "number" }, lowstockThreshold: { type: "number" }, trackQuantity: { type: "boolean" }, isDiscounted: { type: "boolean" }, discountedPrice: { type: "number" } }, required: ["product_name", "option_title"] } } },
    { type: "function", function: { name: "add_variant", description: "Add a NEW variant to a product. If subcategory_name is provided, the variant is added inside that subcategory (tree products). Otherwise added to the product's top-level variants array.", parameters: { type: "object", properties: { product_name: { type: "string" }, title: { type: "string" }, price: { type: "number" }, subcategory_name: { type: "string", description: "Optional: add the variant inside this subcategory" }, sku: { type: "string", description: "Optional: auto-generated if omitted" }, inventory: { type: "number" }, trackQuantity: { type: "boolean" }, lowstockThreshold: { type: "number" } }, required: ["product_name", "title", "price"] } } },
    { type: "function", function: { name: "remove_variant", description: "Remove a variant from a product by title or SKU. Provide subcategory_name to remove a variant nested inside a specific subcategory; otherwise removes from the top-level variants array.", parameters: { type: "object", properties: { product_name: { type: "string" }, variant_title: { type: "string" }, subcategory_name: { type: "string", description: "Optional: the subcategory containing the variant" } }, required: ["product_name", "variant_title"] } } },
    { type: "function", function: { name: "add_subcategory", description: "Add a NEW subcategory to a product (e.g. 'Veg', 'Non-Veg'). Starts with an empty variants array — use add_variant afterwards to populate it.", parameters: { type: "object", properties: { product_name: { type: "string" }, name: { type: "string" }, basePrice: { type: "number", description: "Defaults to 0" }, inventory: { type: "number" }, trackQuantity: { type: "boolean" }, lowstockThreshold: { type: "number" } }, required: ["product_name", "name"] } } },
    { type: "function", function: { name: "remove_subcategory", description: "Remove a subcategory (and all its nested variants) from a product.", parameters: { type: "object", properties: { product_name: { type: "string" }, subcategory_name: { type: "string" } }, required: ["product_name", "subcategory_name"] } } },
    { type: "function", function: { name: "add_option", description: "Add a NEW productOption (Size / Quantity / Pack) to a product.", parameters: { type: "object", properties: { product_name: { type: "string" }, title: { type: "string" }, price: { type: "number" }, inventory: { type: "number" }, trackQuantity: { type: "boolean" }, lowstockThreshold: { type: "number" } }, required: ["product_name", "title", "price"] } } },
    { type: "function", function: { name: "remove_option", description: "Remove a productOption from a product by its title.", parameters: { type: "object", properties: { product_name: { type: "string" }, option_title: { type: "string" } }, required: ["product_name", "option_title"] } } },
    { type: "function", function: { name: "delete_product", description: "Soft-delete a product by name. Asks for confirmation implicitly — only call if user clearly said to delete/remove.", parameters: { type: "object", properties: { product_name: { type: "string" } }, required: ["product_name"] } } },
    { type: "function", function: { name: "confirm_payment_by_order_id", description: "Confirm a single matched payment for a specific order — moves that order from pending to processing. Only works when a payment email already matched that order.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
    { type: "function", function: { name: "place_order", description: "Create a kiosk / walk-in order. Each item is resolved against the shopkeeper's catalog. Supports tree-structured products: use `subcategory_name` + `variant_title` together to target a variant inside a subcategory (e.g. Pizza > Veg > Medium). If only `variant_title` is given, the tool tries top-level variants → subcategory variants → subcategory by name → productOption. Applies the shop's discount% then tax% (matching Kiosk Mode). Require the customer's name + whatsapp + email before calling this tool — ask the shopkeeper for any missing field.", parameters: { type: "object", properties: { customer_name: { type: "string" }, whatsapp: { type: "string", description: "Customer WhatsApp number with country code (e.g. +919876543210)" }, email: { type: "string", description: "Customer email" }, items: { type: "array", items: { type: "object", properties: { product_name: { type: "string" }, subcategory_name: { type: "string", description: "Only for tree-structured products. The outer subcategory name (e.g. 'Veg' in Pizza > Veg > Medium)." }, variant_title: { type: "string", description: "Variant title, subcategory name, or productOption title. For tree products, the inner variant (e.g. 'Medium')." }, quantity: { type: "number", description: "Defaults to 1 if omitted" } }, required: ["product_name"] } }, payment_method: { type: "string", enum: ["qr", "cash"], description: "qr = generate a payment QR; cash = already paid. Defaults to qr." }, instructions: { type: "string", description: "Optional notes / instructions for this order" } }, required: ["customer_name", "items"] } } },
    { type: "function", function: { name: "get_payment_qr", description: "Generate a payment QR for an existing order. Returns UPI payload for India or PayNow data for Singapore, based on shopkeeper's country setting. Call after a QR-payment place_order.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
    { type: "function", function: { name: "get_order_receipt", description: "Return the URL of the PDF receipt for an order. Use after a cash order, or whenever the shopkeeper asks for a receipt.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
    { type: "function", function: { name: "get_analytics", description: "Get analytics for a period", parameters: { type: "object", properties: { period: { type: "string", enum: ["monthly", "lastmonth", "quarterly", "lastquarter", "yearly", "lastyear"] } }, required: ["period"] } } },
    { type: "function", function: { name: "get_today_revenue", description: "Get today's revenue", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_top_products", description: "Get top selling products", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_payment_summary", description: "Get payment tracking summary", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "confirm_matched_payments", description: "Confirm all matched payments and move orders to processing", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_matched_payments", description: "Get matched payments awaiting confirmation", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_unmatched_payments", description: "Get unmatched payments", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_customers", description: "Get total customer count", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_coupons", description: "Get active coupons", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_plan_info", description: "Get subscription plan info", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_operators", description: "Get list of operators", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "get_shop_info", description: "Get shop details", parameters: { type: "object", properties: {}, required: [] } } },
    { type: "function", function: { name: "navigate_to", description: "Navigate user to a dashboard tab", parameters: { type: "object", properties: { tab: { type: "string", enum: ["dashboard", "products", "orders", "crm", "kiosk", "storefront", "settings"] } }, required: ["tab"] } } },
  ];

  // Agentic pipeline — router classifies the message into a tab,
  // then a tab-specific specialist runs with only that tab's tools +
  // a tuned system prompt. Small focused tool lists = better tool-call accuracy.
  private static TAB_TOOLS: Record<string, string[]> = {
    dashboard: ["get_today_orders", "get_today_revenue", "get_analytics", "get_top_products", "get_product_count", "get_customers", "get_pending_orders"],
    kiosk: ["get_products", "get_product_detail", "place_order", "get_payment_qr", "get_order_receipt", "get_order_detail"],
    orders: ["get_today_orders", "get_pending_orders", "get_recent_orders", "get_order_detail", "update_order_status", "get_payment_summary", "confirm_matched_payments", "confirm_payment_by_order_id", "get_matched_payments", "get_unmatched_payments"],
    crm: ["get_customers"], // TODO phase 2: customer detail + messaging tools
    products: ["get_products", "get_product_count", "get_low_stock", "get_product_detail", "update_product", "update_variant", "update_subcategory", "update_option", "add_variant", "remove_variant", "add_subcategory", "remove_subcategory", "add_option", "remove_option", "delete_product", "get_top_products"],
    storefront: [], // TODO phase 2: storefront config + branding tools
    settings: ["get_shop_info", "get_plan_info", "get_operators", "get_coupons"], // TODO phase 2: profile/coupon/operator edit tools
    general: ["get_shop_info", "get_today_orders", "get_today_revenue", "get_products", "get_pending_orders"],
  };

  private static SPECIALIST_PROMPTS: Record<string, string> = {
    dashboard: `You are the **Dashboard** specialist for "{SHOP}" on KiosCart.
Focus: analytics, performance overview, revenue trends, top products, customer counts.
- Always use tools — never guess numbers.
- Period words map to tool periods (recognise in any language the user writes): "today" → get_today_orders + get_today_revenue; "this month" → get_analytics(monthly); "last month" → get_analytics(lastmonth); "this quarter" → get_analytics(quarterly); "last quarter" → get_analytics(lastquarter); "this year" → get_analytics(yearly); "last year" → get_analytics(lastyear).
- Lead with the headline number in **bold**, then 1-2 supporting metrics.
- For generic "how is my shop doing" questions, call get_analytics(monthly) and format: revenue, orders, top products.
- If the user asks for something that belongs to another tab (e.g. edit a product), briefly answer and suggest navigate_to.`,
    kiosk: `You are the **Kiosk** specialist for "{SHOP}" on KiosCart. You act like an in-store POS over chat.
Focus: placing walk-in orders, generating payment QRs, and producing receipts.

REQUIRED before place_order: customer **name**, **WhatsApp number** (with country code), **email**. If any of these three is missing from the shopkeeper's message, ASK for the missing ones and DO NOT call place_order yet. Only skip a field if the shopkeeper explicitly says "skip whatsapp" or "no email".

Item format (the shopkeeper separates items with commas). Each item maps to one object in place_order.items:
- Simple product:             "Mango Juice"                   → { product_name: "Mango Juice" }  (quantity defaults to 1)
- With quantity:              "2 Chai" / "Mango Juice x2"     → { product_name: "Chai", quantity: 2 }
- Top-level variant:          "Pizza Large"                   → { product_name: "Pizza", variant_title: "Large" }
- Subcategory only:           "T-shirt Summer"                → { product_name: "T-shirt", variant_title: "Summer" }
- productOption (Size/Pack):  "Dal Pack of 3"                 → { product_name: "Dal", variant_title: "Pack of 3" }
- **Tree product** (subcategory → variant): "Pizza Veg Medium" → { product_name: "Pizza", subcategory_name: "Veg", variant_title: "Medium" }. Use BOTH fields when the shopkeeper names a subcategory AND a variant inside it (two levels deep).

**When in doubt, call get_product_detail(product_name) FIRST** so you can see the real shape (variants / subcategories / options) and pick the right fields. This is much better than guessing and relying on place_order errors.

Resolution order inside place_order (for reference — you don't need to replicate this):
top-level variant → subcategory > variant → subcategory (by name) → productOption → auto-split "Subcat Variant" → error with candidates.

Rule of thumb: if the description after the product name has two distinct parts that could be "subcategory + variant", ALWAYS split them into subcategory_name + variant_title. Free-form descriptors with spaces are also auto-split on the backend, but explicit is better.
If place_order returns an "available" object with candidates, show the candidates to the shopkeeper in a short list and ask which one they meant.

Flow:
1. Confirm name + whatsapp + email are present; ask for anything missing.
2. Parse the comma-separated items.
3. Detect payment method: words like "cash" → payment_method="cash". Otherwise default to "qr".
4. Call place_order with customer_name, whatsapp, email, items, payment_method, optional instructions.
5. After place_order succeeds:
   - payment_method="qr" → IMMEDIATELY call get_payment_qr with the returned orderId.
   - payment_method="cash" → IMMEDIATELY call get_order_receipt to give the customer a PDF receipt.
6. In your reply, show the breakdown (subtotal, discount, tax, total) from place_order's response.

Other rules:
- "What products do we have?" / "show menu" → get_products.
- "Show order X" / "what's in order X" → get_order_detail.
- "Receipt for order X" → get_order_receipt.`,
    orders: `You are the **Orders & Payments** specialist for "{SHOP}" on KiosCart.
Focus: orders, order status, payment tracking (Gmail-matched payments).
- "pending orders" → get_pending_orders. "today" → get_today_orders.
- "order X details" → get_order_detail. "mark order X as ready/completed" → update_order_status.
- "confirm payment for order X" → confirm_payment_by_order_id. "confirm all matched" → confirm_matched_payments.
- Always reference the orderId in responses.`,
    crm: `You are the **CRM / Customers** specialist for "{SHOP}" on KiosCart.
Focus: customer list and customer insights.
- Today you can only call get_customers (total count). For customer-specific lookups, say so and suggest navigate_to crm so the shopkeeper can filter the UI.`,
    products: `You are the **Products / Catalog** specialist for "{SHOP}" on KiosCart.
Focus: product catalog, inventory, prices, variants, subcategories, options.

Read:
- "show products" → get_products. "how many products" → get_product_count. "low stock" → get_low_stock. "best sellers" → get_top_products.
- Before editing a variant/subcategory/option, call **get_product_detail** first so you know the exact titles and structure.

Top-level product:
- Update any simple field (price, inventory, status, name, lowstockThreshold, trackQuantity, isDiscounted, discountedPrice) → update_product.
- Delete the whole product → delete_product.

Variants (flat):
- Add → add_variant { product_name, title, price, sku? }
- Edit → update_variant { product_name, variant_title, <field> }
- Remove → remove_variant { product_name, variant_title }

Subcategories (e.g. Veg / Non-Veg, Summer / Winter):
- Add → add_subcategory { product_name, name, basePrice? }
- Edit → update_subcategory { product_name, subcategory_name, basePrice? / inventory? / ... }
- Remove → remove_subcategory (also drops every variant inside it)

Variants **inside** a subcategory (tree products, e.g. Pizza > Veg > Medium):
- Add → add_variant { product_name, subcategory_name, title, price }
- Edit → update_variant { product_name, variant_title, subcategory_name } (subcategory_name disambiguates)
- Remove → remove_variant { product_name, variant_title, subcategory_name }

Options (Size / Quantity / Pack):
- Add → add_option { product_name, title, price }
- Edit → update_option { product_name, option_title, <field> }
- Remove → remove_option { product_name, option_title }

Not supported in chat (use navigate_to instead): creating a brand-new product, uploading/changing images, editing tags in bulk.`,
    storefront: `You are the **Storefront / Branding** specialist for "{SHOP}" on KiosCart.
Focus: store branding, banners, colors, logo, SEO, layout.
- Storefront edits aren't wired to chat tools yet — always navigate_to the storefront tab and briefly say what the user should change there.`,
    settings: `You are the **Settings** specialist for "{SHOP}" on KiosCart.
Focus: shop profile, operators, coupons, plan/subscription, pickup settings.
- "my plan" / "subscription" → get_plan_info.
- "list operators" → get_operators. "list coupons" → get_coupons. "shop details" → get_shop_info.
- Edit operations (create/update/delete coupons, add/remove operators, change pickup settings) aren't chat tools yet — navigate_to settings and tell the shopkeeper which section to open.`,
    general: `You are KiosAI for "{SHOP}" on KiosCart. The user's request didn't clearly match a specific tab, so keep things short and guide them.
- Brief greeting / help.
- Offer 3-5 quick action chips for common tasks.
- If the user asks a concrete question, answer it using the few read-only tools available (shop info, today's orders/revenue, products).`,
  };

  async processMessage(shopkeeperId: string, message: string): Promise<BotResponse> {
    try {
      if (!this.hasApiKey()) {
        return this.fallbackKeyword(shopkeeperId, message);
      }

      const shopkeeper: any = await this.shopkeeperModel.findById(shopkeeperId).lean();
      const shopName = shopkeeper?.shopName || "Store";

      // Stage 1 — router: classify the message into a tab. Give it the last
      // few turns so mid-flow follow-ups ("use T-shirt XL") stay on the same tab.
      const tab = await this.routeToTab(shopkeeperId, message);
      this.logger.log(`[Router] "${message.slice(0, 60)}" → ${tab}`);

      // Stage 2 — specialist for that tab runs the tool-calling loop.
      const reply = await this.runSpecialist(shopkeeperId, message, tab, shopName);
      this.appendHistory(shopkeeperId, message, reply.text);
      return reply;
    } catch (error) {
      const detail = error?.response?.data?.error?.failed_generation || error?.error?.failed_generation || "";
      this.logger.error(`AI Error: ${error.message}${detail ? ` | failed_generation: ${JSON.stringify(detail).slice(0, 500)}` : ""}`);
      return this.fallbackKeyword(shopkeeperId, message);
    }
  }

  // Stage 1 — small, cheap classification call. Returns one of:
  // dashboard | kiosk | orders | crm | products | storefront | settings | general
  private async routeToTab(shopkeeperId: string, message: string): Promise<string> {
    const validTabs = Object.keys(ChatbotService.TAB_TOOLS);
    // Last 2 turns keep the router anchored when the user writes a follow-up.
    const recent = this.historyAsMessages(shopkeeperId, 4);
    try {
      const res = await this.ai.chat.completions.create({
        model: this.routerModel,
        messages: [
          {
            role: "system",
            content: `You are a router. Classify the shopkeeper's message into exactly one tab id. Output ONLY the id, nothing else.

Tabs:
- dashboard: analytics, revenue, stats, performance, "how is my shop doing"
- kiosk: place an order for a walk-in/in-store customer, generate payment QR, POS
- orders: list orders, order status updates, payment confirmations, Gmail-matched payments
- crm: customer list, customer details, customer messaging
- products: product catalog, inventory, prices, variants, edit/create/delete products, low stock
- storefront: store branding, banners, colors, logo, SEO, theme/design
- settings: shop profile, operators, coupons, tax/discount, pickup settings, subscription plan, shop details
- general: greetings, help, unclear or off-topic

If the latest message is a short follow-up / clarification to recent turns (e.g. the user just picked a variant you had asked about), stick with the tab that fits the overall flow — usually the same tab the earlier messages were on.

Return just the id.`,
          },
          ...recent,
          { role: "user", content: message },
        ],
        max_tokens: 12,
        temperature: 0,
      });
      const raw = ((res.choices?.[0]?.message as any)?.content || "general").trim().toLowerCase();
      for (const tab of validTabs) {
        if (raw === tab || raw.includes(tab)) return tab;
      }
      return "general";
    } catch (e: any) {
      this.logger.warn(`Router failed: ${e.message} — defaulting to general`);
      return "general";
    }
  }

  // Stage 2 — run the specialist for a given tab. Tool list is scoped to
  // that tab (plus navigate_to as escape hatch).
  private async runSpecialist(
    shopkeeperId: string,
    message: string,
    tab: string,
    shopName: string,
  ): Promise<BotResponse> {
    const allowed = new Set([...(ChatbotService.TAB_TOOLS[tab] || []), "navigate_to"]);
    const tools = this.tools.filter(t => t.type === "function" && allowed.has(t.function.name));
    const prompt = (ChatbotService.SPECIALIST_PROMPTS[tab] || ChatbotService.SPECIALIST_PROMPTS.general)
      .replace("{SHOP}", shopName);

    const sysCommon = `
Global rules:
- Be concise. Use **bold** for key numbers and order ids.
- Always use tools to get real data — never make up numbers.
- IMPORTANT: call tools via the structured tool-calling API only. NEVER write tool calls as text like "<function=name{...}>" or inside markdown — that is not a valid response.
- If a tool returns an error, explain it to the shopkeeper in plain language and suggest what to do next.
- Suggest 2-3 follow-up actions in your reply text.
- **Language matching**: reply in the SAME language/script the shopkeeper wrote in. If they write in English, reply in English. If they write in Hindi (Devanagari), reply in Hindi. Hinglish (Hindi words in Latin script, e.g. "aaj ka order kya hai") → reply in Hinglish. Same rule for Tamil, Malay, Chinese, Singlish, or any other language. Do NOT default to Hindi when the user wrote English. Recognise period words in the user's language (e.g. "today/aaj/今日", "last month/pichhla mahina/上个月") but match their reply language.`;

    const history = this.historyAsMessages(shopkeeperId);
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: `${prompt}\n${sysCommon}` },
      ...history,
      { role: "user", content: message },
    ];

    let response: any;
    let currentModel = this.model;
    const runCompletion = (modelId: string) => this.ai.chat.completions.create({
      model: modelId,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      max_tokens: 1024,
      temperature: 0,
    });
    try {
      response = await runCompletion(currentModel);
    } catch (err: any) {
      // 429 → retry once on the smaller fallback model so the bot stays live
      // after the daily TPD cap is hit on the primary (e.g. Groq 70B).
      if (this.isRateLimit(err) && this.fallbackModel && this.fallbackModel !== currentModel) {
        this.logger.warn(`Primary model rate-limited; falling back to ${this.fallbackModel}`);
        currentModel = this.fallbackModel;
        try {
          response = await runCompletion(currentModel);
        } catch (err2: any) {
          throw err2;
        }
      } else {
        // Groq llama-3.x sometimes emits <function=NAME{args}> as text instead of
        // using the structured tool_calls API. Parse and recover.
        const failedGen =
          err?.error?.failed_generation ||
          err?.response?.data?.error?.failed_generation ||
          "";
        const parsed = this.parseMalformedToolCall(failedGen);
        if (!parsed) throw err;
        this.logger.warn(`Recovered malformed tool call: ${parsed.name}`);
        response = {
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: `call_recovered_${Date.now()}`,
                    type: "function",
                    function: { name: parsed.name, arguments: JSON.stringify(parsed.args) },
                  },
                ],
              },
            },
          ],
        };
      }
    }

    const assistantMsg = response.choices[0].message as any;
    let botAction: BotAction | undefined;

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      const toolMessages: any[] = [...messages, assistantMsg];

      for (const tc of assistantMsg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const result = await this.executeTool(shopkeeperId, tc.function.name, args);
        toolMessages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        if (tc.function.name === "navigate_to") {
          botAction = { type: "navigate", tab: args.tab };
        } else if (tc.function.name === "get_payment_qr" && result && !result.error) {
          botAction = {
            type: "showQR",
            orderId: result.orderId,
            amount: result.amount,
            country: result.country,
            shopName: result.shopName,
            shopkeeperPhone: result.shopkeeperPhone,
            paymentURL: result.paymentURL,
          };
        }
      }

      let followUp: any;
      try {
        followUp = await this.ai.chat.completions.create({
          model: currentModel,
          messages: toolMessages,
          max_tokens: 1024,
        });
      } catch (fErr: any) {
        if (this.isRateLimit(fErr) && this.fallbackModel !== currentModel) {
          this.logger.warn(`Follow-up rate-limited; falling back to ${this.fallbackModel}`);
          followUp = await this.ai.chat.completions.create({
            model: this.fallbackModel,
            messages: toolMessages,
            max_tokens: 1024,
          });
        } else {
          throw fErr;
        }
      }
      const text = (followUp.choices[0].message as any).content || "Done!";
      return { text, quickActions: this.suggestActions(message), botAction };
    }

    return {
      text: assistantMsg.content || "How can I help you?",
      quickActions: this.suggestActions(message),
      botAction,
    };
  }

  private suggestActions(msg: string): QuickAction[] {
    const m = msg.toLowerCase();
    if (m.includes("order")) return [{ label: "Pending Orders", action: "show pending orders" }, { label: "Today's Revenue", action: "today's revenue" }];
    if (m.includes("product")) return [{ label: "Add Product", action: "add a new product" }, { label: "Low Stock", action: "low stock alerts" }];
    if (m.includes("payment")) return [{ label: "Confirm Payments", action: "confirm all matched payments" }, { label: "Summary", action: "payment summary" }];
    if (m.includes("hi") || m.includes("hello") || m.includes("help")) return [
      { label: "Today's Orders", action: "show today's orders" },
      { label: "Revenue", action: "today's revenue" },
      { label: "Analytics", action: "this month analytics" },
      { label: "Payments", action: "payment summary" },
      { label: "Products", action: "show products" },
      { label: "Add Product", action: "add product" },
    ];
    return [
      { label: "Orders", action: "show today's orders" },
      { label: "Revenue", action: "today's revenue" },
      { label: "Analytics", action: "this month report" },
      { label: "Payments", action: "payment summary" },
    ];
  }

  // --- conversation memory helpers ---
  private getHistory(sid: string): ConvEntry[] {
    const cutoff = Date.now() - ChatbotService.TTL_MINUTES * 60 * 1000;
    const all = this.conversations.get(sid) || [];
    const live = all.filter(e => e.ts >= cutoff);
    if (live.length !== all.length) this.conversations.set(sid, live);
    return live;
  }

  private appendHistory(sid: string, user: string, assistant: string) {
    const now = Date.now();
    const hist = this.getHistory(sid);
    hist.push({ role: "user", content: user, ts: now });
    hist.push({ role: "assistant", content: assistant, ts: now });
    // Keep last MAX_TURNS * 2 messages
    const max = ChatbotService.MAX_TURNS * 2;
    if (hist.length > max) hist.splice(0, hist.length - max);
    this.conversations.set(sid, hist);
  }

  private historyAsMessages(sid: string, limit = ChatbotService.MAX_TURNS * 2): OpenAI.ChatCompletionMessageParam[] {
    const hist = this.getHistory(sid).slice(-limit);
    return hist.map(e => ({ role: e.role, content: e.content }));
  }

  // Recover from Groq's llama-3.x text-wrapped tool calls, e.g.:
  //   <function=get_analytics{"period":"lastmonth"}>
  //   <function=navigate_to({"tab":"products"})>
  private parseMalformedToolCall(text: string): { name: string; args: any } | null {
    if (!text) return null;
    const m = text.match(/<function\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(?\s*(\{[\s\S]*?\})\s*\)?\s*(?:\/?>|<\/function>)?/);
    if (!m) return null;
    try {
      return { name: m[1], args: JSON.parse(m[2]) };
    } catch {
      return null;
    }
  }

  private async findOneProduct(sid: string, query: string): Promise<{ product: any } | { error: string; matches?: string[] }> {
    if (!query) return { error: "product_name required" };
    const matches = await this.productModel.find({ shopkeeperId: sid, isSoftDeleted: { $ne: true }, name: { $regex: query, $options: "i" } }).lean();
    if (matches.length === 0) return { error: "Product not found" };
    if (matches.length > 1) return { error: "Multiple products matched — please be more specific", matches: matches.slice(0, 5).map((p: any) => p.name) };
    return { product: matches[0] };
  }

  private async executeTool(sid: string, name: string, input: any): Promise<any> {
    switch (name) {
      case "get_today_orders": {
        const s = new Date(); s.setHours(0, 0, 0, 0);
        const orders = await this.orderModel.find({ shopkeeperId: sid, createdAt: { $gte: s }, isSoftDeleted: { $ne: true } }).lean();
        return { total: orders.length, pending: orders.filter((o: any) => o.status === "pending").length, completed: orders.filter((o: any) => o.status === "completed").length, processing: orders.filter((o: any) => o.status === "processing").length, revenue: orders.reduce((a: number, o: any) => a + (o.totalAmount || 0), 0) };
      }
      case "get_pending_orders": {
        const orders = await this.orderModel.find({ shopkeeperId: sid, status: "pending", isSoftDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(10).lean();
        return orders.map((o: any) => ({ orderId: o.orderId, amount: o.totalAmount, customer: o.customerName || o.firstName || "Customer", date: o.createdAt }));
      }
      case "get_recent_orders": {
        const orders = await this.orderModel.find({ shopkeeperId: sid, isSoftDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(10).lean();
        return orders.map((o: any) => ({ orderId: o.orderId, amount: o.totalAmount, status: o.status, customer: o.customerName || o.firstName || "Customer" }));
      }
      case "get_order_detail": {
        const order: any = await this.orderModel.findOne({ shopkeeperId: sid, orderId: { $regex: input.order_id, $options: "i" }, isSoftDeleted: { $ne: true } }).lean();
        if (!order) return { error: "Order not found" };
        return { orderId: order.orderId, status: order.status, total: order.totalAmount, type: order.orderType, customer: order.customerName || order.firstName, items: (order.cartItems || []).map((i: any) => ({ name: i.title || i.name, qty: i.quantity, price: i.price })) };
      }
      case "update_order_status": {
        const order = await this.orderModel.findOne({ shopkeeperId: sid, orderId: { $regex: input.order_id, $options: "i" }, isSoftDeleted: { $ne: true } });
        if (!order) return { error: "Order not found" };
        order.status = input.status;
        order.statusHistory = [...(order.statusHistory || []), { status: input.status, changedAt: new Date(), changedBy: "KiosAI" }];
        await order.save();
        return { success: true, orderId: order.orderId, newStatus: input.status };
      }
      case "get_products": {
        const products = await this.productModel.find({ shopkeeperId: sid, isSoftDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(15).lean();
        const total = await this.productModel.countDocuments({ shopkeeperId: sid, isSoftDeleted: { $ne: true } });
        return { total, products: products.map((p: any) => ({ name: p.name, price: p.price, status: p.status, inventory: p.inventory })) };
      }
      case "get_product_count": {
        const [total, active, draft] = await Promise.all([
          this.productModel.countDocuments({ shopkeeperId: sid, isSoftDeleted: { $ne: true } }),
          this.productModel.countDocuments({ shopkeeperId: sid, status: "active", isSoftDeleted: { $ne: true } }),
          this.productModel.countDocuments({ shopkeeperId: sid, status: "draft", isSoftDeleted: { $ne: true } }),
        ]);
        return { total, active, draft };
      }
      case "get_low_stock": {
        const p = await this.productModel.find({ shopkeeperId: sid, isSoftDeleted: { $ne: true }, trackQuantity: true, $expr: { $lte: ["$inventory", "$lowstockThreshold"] } }).lean();
        return p.map((x: any) => ({ name: x.name, stock: x.inventory, threshold: x.lowstockThreshold }));
      }
      case "get_product_detail": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const prod = p.product;
        return {
          name: prod.name, price: prod.price, status: prod.status, sku: prod.sku, category: prod.category,
          inventory: prod.inventory, trackQuantity: prod.trackQuantity, lowstockThreshold: prod.lowstockThreshold,
          isDiscounted: prod.isDiscounted, discountedPrice: prod.discountedPrice,
          productOptions: (prod.productOptions || []).map((o: any) => ({ title: o.title, price: o.price, inventory: o.inventory, trackQuantity: o.trackQuantity })),
          variants: (prod.variants || []).map((v: any) => ({ title: v.title, sku: v.sku, price: v.price, inventory: v.inventory, trackQuantity: v.trackQuantity })),
          subcategories: (prod.subcategories || []).map((s: any) => ({ name: s.name, basePrice: s.basePrice, inventory: s.inventory, variants: (s.variants || []).map((v: any) => ({ title: v.title, sku: v.sku, price: v.price, inventory: v.inventory })) })),
        };
      }
      case "update_product": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const updates: any = {};
        if (input.new_name !== undefined) updates.name = input.new_name;
        if (input.price !== undefined) updates.price = input.price;
        if (input.inventory !== undefined) updates.inventory = input.inventory;
        if (input.status !== undefined) updates.status = input.status;
        if (input.lowstockThreshold !== undefined) updates.lowstockThreshold = input.lowstockThreshold;
        if (input.trackQuantity !== undefined) updates.trackQuantity = input.trackQuantity;
        if (input.isDiscounted !== undefined) updates.isDiscounted = input.isDiscounted;
        if (input.discountedPrice !== undefined) updates.discountedPrice = input.discountedPrice;
        if (Object.keys(updates).length === 0) return { error: "No fields to update" };
        await this.productModel.findByIdAndUpdate(product._id, { $set: updates });
        const note = ((product.productOptions?.length || 0) > 0 || (product.variants?.length || 0) > 0 || (product.subcategories?.length || 0) > 0)
          ? "Note: this product has variants/options/subcategories — top-level fields updated, but variant prices/stock are separate. Use update_variant to edit them."
          : undefined;
        return { success: true, product: product.name, updated: updates, note };
      }
      case "update_variant": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const fields: any = {};
        for (const f of ["price", "inventory", "lowstockThreshold", "trackQuantity", "isDiscounted", "discountedPrice"]) {
          if (input[f] !== undefined) fields[f] = input[f];
        }
        if (Object.keys(fields).length === 0) return { error: "No fields to update" };
        const match = (v: any) => {
          const t = (v?.title || "").toLowerCase();
          const s = (v?.sku || "").toLowerCase();
          const q = (input.variant_title || "").toLowerCase();
          return t === q || s === q || t.includes(q) || s.includes(q);
        };
        let path: string | null = null;
        if (input.subcategory_name) {
          // Disambiguated — match variant only inside the named subcategory
          const sq = String(input.subcategory_name).toLowerCase();
          const si = (product.subcategories || []).findIndex((s: any) => (s.name || "").toLowerCase() === sq || (s.name || "").toLowerCase().includes(sq));
          if (si < 0) return { error: `Subcategory "${input.subcategory_name}" not found`, availableSubcategories: (product.subcategories || []).map((s: any) => s.name) };
          const vi = (product.subcategories[si].variants || []).findIndex(match);
          if (vi < 0) return { error: `Variant not found inside ${product.subcategories[si].name}`, availableVariants: (product.subcategories[si].variants || []).map((v: any) => v.title) };
          path = `subcategories.${si}.variants.${vi}`;
        } else {
          const topIdx = (product.variants || []).findIndex(match);
          if (topIdx >= 0) path = `variants.${topIdx}`;
          if (!path) {
            for (let si = 0; si < (product.subcategories || []).length; si++) {
              const vi = (product.subcategories[si].variants || []).findIndex(match);
              if (vi >= 0) { path = `subcategories.${si}.variants.${vi}`; break; }
            }
          }
        }
        if (!path) return { error: "Variant not found", availableVariants: [...(product.variants || []).map((v: any) => v.title), ...((product.subcategories || []).flatMap((s: any) => (s.variants || []).map((v: any) => `${s.name} > ${v.title}`)))] };
        const setDoc: any = {};
        for (const [k, v] of Object.entries(fields)) setDoc[`${path}.${k}`] = v;
        await this.productModel.findByIdAndUpdate(product._id, { $set: setDoc });
        return { success: true, product: product.name, variantPath: path, updated: fields };
      }
      case "update_subcategory": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const q = (input.subcategory_name || "").toLowerCase();
        const idx = (product.subcategories || []).findIndex((s: any) => (s.name || "").toLowerCase() === q || (s.name || "").toLowerCase().includes(q));
        if (idx < 0) return { error: "Subcategory not found", availableSubcategories: (product.subcategories || []).map((s: any) => s.name) };
        const setDoc: any = {};
        for (const f of ["basePrice", "additionalPrice", "inventory", "lowstockThreshold", "trackQuantity"]) {
          if (input[f] !== undefined) setDoc[`subcategories.${idx}.${f}`] = input[f];
        }
        if (Object.keys(setDoc).length === 0) return { error: "No fields to update" };
        await this.productModel.findByIdAndUpdate(product._id, { $set: setDoc });
        return { success: true, product: product.name, subcategory: product.subcategories[idx].name, updated: Object.keys(setDoc) };
      }
      case "update_option": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const q = (input.option_title || "").toLowerCase();
        const idx = (product.productOptions || []).findIndex((o: any) => (o.title || "").toLowerCase() === q || (o.title || "").toLowerCase().includes(q));
        if (idx < 0) return { error: "Option not found", availableOptions: (product.productOptions || []).map((o: any) => o.title) };
        const setDoc: any = {};
        for (const f of ["price", "inventory", "lowstockThreshold", "trackQuantity", "isDiscounted", "discountedPrice"]) {
          if (input[f] !== undefined) setDoc[`productOptions.${idx}.${f}`] = input[f];
        }
        if (Object.keys(setDoc).length === 0) return { error: "No fields to update" };
        await this.productModel.findByIdAndUpdate(product._id, { $set: setDoc });
        return { success: true, product: product.name, option: product.productOptions[idx].title, updated: Object.keys(setDoc) };
      }
      case "add_variant": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        if (!input.title || input.price === undefined) return { error: "title and price are required" };
        const variant = {
          id: Date.now(),
          title: String(input.title),
          price: Number(input.price),
          sku: input.sku ? String(input.sku) : `${product.name.slice(0, 3).toUpperCase()}-${String(input.title).slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
          inventory: input.inventory !== undefined ? Number(input.inventory) : 0,
          trackQuantity: !!input.trackQuantity,
          lowstockThreshold: input.lowstockThreshold !== undefined ? Number(input.lowstockThreshold) : 10,
          options: {},
        };
        if (input.subcategory_name) {
          const sq = String(input.subcategory_name).toLowerCase();
          const si = (product.subcategories || []).findIndex((s: any) => (s.name || "").toLowerCase() === sq || (s.name || "").toLowerCase().includes(sq));
          if (si < 0) return { error: `Subcategory "${input.subcategory_name}" not found`, availableSubcategories: (product.subcategories || []).map((s: any) => s.name) };
          await this.productModel.findByIdAndUpdate(product._id, { $push: { [`subcategories.${si}.variants`]: variant } });
          return { success: true, product: product.name, addedTo: `${product.subcategories[si].name} (subcategory)`, variant };
        }
        await this.productModel.findByIdAndUpdate(product._id, { $push: { variants: variant } });
        return { success: true, product: product.name, addedTo: "top-level variants", variant };
      }
      case "remove_variant": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const vq = String(input.variant_title || "").toLowerCase();
        const match = (v: any) => (v.title || "").toLowerCase() === vq || (v.title || "").toLowerCase().includes(vq) || (v.sku || "").toLowerCase() === vq;
        if (input.subcategory_name) {
          const sq = String(input.subcategory_name).toLowerCase();
          const si = (product.subcategories || []).findIndex((s: any) => (s.name || "").toLowerCase() === sq || (s.name || "").toLowerCase().includes(sq));
          if (si < 0) return { error: `Subcategory "${input.subcategory_name}" not found` };
          const v = (product.subcategories[si].variants || []).find(match);
          if (!v) return { error: `Variant "${input.variant_title}" not found in ${product.subcategories[si].name}`, availableVariants: (product.subcategories[si].variants || []).map((x: any) => x.title) };
          await this.productModel.findByIdAndUpdate(product._id, { $pull: { [`subcategories.${si}.variants`]: { id: v.id } } });
          return { success: true, product: product.name, removed: `${product.subcategories[si].name} > ${v.title}` };
        }
        const v = (product.variants || []).find(match);
        if (!v) return { error: `Variant "${input.variant_title}" not found`, availableVariants: (product.variants || []).map((x: any) => x.title) };
        await this.productModel.findByIdAndUpdate(product._id, { $pull: { variants: { id: v.id } } });
        return { success: true, product: product.name, removed: v.title };
      }
      case "add_subcategory": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        if (!input.name) return { error: "name is required" };
        const exists = (product.subcategories || []).some((s: any) => (s.name || "").toLowerCase() === String(input.name).toLowerCase());
        if (exists) return { error: `Subcategory "${input.name}" already exists on ${product.name}` };
        const sub = {
          id: Date.now(),
          name: String(input.name),
          basePrice: input.basePrice !== undefined ? Number(input.basePrice) : 0,
          inventory: input.inventory !== undefined ? Number(input.inventory) : 0,
          trackQuantity: !!input.trackQuantity,
          lowstockThreshold: input.lowstockThreshold !== undefined ? Number(input.lowstockThreshold) : 10,
          variants: [],
        };
        await this.productModel.findByIdAndUpdate(product._id, { $push: { subcategories: sub } });
        return { success: true, product: product.name, added: sub.name };
      }
      case "remove_subcategory": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const sq = String(input.subcategory_name || "").toLowerCase();
        const sc = (product.subcategories || []).find((s: any) => (s.name || "").toLowerCase() === sq || (s.name || "").toLowerCase().includes(sq));
        if (!sc) return { error: `Subcategory "${input.subcategory_name}" not found`, availableSubcategories: (product.subcategories || []).map((s: any) => s.name) };
        await this.productModel.findByIdAndUpdate(product._id, { $pull: { subcategories: { id: sc.id } } });
        return { success: true, product: product.name, removed: sc.name, removedVariantCount: (sc.variants || []).length };
      }
      case "add_option": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        if (!input.title || input.price === undefined) return { error: "title and price are required" };
        const exists = (product.productOptions || []).some((o: any) => (o.title || "").toLowerCase() === String(input.title).toLowerCase());
        if (exists) return { error: `Option "${input.title}" already exists on ${product.name}` };
        const opt = {
          id: Date.now(),
          title: String(input.title),
          price: Number(input.price),
          inventory: input.inventory !== undefined ? Number(input.inventory) : 0,
          trackQuantity: !!input.trackQuantity,
          lowstockThreshold: input.lowstockThreshold !== undefined ? Number(input.lowstockThreshold) : 10,
        };
        await this.productModel.findByIdAndUpdate(product._id, { $push: { productOptions: opt }, $set: { hasOptions: true } });
        return { success: true, product: product.name, added: opt.title };
      }
      case "remove_option": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const q = String(input.option_title || "").toLowerCase();
        const opt = (product.productOptions || []).find((o: any) => (o.title || "").toLowerCase() === q || (o.title || "").toLowerCase().includes(q));
        if (!opt) return { error: `Option "${input.option_title}" not found`, availableOptions: (product.productOptions || []).map((o: any) => o.title) };
        const remaining = (product.productOptions || []).filter((o: any) => o.id !== opt.id);
        await this.productModel.findByIdAndUpdate(product._id, {
          $pull: { productOptions: { id: opt.id } },
          $set: { hasOptions: remaining.length > 0 },
        });
        return { success: true, product: product.name, removed: opt.title };
      }
      case "delete_product": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        await this.productModel.findByIdAndUpdate(product._id, { $set: { isSoftDeleted: true, softDeletedAt: new Date() } });
        return { success: true, deleted: product.name };
      }
      case "confirm_payment_by_order_id": {
        const order: any = await this.orderModel.findOne({ shopkeeperId: sid, orderId: { $regex: input.order_id, $options: "i" }, isSoftDeleted: { $ne: true } });
        if (!order) return { error: "Order not found" };
        const payment: any = await this.paymentEmailModel.findOne({ shopkeeperId: sid, matchedOrderId: order.orderId, status: "matched" });
        if (!payment) return { error: "No matched payment awaiting confirmation for this order", hint: "Check if the payment email was received and matched, or use confirm_matched_payments to see the list." };
        await this.paymentEmailModel.findByIdAndUpdate(payment._id, { status: "confirmed" });
        order.status = "processing";
        order.statusHistory = [...(order.statusHistory || []), { status: "processing", changedAt: new Date(), changedBy: "KiosAI" }];
        await order.save();
        return { success: true, orderId: order.orderId, amount: payment.amount, newStatus: "processing" };
      }
      case "place_order": {
        if (!Array.isArray(input.items) || input.items.length === 0) return { error: "No items provided" };
        const resolved: any[] = [];
        for (const it of input.items) {
          if (!it?.product_name) return { error: "Each item needs a product_name" };
          const quantity = Number(it.quantity || 1);
          const prodMatches = await this.productModel.find({ shopkeeperId: sid, isSoftDeleted: { $ne: true }, name: { $regex: it.product_name, $options: "i" } }).lean();
          if (prodMatches.length === 0) return { error: `Product not found: "${it.product_name}"` };
          if (prodMatches.length > 1) return { error: `Multiple products matched "${it.product_name}"`, matches: prodMatches.slice(0, 5).map((p: any) => p.name) };
          const prod: any = prodMatches[0];

          // Resolve variant/subcategory/option against the tree.
          // Preferred: caller passes subcategory_name + variant_title together for tree products.
          // Fallback: single variant_title string tries each layer in turn.
          let price = prod.isDiscounted && prod.discountedPrice ? prod.discountedPrice : prod.price;
          let variantTitle: string | undefined;
          let subcategoryName: string | undefined;
          let optionTitle: string | undefined;
          let optionPrice: number | undefined;
          const avail = () => ({
            variants: (prod.variants || []).map((v: any) => v.title),
            subcategories: (prod.subcategories || []).map((sc: any) => sc.name),
            subcategoryVariants: (prod.subcategories || []).flatMap((sc: any) => (sc.variants || []).map((v: any) => `${sc.name} > ${v.title}`)),
            options: (prod.productOptions || []).map((o: any) => o.title),
          });

          if (it.subcategory_name) {
            const sq = String(it.subcategory_name).toLowerCase();
            const sc = (prod.subcategories || []).find((s: any) => (s.name || "").toLowerCase() === sq || (s.name || "").toLowerCase().includes(sq));
            if (!sc) return { error: `Subcategory "${it.subcategory_name}" not found on ${prod.name}`, available: avail() };
            subcategoryName = sc.name;
            if (it.variant_title) {
              const vq = String(it.variant_title).toLowerCase();
              const v = (sc.variants || []).find((x: any) => (x.title || "").toLowerCase() === vq || (x.title || "").toLowerCase().includes(vq) || (x.sku || "").toLowerCase().includes(vq));
              if (!v) return { error: `Variant "${it.variant_title}" not found inside ${prod.name} > ${sc.name}`, available: (sc.variants || []).map((x: any) => x.title) };
              variantTitle = v.title;
              price = v.isDiscounted && v.discountedPrice ? v.discountedPrice : v.price;
            } else {
              // Subcategory-only (uses basePrice)
              price = sc.basePrice ?? prod.price;
            }
          } else if (it.variant_title) {
            const q = String(it.variant_title).toLowerCase();
            // 1. Top-level variants
            const top = (prod.variants || []).find((v: any) => (v.title || "").toLowerCase().includes(q) || (v.sku || "").toLowerCase().includes(q));
            if (top) {
              price = top.isDiscounted && top.discountedPrice ? top.discountedPrice : top.price;
              variantTitle = top.title;
            }
            // 2. Subcategory > variants (match anywhere in the tree)
            if (!variantTitle) {
              for (const sc of (prod.subcategories || [])) {
                const scv = (sc.variants || []).find((v: any) => (v.title || "").toLowerCase().includes(q) || (v.sku || "").toLowerCase().includes(q));
                if (scv) {
                  price = scv.isDiscounted && scv.discountedPrice ? scv.discountedPrice : scv.price;
                  variantTitle = scv.title;
                  subcategoryName = sc.name;
                  break;
                }
              }
            }
            // 3. Subcategory by name
            if (!variantTitle && !subcategoryName) {
              const sc = (prod.subcategories || []).find((s: any) => (s.name || "").toLowerCase().includes(q));
              if (sc) {
                price = sc.basePrice ?? prod.price;
                subcategoryName = sc.name;
              }
            }
            // 4. productOptions (Size / Quantity / Pack)
            if (!variantTitle && !subcategoryName) {
              const opt = (prod.productOptions || []).find((o: any) => (o.title || "").toLowerCase().includes(q));
              if (opt) {
                price = opt.isDiscounted && opt.discountedPrice ? opt.discountedPrice : opt.price;
                optionTitle = opt.title;
                optionPrice = opt.price;
              }
            }
            // 5. Fallback: auto-split multi-word descriptors as subcategory + variant.
            // Handles "Veg Medium", "Summer Red L", etc. where the LLM didn't use
            // subcategory_name explicitly. Tries each subcategory whose name is a
            // prefix of the descriptor, then looks for the remainder in its variants.
            if (!variantTitle && !subcategoryName && !optionTitle && q.includes(" ")) {
              outer: for (const sc of (prod.subcategories || [])) {
                const scName = (sc.name || "").toLowerCase();
                if (!scName || !q.startsWith(scName + " ")) continue;
                const remainder = q.slice(scName.length).trim();
                for (const v of (sc.variants || [])) {
                  const vt = (v.title || "").toLowerCase();
                  const vs = (v.sku || "").toLowerCase();
                  if (vt === remainder || vt.includes(remainder) || vs === remainder) {
                    price = v.isDiscounted && v.discountedPrice ? v.discountedPrice : v.price;
                    variantTitle = v.title;
                    subcategoryName = sc.name;
                    break outer;
                  }
                }
              }
            }
            if (!variantTitle && !subcategoryName && !optionTitle) {
              return { error: `No variant/subcategory/option matching "${it.variant_title}" on ${prod.name}`, available: avail() };
            }
          } else if ((prod.subcategories || []).length > 0 || (prod.variants || []).length > 0 || (prod.productOptions || []).length > 0) {
            // Tree product but caller didn't pick a leaf — fail fast with candidates.
            return { error: `"${prod.name}" has variants/subcategories/options — specify which one`, available: avail() };
          }
          resolved.push({
            productId: prod._id.toString(),
            productName: prod.name,
            price,
            quantity,
            variantTitle,
            subcategoryName,
            optionTitle,
            optionPrice,
            image: prod.images?.[0],
            trackQuantity: !!prod.trackQuantity,
          });
        }
        // Match Kiosk UI's total calculation: subtotal → discount → + tax
        const subtotal = resolved.reduce((s, r) => s + (r.price || 0) * (r.quantity || 0), 0);
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const discountPct = Number(sk?.discountPercentage || 0);
        const taxPct = Number(sk?.taxPercentage || 0);
        const discount = (subtotal * discountPct) / 100;
        const afterDiscount = subtotal - discount;
        const tax = (afterDiscount * taxPct) / 100;
        const totalAmount = Math.round((afterDiscount + tax) * 100) / 100;

        const paymentMethod = String(input.payment_method || "qr").toLowerCase();
        const isCash = paymentMethod === "cash";
        const orderId = `KIOSAI-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const nameParts = String(input.customer_name || "").trim().split(/\s+/);
        const now = new Date();
        const pickupDate = now.toISOString().split("T")[0];
        const pickupTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const whatsAppNumber = input.whatsapp || "kiosk-order";
        try {
          // Resolve user by WhatsApp number, same pattern as OrdersService.createOrder.
          // For walk-in kiosk orders without a whatsapp, we reuse a single placeholder
          // "kiosk-order" user per shopkeeper's system to satisfy the required userId.
          const email = input.email ? String(input.email).trim().toLowerCase() : undefined;
          let user: any = await this.userModel.findOne({ whatsAppNumber }).lean();
          if (!user) {
            user = await this.userModel.create({
              name: input.customer_name || "Kiosk Customer",
              email: email || null,
              password: null,
              provider: "kiosk",
              providerId: null,
              whatsAppNumber,
            });
          } else if (email && !user.email) {
            // Backfill email on an existing phone-only user
            await this.userModel.updateOne({ _id: user._id }, { $set: { email } });
            user.email = email;
          }
          const order: any = await this.orderModel.create({
            orderId,
            userId: user._id.toString(),
            shopkeeperId: sid,
            items: resolved,
            totalAmount,
            orderType: "pickup",
            pickupDate,
            pickupTime,
            whatsAppNumber,
            fullName: input.customer_name,
            firstName: nameParts[0] || input.customer_name,
            lastName: nameParts.slice(1).join(" ") || "",
            customerName: input.customer_name,
            customerWhatsApp: whatsAppNumber !== "kiosk-order" ? whatsAppNumber : undefined,
            customerEmail: email,
            status: isCash ? "processing" : "pending",
            paymentConfirmed: isCash,
            instructions: input.instructions || undefined,
            statusHistory: [{ status: isCash ? "processing" : "pending", changedAt: new Date(), changedBy: "KiosAI" }],
          });
          for (const r of resolved) {
            if (!r.trackQuantity) continue;
            try {
              if (r.variantTitle && r.subcategoryName) {
                await this.productModel.updateOne(
                  { _id: r.productId, "subcategories.name": r.subcategoryName, "subcategories.variants.title": r.variantTitle },
                  { $inc: { "subcategories.$[sc].variants.$[v].inventory": -r.quantity } },
                  { arrayFilters: [{ "sc.name": r.subcategoryName }, { "v.title": r.variantTitle }] } as any,
                );
              } else if (r.variantTitle) {
                await this.productModel.updateOne(
                  { _id: r.productId, "variants.title": r.variantTitle },
                  { $inc: { "variants.$.inventory": -r.quantity } },
                );
              } else if (r.subcategoryName) {
                await this.productModel.updateOne(
                  { _id: r.productId, "subcategories.name": r.subcategoryName },
                  { $inc: { "subcategories.$.inventory": -r.quantity } },
                );
              } else {
                await this.productModel.updateOne({ _id: r.productId }, { $inc: { inventory: -r.quantity } });
              }
            } catch (invErr) {
              this.logger.warn(`Inventory decrement failed for ${r.productName}: ${(invErr as any)?.message}`);
            }
          }
          return {
            success: true,
            orderId: order.orderId,
            customer: input.customer_name,
            paymentMethod,
            paymentConfirmed: isCash,
            breakdown: {
              subtotal: Math.round(subtotal * 100) / 100,
              discountPercentage: discountPct,
              discount: Math.round(discount * 100) / 100,
              taxPercentage: taxPct,
              tax: Math.round(tax * 100) / 100,
              total: totalAmount,
            },
            items: resolved.map(r => ({ name: r.productName, variant: r.variantTitle, subcategory: r.subcategoryName, qty: r.quantity, price: r.price })),
            nextStep: isCash
              ? "Call get_order_receipt with this orderId to provide a PDF receipt."
              : "Call get_payment_qr with this orderId to show the customer a QR code.",
          };
        } catch (err: any) {
          return { error: `Failed to create order: ${err.message}` };
        }
      }
      case "get_payment_qr": {
        const order: any = await this.orderModel.findOne({ shopkeeperId: sid, orderId: { $regex: input.order_id, $options: "i" }, isSoftDeleted: { $ne: true } }).lean();
        if (!order) return { error: "Order not found" };
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const rawCountry = (sk?.country || "IN").toString().trim().toUpperCase();
        const country = rawCountry.startsWith("SG") || rawCountry.startsWith("SING") ? "SG" : "IN";
        return {
          orderId: order.orderId,
          amount: order.totalAmount,
          country,
          shopName: sk?.shopName,
          shopkeeperPhone: country === "SG" ? sk?.whatsappNumber : undefined,
          paymentURL: country === "IN" ? sk?.paymentURL : undefined,
          message: country === "SG" ? "PayNow QR will be shown." : "UPI QR will be shown.",
        };
      }
      case "get_order_receipt": {
        const order: any = await this.orderModel.findOne({ shopkeeperId: sid, orderId: { $regex: input.order_id, $options: "i" }, isSoftDeleted: { $ne: true } }).lean();
        if (!order) return { error: "Order not found" };
        // Receipt endpoint returns the PDF; the frontend can embed or open in a new tab.
        const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
        return {
          orderId: order.orderId,
          receiptUrl: `${baseUrl}/orders/${order._id}/receipt`,
          message: "Share this URL with the customer, or open it to view/print the receipt.",
        };
      }
      case "get_analytics": {
        try {
          const r = await fetch(`http://localhost:${process.env.PORT || 3000}/shopkeeper/analytics/${sid}/report/${input.period}`);
          if (!r.ok) return { error: "Failed" };
          const d = (await r.json()).data;
          return { revenue: d.totalRevenue, orders: d.totalOrders, customers: d.totalCustomers, avgOrder: d.avgOrderValue, items: d.totalItems, currency: d.currencySymbol, topProducts: d.topProducts?.slice(0, 5) };
        } catch { return { error: "Unavailable" }; }
      }
      case "get_today_revenue": {
        const s = new Date(); s.setHours(0, 0, 0, 0);
        const orders = await this.orderModel.find({ shopkeeperId: sid, createdAt: { $gte: s }, isSoftDeleted: { $ne: true } }).lean();
        return { revenue: orders.reduce((a: number, o: any) => a + (o.totalAmount || 0), 0), orderCount: orders.length };
      }
      case "get_top_products": {
        const agg = await this.orderModel.aggregate([
          { $match: { shopkeeperId: sid, isSoftDeleted: { $ne: true } } }, { $unwind: "$cartItems" },
          { $group: { _id: "$cartItems.title", totalQty: { $sum: "$cartItems.quantity" }, revenue: { $sum: { $multiply: ["$cartItems.price", "$cartItems.quantity"] } } } },
          { $sort: { revenue: -1 } }, { $limit: 5 },
        ]);
        return agg.map((p: any) => ({ name: p._id, sold: p.totalQty, revenue: p.revenue }));
      }
      case "get_payment_summary": {
        const [u, m, c, ig] = await Promise.all([
          this.paymentEmailModel.countDocuments({ shopkeeperId: sid, status: "unmatched" }),
          this.paymentEmailModel.countDocuments({ shopkeeperId: sid, status: "matched" }),
          this.paymentEmailModel.countDocuments({ shopkeeperId: sid, status: "confirmed" }),
          this.paymentEmailModel.countDocuments({ shopkeeperId: sid, status: "ignored" }),
        ]);
        return { unmatched: u, matched: m, confirmed: c, ignored: ig, total: u + m + c + ig };
      }
      case "confirm_matched_payments": {
        const matched = await this.paymentEmailModel.find({ shopkeeperId: sid, status: "matched", matchedOrderId: { $ne: null } }).lean();
        let count = 0;
        for (const pe of matched) {
          await this.paymentEmailModel.findByIdAndUpdate(pe._id, { status: "confirmed" });
          await this.orderModel.findOneAndUpdate({ orderId: pe.matchedOrderId, status: "pending" }, { status: "processing", $push: { statusHistory: { status: "processing", changedAt: new Date(), changedBy: "KiosAI" } } });
          count++;
        }
        return { confirmed: count };
      }
      case "get_matched_payments": {
        const p = await this.paymentEmailModel.find({ shopkeeperId: sid, status: "matched", matchedOrderId: { $ne: null } }).sort({ receivedAt: -1 }).limit(10).lean();
        return p.map((x: any) => ({ amount: x.amount, sender: x.senderName || x.from, orderId: x.matchedOrderId, provider: x.bankOrProvider }));
      }
      case "get_unmatched_payments": {
        const p = await this.paymentEmailModel.find({ shopkeeperId: sid, status: "unmatched" }).sort({ receivedAt: -1 }).limit(10).lean();
        return p.map((x: any) => ({ amount: x.amount, sender: x.senderName || x.from, provider: x.bankOrProvider }));
      }
      case "get_customers": {
        const agg = await this.orderModel.aggregate([{ $match: { shopkeeperId: sid, isSoftDeleted: { $ne: true } } }, { $group: { _id: "$userId" } }]);
        return { totalCustomers: agg.length };
      }
      case "get_coupons": {
        const c = await this.couponModel.find({ shopkeeperId: sid, isDeleted: false, isActive: true }).lean();
        return c.map((x: any) => ({ code: x.code, type: x.discountType, value: x.discountType === "PERCENTAGE" ? x.discountPercentage + "%" : "$" + x.flatDiscountAmount, used: x.usedCount, max: x.maxUsage || "unlimited" }));
      }
      case "get_plan_info": {
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        if (!sk?.planId) return { subscribed: false };
        const plan: any = await this.planModel.findById(sk.planId).lean();
        const exp = sk.planExpiryDate ? new Date(sk.planExpiryDate) : null;
        return { planName: plan?.planName, price: sk.pricePaid, daysLeft: exp ? Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000)) : 0, expires: exp?.toLocaleDateString() };
      }
      case "get_operators": {
        const ops = await this.operatorModel.find({ shopkeeperId: sid, isSoftDeleted: { $ne: true } }).lean();
        return ops.map((o: any) => ({ name: o.name, phone: o.whatsAppNumber, email: o.email }));
      }
      case "get_shop_info": {
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        return { shopName: sk?.shopName, owner: sk?.name, category: sk?.businessCategory, phone: sk?.phone, whatsapp: sk?.whatsappNumber, address: sk?.address };
      }
      case "navigate_to":
        return { navigating: true, tab: input.tab };
      default:
        return { error: "Unknown tool" };
    }
  }

  private async fallbackKeyword(sid: string, msg: string): Promise<BotResponse> {
    const m = msg.toLowerCase();
    if (m.includes("hi") || m.includes("hello") || m.includes("help")) {
      return {
        text: "Hi! I'm **KiosAI** — your store assistant. I can help with orders, products, analytics, payments, and more!",
        quickActions: [
          { label: "Today's Orders", action: "show today's orders" },
          { label: "Revenue", action: "today's revenue" },
          { label: "Products", action: "show products" },
          { label: "Payments", action: "payment summary" },
          { label: "Analytics", action: "this month report" },
          { label: "Add Product", action: "add product" },
        ],
      };
    }
    if (m.includes("pending")) {
      const orders = await this.orderModel.find({ shopkeeperId: sid, status: "pending", isSoftDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(5).lean();
      const list = orders.map((o: any, i: number) => `${i + 1}. **#${o.orderId}** — $${o.totalAmount?.toFixed(2)}`).join("\n");
      return { text: orders.length ? `⏳ **${orders.length} Pending:**\n\n${list}` : "No pending orders!" };
    }
    if (m.includes("revenue") || m.includes("earning")) {
      const s = new Date(); s.setHours(0, 0, 0, 0);
      const orders = await this.orderModel.find({ shopkeeperId: sid, createdAt: { $gte: s }, isSoftDeleted: { $ne: true } }).lean();
      return { text: `💰 Today: **$${orders.reduce((a: number, o: any) => a + (o.totalAmount || 0), 0).toFixed(2)}** from ${orders.length} orders` };
    }
    if (m.includes("product")) {
      const total = await this.productModel.countDocuments({ shopkeeperId: sid, isSoftDeleted: { $ne: true } });
      return { text: `📦 You have **${total}** products.`, quickActions: [{ label: "Show All", action: "show all products" }, { label: "Add Product", action: "add product" }] };
    }
    if (m.includes("confirm") && m.includes("payment")) {
      const matched = await this.paymentEmailModel.find({ shopkeeperId: sid, status: "matched", matchedOrderId: { $ne: null } }).lean();
      if (matched.length === 0) return { text: "No matched payments to confirm." };
      let c = 0;
      for (const pe of matched) {
        await this.paymentEmailModel.findByIdAndUpdate(pe._id, { status: "confirmed" });
        await this.orderModel.findOneAndUpdate({ orderId: pe.matchedOrderId, status: "pending" }, { status: "processing" });
        c++;
      }
      return { text: `✅ **${c} payments confirmed!** Orders moved to processing.` };
    }
    return {
      text: "I can help with orders, products, payments, analytics & more. What do you need?",
      quickActions: [{ label: "Orders", action: "today's orders" }, { label: "Revenue", action: "today's revenue" }, { label: "Products", action: "show products" }, { label: "Payments", action: "payment summary" }],
    };
  }
}
