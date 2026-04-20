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

@Injectable()
export class ChatbotService {
  private logger = new Logger(ChatbotService.name);
  private ai: OpenAI;

  constructor(
    @InjectModel("Product") private productModel: Model<any>,
    @InjectModel("Order") private orderModel: Model<any>,
    @InjectModel("Shopkeeper") private shopkeeperModel: Model<any>,
    @InjectModel("Coupon") private couponModel: Model<any>,
    @InjectModel("Operator") private operatorModel: Model<any>,
    @InjectModel("Plan") private planModel: Model<any>,
    @InjectModel("PaymentEmail") private paymentEmailModel: Model<any>,
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
    { type: "function", function: { name: "update_variant", description: "Update a specific variant inside a product (matched by variant title or SKU). Works for product-level variants and variants nested inside a subcategory.", parameters: { type: "object", properties: { product_name: { type: "string" }, variant_title: { type: "string", description: "Variant title or SKU to match" }, price: { type: "number" }, inventory: { type: "number" }, lowstockThreshold: { type: "number" }, trackQuantity: { type: "boolean" }, isDiscounted: { type: "boolean" }, discountedPrice: { type: "number" } }, required: ["product_name", "variant_title"] } } },
    { type: "function", function: { name: "update_subcategory", description: "Update a subcategory inside a product (matched by name). Edits subcategory-level fields like basePrice and inventory.", parameters: { type: "object", properties: { product_name: { type: "string" }, subcategory_name: { type: "string" }, basePrice: { type: "number" }, additionalPrice: { type: "number" }, inventory: { type: "number" }, lowstockThreshold: { type: "number" }, trackQuantity: { type: "boolean" } }, required: ["product_name", "subcategory_name"] } } },
    { type: "function", function: { name: "update_option", description: "Update a product option (e.g. Size/Quantity/Pack) by its title. Only for products that have productOptions.", parameters: { type: "object", properties: { product_name: { type: "string" }, option_title: { type: "string" }, price: { type: "number" }, inventory: { type: "number" }, lowstockThreshold: { type: "number" }, trackQuantity: { type: "boolean" }, isDiscounted: { type: "boolean" }, discountedPrice: { type: "number" } }, required: ["product_name", "option_title"] } } },
    { type: "function", function: { name: "delete_product", description: "Soft-delete a product by name. Asks for confirmation implicitly — only call if user clearly said to delete/remove.", parameters: { type: "object", properties: { product_name: { type: "string" } }, required: ["product_name"] } } },
    { type: "function", function: { name: "confirm_payment_by_order_id", description: "Confirm a single matched payment for a specific order — moves that order from pending to processing. Only works when a payment email already matched that order.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
    { type: "function", function: { name: "place_order", description: "Create a new order for a walk-in / phoned-in customer. Looks up each product by name, resolves variants if given, builds the cart, and creates a pending order. Returns the new orderId. Follow with get_payment_qr to show the customer a payment QR.", parameters: { type: "object", properties: { customer_name: { type: "string" }, whatsapp: { type: "string", description: "Optional WhatsApp number" }, items: { type: "array", items: { type: "object", properties: { product_name: { type: "string" }, variant_title: { type: "string", description: "Optional: variant/size/subcategory name if the product has variants" }, quantity: { type: "number" } }, required: ["product_name", "quantity"] } } }, required: ["customer_name", "items"] } } },
    { type: "function", function: { name: "get_payment_qr", description: "Generate a payment QR for an existing order. Returns UPI payload for India or PayNow data for Singapore, based on shopkeeper's country setting. Always call this AFTER place_order.", parameters: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } } },
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

  async processMessage(shopkeeperId: string, message: string): Promise<BotResponse> {
    try {
      if (!this.hasApiKey()) {
        return this.fallbackKeyword(shopkeeperId, message);
      }

      const shopkeeper: any = await this.shopkeeperModel.findById(shopkeeperId).lean();
      const shopName = shopkeeper?.shopName || "Store";

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `You are KiosAI, a smart store assistant for "${shopName}" on KiosCart. Help the shopkeeper manage their store.

Rules:
- Be concise. Use **bold** for key numbers.
- Always use tools to get real data — never make up numbers.
- Number lists. Use emojis sparingly.
- Suggest 2-3 follow-up actions in your response text.
- Product edits: update_product for top-level fields. For specific variants/sizes/packs, call get_product_detail first to see the structure, then use update_variant, update_subcategory, or update_option. Use delete_product only when the user clearly asks to delete.
- Placing an order: when shopkeeper says "place order for <name>: <items>", call place_order with the items. If an item mentions a size/variant (e.g. "Large", "500ml", "Pack of 2"), include it as variant_title. After place_order succeeds, immediately call get_payment_qr with the returned orderId so the customer sees a QR to pay. If place_order returns a product/variant ambiguity, show the shopkeeper the candidates and ask which one.
- Payment confirmation: "confirm payment for order X" → confirm_payment_by_order_id. "confirm all matched payments" → confirm_matched_payments.
- For creating new products, editing images, or editing coupons, use navigate_to.
- Handle Hindi/Hinglish naturally (aaj ka order = today's orders).`,
        },
        { role: "user", content: message },
      ];

      const response = await this.ai.chat.completions.create({
        model: this.model,
        messages,
        tools: this.tools,
        tool_choice: "auto",
        max_tokens: 1024,
      });

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

        const followUp = await this.ai.chat.completions.create({
          model: this.model,
          messages: toolMessages,
          max_tokens: 1024,
        });

        const text = (followUp.choices[0].message as any).content || "Done!";
        return { text, quickActions: this.suggestActions(message), botAction };
      }

      return {
        text: assistantMsg.content || "How can I help you?",
        quickActions: this.suggestActions(message),
        botAction,
      };
    } catch (error) {
      const detail = error?.response?.data?.error?.failed_generation || error?.error?.failed_generation || "";
      this.logger.error(`AI Error: ${error.message}${detail ? ` | failed_generation: ${JSON.stringify(detail).slice(0, 500)}` : ""}`);
      return this.fallbackKeyword(shopkeeperId, message);
    }
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
        const topIdx = (product.variants || []).findIndex(match);
        if (topIdx >= 0) path = `variants.${topIdx}`;
        if (!path) {
          for (let si = 0; si < (product.subcategories || []).length; si++) {
            const vi = (product.subcategories[si].variants || []).findIndex(match);
            if (vi >= 0) { path = `subcategories.${si}.variants.${vi}`; break; }
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
          if (!it?.product_name || !it?.quantity) return { error: "Each item needs product_name and quantity" };
          const prodMatches = await this.productModel.find({ shopkeeperId: sid, isSoftDeleted: { $ne: true }, name: { $regex: it.product_name, $options: "i" } }).lean();
          if (prodMatches.length === 0) return { error: `Product not found: "${it.product_name}"` };
          if (prodMatches.length > 1) return { error: `Multiple products matched "${it.product_name}"`, matches: prodMatches.slice(0, 5).map((p: any) => p.name) };
          const prod: any = prodMatches[0];
          let price = prod.price;
          let variantTitle: string | undefined;
          let subcategoryName: string | undefined;
          if (it.variant_title) {
            const q = String(it.variant_title).toLowerCase();
            const top = (prod.variants || []).find((v: any) => (v.title || "").toLowerCase().includes(q) || (v.sku || "").toLowerCase().includes(q));
            if (top) {
              price = top.price;
              variantTitle = top.title;
            } else {
              for (const sc of (prod.subcategories || [])) {
                const scv = (sc.variants || []).find((v: any) => (v.title || "").toLowerCase().includes(q) || (v.sku || "").toLowerCase().includes(q));
                if (scv) {
                  price = scv.price;
                  variantTitle = scv.title;
                  subcategoryName = sc.name;
                  break;
                }
              }
              if (!variantTitle) {
                const sc = (prod.subcategories || []).find((s: any) => (s.name || "").toLowerCase().includes(q));
                if (sc) {
                  price = sc.basePrice ?? prod.price;
                  subcategoryName = sc.name;
                }
              }
            }
            if (!variantTitle && !subcategoryName) {
              return {
                error: `Variant "${it.variant_title}" not found for ${prod.name}`,
                availableVariants: [
                  ...((prod.variants || []).map((v: any) => v.title)),
                  ...((prod.subcategories || []).flatMap((sc: any) => [sc.name, ...((sc.variants || []).map((v: any) => `${sc.name} > ${v.title}`))])),
                ],
              };
            }
          }
          resolved.push({
            productId: prod._id.toString(),
            productName: prod.name,
            price,
            quantity: Number(it.quantity),
            variantTitle,
            subcategoryName,
            image: prod.images?.[0],
            trackQuantity: !!prod.trackQuantity,
          });
        }
        const totalAmount = resolved.reduce((s, r) => s + (r.price || 0) * (r.quantity || 0), 0);
        const orderId = `KIOSAI-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const nameParts = String(input.customer_name || "").trim().split(/\s+/);
        try {
          const order: any = await this.orderModel.create({
            orderId,
            shopkeeperId: sid,
            items: resolved,
            totalAmount,
            orderType: "pickup",
            whatsAppNumber: input.whatsapp || "kiosk-order",
            fullName: input.customer_name,
            firstName: nameParts[0] || input.customer_name,
            lastName: nameParts.slice(1).join(" ") || "",
            status: "pending",
            paymentConfirmed: false,
            statusHistory: [{ status: "pending", changedAt: new Date(), changedBy: "KiosAI" }],
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
            totalAmount,
            customer: input.customer_name,
            items: resolved.map(r => ({ name: r.productName, variant: r.variantTitle, subcategory: r.subcategoryName, qty: r.quantity, price: r.price })),
            nextStep: "Call get_payment_qr with this orderId to show the customer a QR code.",
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
