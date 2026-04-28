import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import OpenAI from "openai";

export interface QuickAction {
  label: string;
  action: string;
}
export type BotAction =
  | {
      type: "navigate";
      tab: string;
      // When present, the target tab should open a specific sub-UI on mount.
      // "add" → open the empty Add form. "edit" → open the Edit form for
      // productName (products tab only for now).
      action?: "add" | "edit";
      productName?: string;
      // CRM-tab only: pre-fill the Add Customer form with these fields.
      customerPrefill?: {
        firstName?: string;
        lastName?: string;
        whatsapp?: string;
        email?: string;
      };
    }
  | {
      type: "showQR";
      orderId: string;
      // Mongo _id of the order, used by the widget to hit /orders/:id/receipt
      // for download. The human-readable orderId field doesn't work as that
      // endpoint's :id param.
      orderMongoId?: string;
      amount: number;
      country: string;
      shopName?: string;
      shopkeeperPhone?: string;
      paymentURL?: string;
    }
  | {
      // Cash-order confirmation. The widget renders a standalone Download
      // Receipt pill (A4 / 58mm) keyed on the order's Mongo _id, mirroring
      // the receipt picker that lives inside the QR card for QR orders.
      type: "showReceipt";
      orderId: string;
      orderMongoId: string;
      amount: number;
      // Country drives the currency symbol the pill displays next to the
      // amount ("₹" for India, "S$" for Singapore).
      country?: "IN" | "SG";
    };
export interface ProductTreeItem {
  name: string;
  price: number;
  status?: string;
  inventory?: number;
  category?: string;
  variants?: { title: string; price: number; inventory?: number }[];
  subcategories?: {
    name: string;
    basePrice?: number;
    variants?: { title: string; price: number; inventory?: number }[];
  }[];
  options?: { title: string; price: number; inventory?: number }[];
}
export interface AnalyticsSummary {
  // Mirrors the cards on the Analytics page: revenue / orders / avg / customers.
  revenue: number;
  orders: number;
  avgOrder: number;
  customers: number;
  currency: string;
  period?: string; // monthly / lastmonth / today / etc.
  topProducts?: { name: string; sold?: number; revenue?: number }[];
  // What these numbers describe — drives card label switching in the widget.
  // "shop" = whole-shop snapshot (default), "product" = single product,
  // "customer" = single customer.
  subject?: "shop" | "product" | "customer";
  subjectName?: string;
}
export interface CustomerFormPayload {
  // Pre-fill values for the inline Add Customer form rendered in the chat.
  // The chat widget POSTs the submitted form to
  // /users/create-user-by-shopkeeper/:sid using the JWT in sessionStorage.
  firstName?: string;
  lastName?: string;
  whatsapp?: string;
  email?: string;
}
// Inline kiosk-order form rendered inside the chat. The form is purely a
// data collector: when the shopkeeper clicks Submit, the widget synthesises
// a natural-language "Place order for …" message and sends it through the
// regular chat pipeline, so the LLM-driven kiosk specialist + place_order
// tool do the heavy lifting (fuzzy product matching, multi-layer resolution,
// inventory decrement, QR generation). That way the structured UI eliminates
// freeform-typing errors but the AI still owns execution.
export interface OrderFormCatalogItem {
  name: string;
  price: number;
  category?: string;
  // Tree fields — frontend uses these to drive cascading dropdowns.
  productOptions?: { title: string; price: number }[];
  variants?: { title: string; price: number }[];
  subcategories?: {
    name: string;
    basePrice?: number;
    variants?: { title: string; price: number }[];
  }[];
}
export interface OrderFormPayload {
  country: "IN" | "SG";
  catalog: OrderFormCatalogItem[];
  // Whether QR payment can actually render a working QR for this shopkeeper.
  // India needs a paymentURL (uploaded UPI QR image). Singapore needs a
  // whatsappNumber (PayNow). When false, the inline form forces Cash and
  // shows a setup hint linking the shopkeeper to Settings.
  qrReady: boolean;
  qrSetupHint?: string;
}
export interface BotResponse {
  text: string;
  quickActions?: QuickAction[];
  botAction?: BotAction;
  productTree?: ProductTreeItem[];
  analytics?: AnalyticsSummary;
  customerForm?: CustomerFormPayload;
  orderForm?: OrderFormPayload;
}

interface ConvEntry {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

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
    // Provider priority: Qwen (Alibaba DashScope) if key is set, else Groq.
    // Qwen's free/paid tiers are more generous and its tool-calling is more
    // reliable than Groq's 8B fallback.
    const useQwen = !!process.env.QWEN_API_KEY;
    const apiKey = useQwen
      ? process.env.QWEN_API_KEY
      : process.env.GROQ_API_KEY || "";
    const baseURL = useQwen
      ? process.env.QWEN_BASE_URL ||
        "https://dashscope.aliyuncs.com/compatible-mode/v1"
      : "https://api.groq.com/openai/v1";
    this.ai = new OpenAI({ apiKey, baseURL });
    this.provider = useQwen ? "qwen" : "groq";
  }

  private provider: "qwen" | "groq" = "groq";

  private get model() {
    if (this.provider === "qwen") return process.env.QWEN_MODEL || "qwen-plus";
    return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  }

  // Small/cheap model used for routing (classification only).
  private get routerModel() {
    if (this.provider === "qwen")
      return process.env.QWEN_ROUTER_MODEL || "qwen-turbo";
    return process.env.GROQ_ROUTER_MODEL || "llama-3.1-8b-instant";
  }

  // Fallback model used when the primary returns 429 (daily TPD exceeded).
  private get fallbackModel() {
    if (this.provider === "qwen")
      return process.env.QWEN_FALLBACK_MODEL || "qwen-turbo";
    return process.env.GROQ_FALLBACK_MODEL || "llama-3.1-8b-instant";
  }

  private isRateLimit(err: any): boolean {
    const status = err?.status || err?.response?.status;
    return (
      status === 429 ||
      /rate limit|TPD|tokens per day/i.test(err?.message || "")
    );
  }

  private hasApiKey() {
    return !!(process.env.QWEN_API_KEY || process.env.GROQ_API_KEY);
  }

  private tools: OpenAI.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_today_orders",
        description:
          "Get today's orders summary — count, revenue, pending/completed breakdown",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_pending_orders",
        description: "Get list of pending orders",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_recent_orders",
        description: "Get recent orders",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_order_detail",
        description: "Get details of a specific order by ID",
        parameters: {
          type: "object",
          properties: { order_id: { type: "string" } },
          required: ["order_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_order_status",
        description:
          "Update order status (processing/ready/completed/cancelled)",
        parameters: {
          type: "object",
          properties: {
            order_id: { type: "string" },
            status: {
              type: "string",
              enum: ["processing", "ready", "completed", "cancelled"],
            },
          },
          required: ["order_id", "status"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_products",
        description: "Get shopkeeper's products list",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_product_count",
        description: "Get product counts",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_low_stock",
        description: "Get products with low stock",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_product_detail",
        description:
          "Get full structure of a single product — including its variants, subcategories, and options. Use this before editing when the user mentions a variant, size, or pack.",
        parameters: {
          type: "object",
          properties: {
            product_name: {
              type: "string",
              description: "Name or partial name of the product",
            },
          },
          required: ["product_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_product",
        description:
          "Update a product's top-level fields. Works on any product regardless of variants. To edit a specific variant/subcategory/option, use the dedicated tool instead.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            new_name: { type: "string" },
            price: { type: "number" },
            inventory: { type: "number" },
            status: { type: "string", enum: ["active", "draft", "archived"] },
            lowstockThreshold: { type: "number" },
            trackQuantity: { type: "boolean" },
            isDiscounted: { type: "boolean" },
            discountedPrice: { type: "number" },
            description: { type: "string" },
            barcode: { type: "string" },
            measurement: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
              description:
                "Replaces the full tags list. Pass the complete new array.",
            },
          },
          required: ["product_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_product",
        description:
          "Create a new simple product (no images, no variants). Use when the shopkeeper wants to add a quick catalog entry. For image upload / complex variants, navigate_to the products tab.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            price: { type: "number" },
            category: {
              type: "string",
              description:
                "Required. Pick a category the shop already uses (e.g. food, clothing, etc).",
            },
            sku: {
              type: "string",
              description: "Optional — auto-generated if omitted.",
            },
            status: {
              type: "string",
              enum: ["active", "draft", "archived"],
              description: "Defaults to active.",
            },
            description: { type: "string" },
            inventory: { type: "number" },
            trackQuantity: { type: "boolean" },
            lowstockThreshold: { type: "number" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["name", "price", "category"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "bulk_update_products_status",
        description:
          "Change status (active/draft/archived) for multiple products at once — e.g. archive a seasonal line.",
        parameters: {
          type: "object",
          properties: {
            product_names: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["active", "draft", "archived"] },
          },
          required: ["product_names", "status"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "bulk_delete_products",
        description: "Soft-delete multiple products by name in one call.",
        parameters: {
          type: "object",
          properties: {
            product_names: { type: "array", items: { type: "string" } },
          },
          required: ["product_names"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_variant",
        description:
          "Update a variant inside a product by title or SKU. For tree-structured products with the same variant title under multiple subcategories (e.g. Veg>Medium and Non-Veg>Medium), pass subcategory_name to disambiguate.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            variant_title: {
              type: "string",
              description: "Variant title or SKU to match",
            },
            subcategory_name: {
              type: "string",
              description:
                "Optional: restrict the match to a specific subcategory",
            },
            price: { type: "number" },
            inventory: { type: "number" },
            lowstockThreshold: { type: "number" },
            trackQuantity: { type: "boolean" },
            isDiscounted: { type: "boolean" },
            discountedPrice: { type: "number" },
          },
          required: ["product_name", "variant_title"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_subcategory",
        description:
          "Update a subcategory inside a product (matched by name). Edits subcategory-level fields like basePrice and inventory.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            subcategory_name: { type: "string" },
            basePrice: { type: "number" },
            additionalPrice: { type: "number" },
            inventory: { type: "number" },
            lowstockThreshold: { type: "number" },
            trackQuantity: { type: "boolean" },
          },
          required: ["product_name", "subcategory_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_option",
        description:
          "Update a product option (e.g. Size/Quantity/Pack) by its title. Only for products that have productOptions.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            option_title: { type: "string" },
            price: { type: "number" },
            inventory: { type: "number" },
            lowstockThreshold: { type: "number" },
            trackQuantity: { type: "boolean" },
            isDiscounted: { type: "boolean" },
            discountedPrice: { type: "number" },
          },
          required: ["product_name", "option_title"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_variant",
        description:
          "Add a NEW variant to a product. If subcategory_name is provided, the variant is added inside that subcategory (tree products). Otherwise added to the product's top-level variants array.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            title: { type: "string" },
            price: { type: "number" },
            subcategory_name: {
              type: "string",
              description: "Optional: add the variant inside this subcategory",
            },
            sku: {
              type: "string",
              description: "Optional: auto-generated if omitted",
            },
            inventory: { type: "number" },
            trackQuantity: { type: "boolean" },
            lowstockThreshold: { type: "number" },
          },
          required: ["product_name", "title", "price"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "remove_variant",
        description:
          "Remove a variant from a product by title or SKU. Provide subcategory_name to remove a variant nested inside a specific subcategory; otherwise removes from the top-level variants array.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            variant_title: { type: "string" },
            subcategory_name: {
              type: "string",
              description: "Optional: the subcategory containing the variant",
            },
          },
          required: ["product_name", "variant_title"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_subcategory",
        description:
          "Add a NEW subcategory to a product (e.g. 'Veg', 'Non-Veg'). Starts with an empty variants array — use add_variant afterwards to populate it.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            name: { type: "string" },
            basePrice: { type: "number", description: "Defaults to 0" },
            inventory: { type: "number" },
            trackQuantity: { type: "boolean" },
            lowstockThreshold: { type: "number" },
          },
          required: ["product_name", "name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "remove_subcategory",
        description:
          "Remove a subcategory (and all its nested variants) from a product.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            subcategory_name: { type: "string" },
          },
          required: ["product_name", "subcategory_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_option",
        description:
          "Add a NEW productOption (Size / Quantity / Pack) to a product.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            title: { type: "string" },
            price: { type: "number" },
            inventory: { type: "number" },
            trackQuantity: { type: "boolean" },
            lowstockThreshold: { type: "number" },
          },
          required: ["product_name", "title", "price"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "remove_option",
        description: "Remove a productOption from a product by its title.",
        parameters: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            option_title: { type: "string" },
          },
          required: ["product_name", "option_title"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delete_product",
        description:
          "Soft-delete a product by name. Asks for confirmation implicitly — only call if user clearly said to delete/remove.",
        parameters: {
          type: "object",
          properties: { product_name: { type: "string" } },
          required: ["product_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "confirm_payment_by_order_id",
        description:
          "Confirm a single matched payment for a specific order — moves that order from pending to processing. Only works when a payment email already matched that order.",
        parameters: {
          type: "object",
          properties: { order_id: { type: "string" } },
          required: ["order_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "place_order",
        description:
          "Create a kiosk / walk-in order. Each item is resolved against the shopkeeper's catalog. A product can have up to three independent layers: productOption (e.g. sizes 9/10), subcategory (e.g. T-shirt/Jeans), and variant (e.g. XL/XXL inside T-shirt). When a product exposes multiple layers, pass all relevant fields together — the final unit price is variant_price (or subcategory basePrice) PLUS option_price if set. If a required leaf is missing, the tool returns a list of candidates so you can ask the shopkeeper. Always require customer's name + whatsapp + email up front.",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string" },
            whatsapp: {
              type: "string",
              description:
                "Customer WhatsApp number with country code (e.g. +919876543210)",
            },
            email: { type: "string", description: "Customer email" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  product_name: { type: "string" },
                  option_title: {
                    type: "string",
                    description:
                      "productOption title when the product has one (e.g. '9' or 'Pack of 3')",
                  },
                  subcategory_name: {
                    type: "string",
                    description:
                      "Subcategory name (e.g. 'T-shirt' in Clothes > T-shirt > XL)",
                  },
                  variant_title: {
                    type: "string",
                    description:
                      "Variant title or SKU. For tree products this is the inner variant (e.g. 'XL').",
                  },
                  quantity: {
                    type: "number",
                    description: "Defaults to 1 if omitted",
                  },
                },
                required: ["product_name"],
              },
            },
            payment_method: {
              type: "string",
              enum: ["qr", "cash"],
              description:
                "qr = generate a payment QR; cash = already paid. Defaults to qr.",
            },
            instructions: {
              type: "string",
              description: "Optional notes / instructions for this order",
            },
          },
          required: ["customer_name", "items"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_payment_qr",
        description:
          "Generate a payment QR for an existing order. Returns UPI payload for India or PayNow data for Singapore, based on shopkeeper's country setting. Call after a QR-payment place_order.",
        parameters: {
          type: "object",
          properties: { order_id: { type: "string" } },
          required: ["order_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_order_receipt",
        description:
          "Return the URL of the PDF receipt for an order. Use after a cash order, or whenever the shopkeeper asks for a receipt.",
        parameters: {
          type: "object",
          properties: { order_id: { type: "string" } },
          required: ["order_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_analytics",
        description: "Get analytics for a period",
        parameters: {
          type: "object",
          properties: {
            period: {
              type: "string",
              enum: [
                "monthly",
                "lastmonth",
                "quarterly",
                "lastquarter",
                "yearly",
                "lastyear",
              ],
            },
          },
          required: ["period"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_product_analytics",
        description:
          "Deep analytics for a SINGLE product over an optional time window. Returns revenue from that product, orders containing it, units sold, unique buyers, and best-selling variants/options. Use this whenever the shopkeeper asks for stats / sales / performance OF a specific product.",
        parameters: {
          type: "object",
          properties: {
            product_name: {
              type: "string",
              description: "Product name or partial match.",
            },
            period: {
              type: "string",
              enum: [
                "today",
                "monthly",
                "lastmonth",
                "quarterly",
                "lastquarter",
                "yearly",
                "lastyear",
                "all",
              ],
              description:
                "Defaults to all-time. Ignored when start_date is provided.",
            },
            start_date: {
              type: "string",
              description:
                "ISO date (YYYY-MM-DD) — start of a custom window. Overrides period when set.",
            },
            end_date: {
              type: "string",
              description:
                "ISO date (YYYY-MM-DD) — end of a custom window (exclusive). Defaults to now when only start_date is given.",
            },
          },
          required: ["product_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customer_analytics",
        description:
          "Deep analytics for a SINGLE customer over an optional time window. Returns total spent, order count, avg order, favorite products, and recent orders. Identify by phone / email / name. Use this whenever the shopkeeper asks for stats / spend / history OF a specific customer.",
        parameters: {
          type: "object",
          properties: {
            phone: {
              type: "string",
              description: "WhatsApp number with country code.",
            },
            email: { type: "string" },
            name: { type: "string" },
            period: {
              type: "string",
              enum: [
                "today",
                "monthly",
                "lastmonth",
                "quarterly",
                "lastquarter",
                "yearly",
                "lastyear",
                "all",
              ],
              description:
                "Defaults to all-time. Ignored when start_date is provided.",
            },
            start_date: {
              type: "string",
              description:
                "ISO date (YYYY-MM-DD) — start of a custom window. Overrides period when set.",
            },
            end_date: {
              type: "string",
              description:
                "ISO date (YYYY-MM-DD) — end of a custom window (exclusive). Defaults to now when only start_date is given.",
            },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_order_analytics",
        description:
          "Detailed breakdown / analytics for a SINGLE order by orderId. Returns per-item revenue, payment status, customer info, and timing. Use whenever the shopkeeper asks for details / breakdown / analytics OF an order.",
        parameters: {
          type: "object",
          properties: { order_id: { type: "string" } },
          required: ["order_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_today_revenue",
        description: "Get today's revenue",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_top_products",
        description: "Get top selling products",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_payment_summary",
        description: "Get payment tracking summary",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "confirm_matched_payments",
        description:
          "Confirm all matched payments and move orders to processing",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "confirm_today_orders",
        description:
          "Bulk-move ALL of today's pending orders to processing. Orders already in processing / completed / cancelled are left untouched. Use when the shopkeeper says 'confirm all today's orders' / 'process today's orders' / 'start the day' etc.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_matched_payments",
        description: "Get matched payments awaiting confirmation",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_unmatched_payments",
        description: "Get unmatched payments",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customers",
        description: "Get total customer count",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "list_customers",
        description:
          "List customers for this shop with aggregated stats (orderCount, totalSpent, lastOrderDate). Supports optional search and filtering.",
        parameters: {
          type: "object",
          properties: {
            search: {
              type: "string",
              description: "Substring match on name, phone, or email",
            },
            vip_only: {
              type: "boolean",
              description: "Only customers whose totalSpent > 100",
            },
            limit: { type: "number", description: "Defaults to 20, max 100" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customer",
        description:
          "Get a single customer's full profile — contact info + order stats + recent orders. Identify by phone OR email OR exact name.",
        parameters: {
          type: "object",
          properties: {
            phone: {
              type: "string",
              description: "WhatsApp number with country code",
            },
            email: { type: "string" },
            name: { type: "string" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customer_orders",
        description:
          "List a customer's recent orders. Identify by phone/email/name as for get_customer.",
        parameters: {
          type: "object",
          properties: {
            phone: { type: "string" },
            email: { type: "string" },
            name: { type: "string" },
            limit: { type: "number", description: "Defaults to 10" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_customer",
        description:
          "Create a new customer profile manually (not via an order). Requires first_name, last_name, whatsapp; email is optional.",
        parameters: {
          type: "object",
          properties: {
            first_name: { type: "string" },
            last_name: { type: "string" },
            whatsapp: {
              type: "string",
              description: "With country code, e.g. +918401201831",
            },
            email: { type: "string" },
          },
          required: ["first_name", "last_name", "whatsapp"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_customer",
        description:
          "Update an existing customer's fields. Identify them with phone/email/name; supply any of the editable fields.",
        parameters: {
          type: "object",
          properties: {
            phone: { type: "string" },
            email: { type: "string" },
            name: { type: "string" },
            new_first_name: { type: "string" },
            new_last_name: { type: "string" },
            new_whatsapp: { type: "string" },
            new_email: { type: "string" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_crm_stats",
        description:
          "Aggregate CRM stats for this shop: totalCustomers, vipCount (spend > 100), totalRevenue, avgOrderValue, totalOrders, and local vs international counts based on shopkeeper country.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_coupons",
        description: "Get active coupons",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_plan_info",
        description: "Get subscription plan info",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_operators",
        description: "Get list of operators",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_shop_info",
        description: "Get shop details",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "navigate_to",
        description:
          "Navigate user to a dashboard tab. For the products tab, optionally pass action='add' to open the blank Add Product form, or action='edit' with productName to open the Edit form for that specific product.",
        parameters: {
          type: "object",
          properties: {
            tab: {
              type: "string",
              enum: [
                "dashboard",
                "products",
                "orders",
                "crm",
                "kiosk",
                "storefront",
                "settings",
              ],
            },
            action: {
              type: "string",
              enum: ["add", "edit"],
              description:
                "Only valid when tab='products'. 'add' opens the empty Add Product form. 'edit' opens the Edit form for productName.",
            },
            productName: {
              type: "string",
              description:
                "Required when action='edit'. The product to open for editing (case-insensitive match against the shopkeeper's product list).",
            },
          },
          required: ["tab"],
        },
      },
    },
  ];

  // Agentic pipeline — router classifies the message into a tab,
  // then a tab-specific specialist runs with only that tab's tools +
  // a tuned system prompt. Small focused tool lists = better tool-call accuracy.
  private static TAB_TOOLS: Record<string, string[]> = {
    dashboard: [
      "get_today_orders",
      "get_today_revenue",
      "get_analytics",
      "get_product_analytics",
      "get_customer_analytics",
      "get_order_analytics",
      "get_top_products",
      "get_product_count",
      "get_customers",
      "get_pending_orders",
    ],
    kiosk: [
      "get_products",
      "get_product_detail",
      "place_order",
      "get_payment_qr",
      "get_order_receipt",
      "get_order_detail",
    ],
    orders: [
      "get_today_orders",
      "get_pending_orders",
      "get_recent_orders",
      "get_order_detail",
      "update_order_status",
      "get_payment_summary",
      "confirm_matched_payments",
      "confirm_payment_by_order_id",
      "confirm_today_orders",
      "get_matched_payments",
      "get_unmatched_payments",
    ],
    crm: [
      "list_customers",
      "get_customer",
      "get_customer_orders",
      "create_customer",
      "update_customer",
      "get_crm_stats",
    ],
    products: [
      "get_products",
      "get_product_count",
      "get_low_stock",
      "get_product_detail",
      "create_product",
      "update_product",
      "update_variant",
      "update_subcategory",
      "update_option",
      "add_variant",
      "remove_variant",
      "add_subcategory",
      "remove_subcategory",
      "add_option",
      "remove_option",
      "delete_product",
      "bulk_update_products_status",
      "bulk_delete_products",
      "get_top_products",
    ],
    storefront: [], // TODO phase 2: storefront config + branding tools
    settings: [
      "get_shop_info",
      "get_plan_info",
      "get_operators",
      "get_coupons",
    ], // TODO phase 2: profile/coupon/operator edit tools
    general: [
      "get_shop_info",
      "get_today_orders",
      "get_today_revenue",
      "get_products",
      "get_pending_orders",
    ],
  };

  private static SPECIALIST_PROMPTS: Record<string, string> = {
    dashboard: `You are the **Dashboard** specialist for "{SHOP}" on KiosCart.
Focus: analytics, performance overview, revenue trends, top products, customer counts.
- Always use tools — never guess numbers.
- Period words map to tool periods (recognise in any language the user writes): "today" → get_today_orders + get_today_revenue; "this month" → get_analytics(monthly); "last month" → get_analytics(lastmonth); "this quarter" → get_analytics(quarterly); "last quarter" → get_analytics(lastquarter); "this year" → get_analytics(yearly); "last year" → get_analytics(lastyear).
- Lead with the headline number in **bold**, then 1-2 supporting metrics.
- For generic "how is my shop doing" questions, call get_analytics(monthly) and format: revenue, orders, top products.

**Targeted analytics — product / customer / order:**
- "analytics for <product>" / "sales of <product>" / "how is <product> doing" / "<product> stats" → call **get_product_analytics({ product_name })**. If the shopkeeper added a period word, pass it along. Reply briefly — the widget renders the cards. Mention top variants and unique buyer count from the response.
- "analytics for <customer>" / "<customer>'s spending" / "how much has <customer> spent" / "<customer> stats" → call **get_customer_analytics({ name | phone | email })**. Reply briefly — surface total spent, order count, avg order, favorite products.
- "analytics for order <id>" / "breakdown of order <id>" / "<id> details" → call **get_order_analytics({ order_id })**. Reply with the line-item breakdown (markdown table) + payment / status.

- If the user asks for something that belongs to another tab (e.g. edit a product), briefly answer and suggest navigate_to.`,
    kiosk: `You are the **Kiosk** specialist for "{SHOP}" on KiosCart. You act like an in-store POS over chat.
Focus: placing walk-in orders, generating payment QRs, and producing receipts.

**Customer details rule** — call place_order FIRST, ask later. The tool auto-fetches WhatsApp + email from the CRM whenever the shopkeeper gives only a name. NEVER ask the shopkeeper for phone or email upfront; the tool will tell you (via its error message) only if the customer truly isn't in the CRM.
- Only a name is given → call place_order with { customer_name, items }. Do NOT prompt for phone/email first.
- Tool error "<name> isn't in your CRM yet" → ONLY THEN ask for WhatsApp (+ optional email) and retry.
- Tool error "Found N customers named X" → show the candidates (name + whatsapp) and ask which one.
- Shopkeeper volunteered phone/email up front → forward those values, don't re-confirm.

Voice formats the tool already understands: "8347 450600" → +918347450600, "at the rate" or "at" → @, "dot" → ".", so don't re-parse; just forward what you heard.

Item format (the shopkeeper separates items with commas). Each item maps to one object in place_order.items:
- Simple product:             "Mango Juice"                   → { product_name: "Mango Juice" }  (quantity defaults to 1)
- With quantity:              "2 Chai" / "Mango Juice x2"     → { product_name: "Chai", quantity: 2 }
- Top-level variant:          "Pizza Large"                   → { product_name: "Pizza", variant_title: "Large" }
- Subcategory only:           "T-shirt Summer"                → { product_name: "T-shirt", variant_title: "Summer" }
- productOption (Size/Pack):  "Dal Pack of 3"                 → { product_name: "Dal", variant_title: "Pack of 3" }
- **Tree product** (subcategory → variant): "Pizza Veg Medium" → { product_name: "Pizza", subcategory_name: "Veg", variant_title: "Medium" }. Use BOTH fields when the shopkeeper names a subcategory AND a variant inside it (two levels deep).
- **Three-layer product** (option + subcategory → variant): "Clothes size 9, T-shirt XL" → { product_name: "Clothes", option_title: "9", subcategory_name: "T-shirt", variant_title: "XL" }. If the product has productOptions AND subcategories, you MUST supply option_title AND subcategory_name AND (when the subcategory has its own variants) variant_title. Final price adds the option's price on top of the variant/subcategory base.

**When in doubt, call get_product_detail(product_name) FIRST** so you can see the real shape (variants / subcategories / options) and pick the right fields. This is much better than guessing and relying on place_order errors.

Resolution order inside place_order (for reference — you don't need to replicate this):
top-level variant → subcategory > variant → subcategory (by name) → productOption → auto-split "Subcat Variant" → error with candidates.

Rule of thumb: if the description after the product name has two distinct parts that could be "subcategory + variant", ALWAYS split them into subcategory_name + variant_title. Free-form descriptors with spaces are also auto-split on the backend, but explicit is better.
If place_order returns an "available" object with candidates, show the candidates to the shopkeeper in a short list and ask which one they meant.

Flow:
1. Identify the customer name. Pass through any phone/email the shopkeeper gave; do NOT ask for them.
2. Parse the comma-separated items.
3. Detect payment method: words like "cash" → payment_method="cash". Otherwise default to "qr".
4. Call place_order with customer_name, items, payment_method (+ whatsapp/email only if the shopkeeper supplied them, + optional instructions). Phone/email are looked up from CRM by the tool when omitted.
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
- "pending orders" → get_pending_orders. "today" / "today's orders" → get_today_orders (returns counts AND the order list — render the list as a markdown table).
- "order X details" → get_order_detail. "mark order X as ready/completed" → update_order_status.
- "confirm payment for order X" → confirm_payment_by_order_id. "confirm all matched (payments)" → confirm_matched_payments.
- "confirm today's orders" / "process all today's orders" / "move today's pending orders to processing" / "start the day" → confirm_today_orders. This is a BULK action that flips today's pending orders → processing in one call. Orders already in processing/completed/cancelled are left alone.
- Always reference the orderId in responses.`,
    crm: `You are the **CRM / Customers** specialist for "{SHOP}" on KiosCart.
Focus: customer list, profiles, order history, and contact CRUD.

Read:
- **"show all customers" / "show customer list" / "list customers" / "how many customers"** → ALWAYS call list_customers with no filter. The tool response includes \`count\` (the total) AND \`customers\` (the array). Render a markdown table with columns: Name | Phone | Email | Orders | Spent | Status. Put the total count on top, e.g. "You have **11** customers:".
- **"customer <name>" / "show <name>" / "show customer <phone|email>"** → call get_customer with the identifier. Present: full contact info, join date, orderCount, totalSpent, avg order value, first/last order date, status (vip/active/inactive), and the FULL orderHistory from the tool response (summarise to 20 most recent only if the list is very long).
- "VIP customers" → list_customers with vip_only=true.
- "CRM stats" / "dashboard" → get_crm_stats.
- "orders for <customer>" / "what did <customer> order last" → get_customer_orders.

Write:
- "add customer <name>, <phone>, <email>" → create_customer. Require first_name, last_name, whatsapp; email is optional.
- "change <customer>'s email / phone / name" → update_customer. Identify them with phone/email/name + pass new_* fields.

Not supported in chat (direct the shopkeeper to the CRM tab):
- Bulk CSV export / import.
- Sending WhatsApp / email campaigns (the CRM tab opens wa.me links client-side — use navigate_to crm).`,
    products: `You are the **Products / Catalog** specialist for "{SHOP}" on KiosCart.
Focus: product catalog, inventory, prices, variants, subcategories, options.

Read:
- "show products" → get_products. "how many products" → get_product_count. "low stock" → get_low_stock. "best sellers" → get_top_products.
- When get_products runs, the widget renders an interactive expandable tree automatically (products with variants/subcategories/options can be expanded like a file tree). Your reply text should be SHORT: a one-line summary like "Here are your **12** products — click any row with a chevron to expand its variants." DO NOT also render a markdown table of the products; the tree UI already shows name, price, stock, and every leaf.
- Before editing a variant/subcategory/option, call **get_product_detail** first so you know the exact titles and structure.

Top-level product:
- Create a simple product → create_product (name, price, category required; no images from chat).
- Update any scalar field (price, inventory, status, name, lowstockThreshold, trackQuantity, isDiscounted, discountedPrice, description, barcode, measurement, tags) → update_product.
  Tags replaces the full list — pass the whole new array.
- Delete the whole product → delete_product.
- Bulk status change (archive/activate several) → bulk_update_products_status.
- Bulk delete → bulk_delete_products.

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

Prompt-driven navigation (IMPORTANT — skip other tools and jump straight to the form):
- "add product" / "add a new product" / "create product" with no other details → call navigate_to({ tab: "products", action: "add" }). The Products tab will open and the blank Add Product form pops up. Short reply text like "Opening the Add Product form…".
- "edit product <name>" / "update product <name>" / "change <name>" (when the shopkeeper clearly wants to open the full form, not edit a single field) → call navigate_to({ tab: "products", action: "edit", productName: "<name>" }). Short reply text like "Opening <name> for editing…".
- For narrow one-field edits ("change Mango price to 50"), keep using update_product instead — navigate only when the shopkeeper wants the form itself.

Not supported in chat (use navigate_to instead): uploading/changing images, editing tags in bulk.`,
    storefront: `You are the **Storefront / Branding** specialist for "{SHOP}" on KiosCart.
Focus: store branding, banners, colors, logo, SEO, layout.
- Storefront edits aren't wired to chat tools yet — always navigate_to the storefront tab and briefly say what the user should change there.`,
    settings: `You are the **Settings** specialist for "{SHOP}" on KiosCart.
Focus: shop profile, operators, coupons, plan/subscription, pickup settings.
- "my plan" / "subscription" → get_plan_info.
- "list operators" → get_operators. "list coupons" → get_coupons. "shop details" → get_shop_info.
- Edit operations (create/update/delete coupons, add/remove operators, change pickup settings) aren't chat tools yet — navigate_to settings and tell the shopkeeper which section to open.`,
    general: `You are KiosAI for "{SHOP}" on KiosCart. The user's request didn't clearly match a specific tab, so keep things short and guide them.
- For "hi" / "hello" / "hey" or any greeting → respond EXACTLY in this shape and nothing more:
    "{GREETING_LINE} 👋 I'm KiosAI, your store assistant for **{SHOP}**. What can I do for you today?"
  {GREETING_LINE} is already personalised (e.g. "Good morning, Vansh!" or "Good afternoon!" if no name) — use it verbatim, do NOT change "Good morning" to "Hello" or rewrite the wording.
- For concrete data questions, use the few read-only tools available (shop info, today's orders/revenue, products).
- For explainer / how-to / "what is …" / "can KiosCart …" questions, answer from the PLATFORM KNOWLEDGE block below. Cite tabs and concrete UI locations. Keep it to 2–4 sentences plus a "Next:" footer.
- Don't volunteer long feature lists for greetings — keep greetings short.`,
  };

  // Static product-knowledge block injected into every specialist's system
  // message. Lets the bot answer "how do I X" / "what does Y do" / pricing /
  // hardware / payment questions accurately without a tool call. Sourced
  // from the in-product FAQs (frontend SHOPKEEPER_FAQS + LandingPage faqs)
  // plus tab-by-tab functionality. Keep this tight — it's sent on every call,
  // and providers cache static prompts so repeat-call cost is near zero.
  private static KNOWLEDGE_BASE = `
PLATFORM KNOWLEDGE — KiosCart (use for explainer / how-to questions; never for live data):

What KiosCart is: A unified commerce platform for shopkeepers running both a physical kiosk (in-store self-checkout / walk-in POS) AND an online E-Shop, with one shared inventory, one analytics view, and one customer list.

Tabs and what they do:
- Dashboard — analytics: revenue, orders, top products, customers; period filters (today/this month/last month/this quarter/last quarter/this year/last year).
- Kiosk — walk-in / in-store ordering. Place an order, generate a UPI (India) or PayNow (Singapore) QR for the customer to scan, or take cash and print a receipt (A4 or 58mm thermal).
- Orders — list, view detail, update status (processing / ready / completed / cancelled), confirm Gmail-matched payments individually or in bulk.
- CRM — customer list with stats (orderCount, totalSpent, lastOrderDate), single-customer profile, create/update customers, VIP filter (totalSpent > 100), CRM stats.
- Products — catalog: name, price, SKU, inventory, status (active/draft/archived), variants (e.g. size XL), subcategories (e.g. Veg/Non-Veg, with their own variants), productOptions (Size/Pack), low-stock alerts, bulk archive/delete, image upload (UI only — not via chat).
- Storefront — branding: theme, colors, logo, hero banner, store-link slug, SEO. Edits via the Storefront tab UI (not chat tools yet).
- Settings — shop profile, payment QR / bank details, operators (team members with role-based access), coupons (PERCENTAGE or FLAT), pickup settings, delivery toggle, subscription plan.
- Chat (KiosAI) — this assistant. Can place kiosk orders, open the Add Product / Edit Product form, render an Add Customer form inline, show analytics cards, list products as a tree.

Plans: Starter for local shops; Enterprise for multi-location kiosk sync + advanced analytics. Direct shopkeepers to Settings → Subscription for plan changes; do not quote specific prices.

Hardware: hardware-agnostic — runs on tablets (iPad / Android), touch-screen terminals, regular laptops. Supports thermal printers (58mm) and barcode scanners.

Payments: India → UPI QR generated from the shopkeeper's saved UPI ID. Singapore → PayNow QR. Payment-email matching via Gmail integration moves orders from pending → processing once a matching transfer arrives.

Delivery: optional. Settings → Delivery toggle. When enabled, set a flat fee or subtotal-based fee rules. When disabled, the cart hides the delivery option.

Operators: Settings → Operators. Add a team member with name + WhatsApp + email and grant them tab-level access (e.g. only Kiosk + Orders). Operators see only the data scoped to the shop they belong to.

Coupons: Settings → Coupons. Create PERCENTAGE or FLAT discounts with a max-usage cap. Coupons apply at checkout in the storefront and the cart.

Languages: KiosAI replies in the language the shopkeeper writes in (English, Hindi, Hinglish, Tamil, Chinese, Malay, Singlish, etc.).

Bulk product import: Products tab → Add Product → "Import" option for an Excel/CSV bulk upload. Not available via chat.

Receipt formats: A4 PDF, or 58 mm thermal-printer roll. Choose at the moment of download from the QR card or the order detail.

Security: payments are routed through PCI-compliant processors (UPI for India, PayNow for Singapore). KiosCart does not store card numbers.

Limits of this chat: cannot upload images, change theme, edit storefront layout, run bulk CSV exports, or send WhatsApp/email campaigns — these require their respective tabs.`;

  async processMessage(
    shopkeeperIdIn: string,
    message: string,
    jwtName?: string,
  ): Promise<BotResponse> {
    let shopkeeperId = shopkeeperIdIn;
    try {
      if (!this.hasApiKey()) {
        return this.fallbackKeyword(shopkeeperId, message, jwtName);
      }

      // Resolve the caller's identity. The JWT may belong to either a shopkeeper
      // OR an operator working on behalf of one, so try both. The display name
      // comes from the JWT first (no DB hit needed), falling back to the DB
      // record when the token didn't carry one.
      let shopkeeper: any = await this.shopkeeperModel
        .findById(shopkeeperId)
        .lean();
      let personName = jwtName || shopkeeper?.name;
      let scopedShopId = shopkeeperId;
      if (!shopkeeper) {
        const op: any = await this.operatorModel.findById(shopkeeperId).lean();
        if (op?.shopkeeperId) {
          scopedShopId = String(op.shopkeeperId);
          shopkeeper = await this.shopkeeperModel.findById(scopedShopId).lean();
          personName = jwtName || op.name || personName;
        }
      }
      // From here on, use scopedShopId for data queries so operator calls hit the
      // right shop.
      shopkeeperId = scopedShopId;
      const shopName = shopkeeper?.shopName || "Store";
      const firstName = (personName || "").split(/\s+/)[0] || "there";

      // Chit-chat short-circuit. Pure social messages (hi, thanks, ok,
      // compliments, how-are-you) get a warm one-line reply without burning
      // an LLM call or a tool round-trip. Off-product tasks ("translate this",
      // "what's the weather") get a polite redirect to keep the bot scoped to
      // the shopkeeper's KiosCart workflow.
      const chitchat = this.detectChitChat(message);
      if (chitchat) {
        const reply = this.respondChitChat(
          chitchat,
          shopName,
          firstName,
          shopkeeper?.country,
        );
        this.appendHistory(shopkeeperId, message, reply.text);
        return reply;
      }

      // Stage 1 — router: classify the message into a tab. Give it the last
      // few turns so mid-flow follow-ups ("use T-shirt XL") stay on the same tab.
      const tab = await this.routeToTab(shopkeeperId, message);
      this.logger.log(
        `[Router/${this.provider}] "${message.slice(0, 60)}" → ${tab}`,
      );

      // Deterministic fast path for kiosk orders that match the standard format.
      // Bypasses the LLM entirely so the order lands even when Groq is rate-limited
      // or the 8B fallback fumbles structured extraction.
      if (tab === "kiosk") {
        const parsed = this.tryParseKioskOrder(message);
        if (parsed) {
          const result = await this.executeTool(
            shopkeeperId,
            "place_order",
            parsed,
          );
          const reply = await this.renderKioskOrderReply(
            shopkeeperId,
            result,
            parsed.payment_method,
          );
          this.appendHistory(shopkeeperId, message, reply.text);
          return reply;
        }

        // Bare trigger ("place an order" / "kiosk order") with no items →
        // render the inline order form. The form gathers customer +
        // products + payment, then submits a synthesised "Place order for …"
        // message that flows through THIS same pipeline (and lands in the
        // tryParseKioskOrder branch above) so the AI ultimately places the order.
        if (this.isKioskOrderTriggerIntent(message)) {
          const sk: any = await this.shopkeeperModel
            .findById(shopkeeperId)
            .lean();
          const rawCountry = (sk?.country || "IN")
            .toString()
            .trim()
            .toUpperCase();
          const country: "IN" | "SG" =
            rawCountry.startsWith("SG") || rawCountry.startsWith("SING")
              ? "SG"
              : "IN";
          const catalog = await this.buildOrderFormCatalog(shopkeeperId);
          // QR readiness — determines whether the form lets the shopkeeper
          // pick QR. India needs an uploaded UPI QR image; Singapore needs
          // a PayNow-eligible WhatsApp number.
          let qrReady = false;
          let qrSetupHint: string | undefined;
          if (country === "IN") {
            qrReady = !!sk?.paymentURL;
            if (!qrReady) {
              qrSetupHint =
                "Upload your UPI QR image in Settings → Payment Tracking before taking QR payments.";
            }
          } else {
            qrReady = !!sk?.whatsappNumber;
            if (!qrReady) {
              qrSetupHint =
                "Save your PayNow WhatsApp number in Settings → Profile before taking QR payments.";
            }
          }
          const reply: BotResponse = {
            text: "Fill in the order details below. I'll handle the rest once you submit.",
            orderForm: { country, catalog, qrReady, qrSetupHint },
          };
          this.appendHistory(shopkeeperId, message, reply.text);
          return reply;
        }
      }

      // Deterministic fast path for "confirm all today's orders" (and
      // synonyms). Bulk-flips today's pending orders → processing in one
      // call, leaves anything already processing/completed/cancelled alone.
      if (tab === "orders" && this.isConfirmTodayOrdersIntent(message)) {
        const result: any = await this.executeTool(
          shopkeeperId,
          "confirm_today_orders",
          {},
        );
        const reply = this.renderConfirmTodayReply(result, shopkeeper?.country);
        this.appendHistory(shopkeeperId, message, reply.text);
        return reply;
      }

      // Deterministic fast path for targeted analytics — "analytics for X",
      // "sales of X", "how is X doing", "X's spending", "breakdown of order Y".
      // Runs the right executor ourselves so the cards always render even when
      // the LLM is rate-limited or picks the wrong tool.
      if (tab === "dashboard") {
        const targeted = this.tryParseTargetedAnalytics(message);
        if (targeted) {
          const result: any = await this.executeTool(
            shopkeeperId,
            targeted.tool,
            targeted.args,
          );
          if (!result?.error) {
            const analytics: AnalyticsSummary = {
              revenue: Number(result.revenue) || 0,
              orders: Number(result.orders) || 0,
              avgOrder: Number(result.avgOrder) || 0,
              customers: Number(result.customers) || 0,
              currency: result.currency || "Rs.",
              period: result.period,
              topProducts: Array.isArray(result.topProducts)
                ? result.topProducts
                : undefined,
              subject: result.subject,
              subjectName: result.subjectName,
            };
            const headline =
              analytics.subject === "product"
                ? `Here's the snapshot for **${analytics.subjectName}**:`
                : analytics.subject === "customer"
                  ? `Here's **${analytics.subjectName}**'s activity:`
                  : `Here's the breakdown for **${analytics.subjectName}**:`;
            const reply: BotResponse = {
              text: headline,
              analytics,
              quickActions: this.suggestActions("revenue"),
            };
            this.appendHistory(shopkeeperId, message, reply.text);
            return reply;
          }
          // Tool returned an error — fall through to the LLM so it can ask the
          // shopkeeper to clarify (e.g. "Customer not found").
        }
      }

      // Deterministic fast path for analytics intents. The LLM sometimes calls
      // get_today_orders / get_today_revenue (which don't surface as cards) for
      // "today" instead of get_analytics, or returns text only — so we always
      // run the tool ourselves and build an analytics card payload.
      //
      // SKIP this path when the shopkeeper is asking about a specific subject
      // (product / customer / order). Phrases like "analytics for Mango Juice"
      // contain "analytics" so the period detector matches, but we want the
      // LLM specialist to call get_product_analytics, not the whole-shop
      // monthly snapshot. The targeted-analytics fast path above catches the
      // most common phrasings deterministically; everything else falls through
      // to the specialist.
      // Custom date range fast path — handles "since January", "from March to
      // May", "last 7 days", "this week", "yesterday", etc. Runs a direct
      // MongoDB aggregation so any window the shopkeeper names is supported,
      // not just the fixed period enum the report endpoint understands.
      if (tab === "dashboard" && !this.isTargetedAnalyticsIntent(message)) {
        const range = this.parseCustomDateRange(message);
        if (range) {
          const sk: any = await this.shopkeeperModel
            .findById(shopkeeperId)
            .lean();
          const country = (sk?.country || "IN").toString().trim().toUpperCase();
          const currency =
            country.startsWith("SG") || country.startsWith("SING")
              ? "S$"
              : "Rs.";
          const analytics = await this.aggregateShopAnalytics(
            shopkeeperId,
            range.start,
            range.end,
            currency,
          );
          const reply: BotResponse = {
            text:
              analytics.orders > 0
                ? `Here's your snapshot ${range.label}:`
                : `No orders ${range.label} yet — your dashboard will fill up once sales come in.`,
            analytics,
            quickActions: this.suggestActions("revenue"),
          };
          this.appendHistory(shopkeeperId, message, reply.text);
          return reply;
        }
      }

      if (tab === "dashboard" && !this.isTargetedAnalyticsIntent(message)) {
        const period = this.detectAnalyticsPeriod(message);
        if (period) {
          const sk: any = await this.shopkeeperModel
            .findById(shopkeeperId)
            .lean();
          const country = (sk?.country || "IN").toString().trim().toUpperCase();
          const currency =
            country.startsWith("SG") || country.startsWith("SING")
              ? "S$"
              : "Rs.";
          let analytics: AnalyticsSummary | undefined;
          let periodLabel = "";

          if (period === "today") {
            const todayResult: any = await this.executeTool(
              shopkeeperId,
              "get_today_orders",
              {},
            );
            const top: any = await this.executeTool(
              shopkeeperId,
              "get_top_products",
              {},
            );
            const orders = Number(todayResult?.total) || 0;
            const revenue = Number(todayResult?.revenue) || 0;
            // Count ONLY customers who placed orders today (not all-time customers).
            // get_customers does an unbounded all-time count, which made the
            // snapshot's "Total Customers" show a number wildly out of sync with
            // today's order count. Inline a date-scoped distinct-userId count.
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayUserIds = await this.orderModel.distinct("userId", {
              shopkeeperId,
              createdAt: { $gte: todayStart },
              isSoftDeleted: { $ne: true },
            });
            const customers = todayUserIds.filter(Boolean).length;
            analytics = {
              revenue,
              orders,
              avgOrder:
                orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0,
              customers,
              currency,
              period: "today",
              topProducts: Array.isArray(top) ? top.slice(0, 5) : undefined,
            };
            periodLabel = "today";
          } else {
            const result: any = await this.executeTool(
              shopkeeperId,
              "get_analytics",
              { period },
            );
            if (!result?.error) {
              analytics = {
                revenue: Number(result.revenue) || 0,
                orders: Number(result.orders) || 0,
                avgOrder: Number(result.avgOrder) || 0,
                customers: Number(result.customers) || 0,
                currency: result.currency || currency,
                period,
                topProducts: Array.isArray(result.topProducts)
                  ? result.topProducts
                  : undefined,
              };
              periodLabel =
                (
                  {
                    monthly: "this month",
                    lastmonth: "last month",
                    quarterly: "this quarter",
                    lastquarter: "last quarter",
                    yearly: "this year",
                    lastyear: "last year",
                  } as Record<string, string>
                )[period] || period;
            }
          }

          if (analytics) {
            const reply: BotResponse = {
              text:
                analytics.orders > 0
                  ? `Here's your snapshot for ${periodLabel}:`
                  : `No orders ${periodLabel} yet — your dashboard will fill up once sales come in.`,
              analytics,
              quickActions: this.suggestActions("revenue"),
            };
            this.appendHistory(shopkeeperId, message, reply.text);
            return reply;
          }
        }
      }

      // Deterministic fast path for "show / list products" intents. The LLM
      // sometimes responds in plain text instead of calling get_products, so
      // we always run the tool ourselves to guarantee the tree renders.
      if (tab === "products" && this.isListProductsIntent(message)) {
        const result = await this.executeTool(shopkeeperId, "get_products", {});
        const total = result?.total ?? 0;
        const products = Array.isArray(result?.products) ? result.products : [];
        const reply: BotResponse = {
          text:
            total > 0
              ? `Here are your **${total}** products — click any row with a chevron to expand its variants.`
              : 'You don\'t have any products yet. Try "add a new product" to create your first one.',
          productTree: products,
          quickActions: this.suggestActions("product"),
        };
        this.appendHistory(shopkeeperId, message, reply.text);
        return reply;
      }

      // Deterministic fast path for "open Add/Edit Product form" intents.
      // Once the same intent is in the chat history, the LLM frequently
      // regresses to a text-only ack on the repeat ("Sure, opening…") and
      // skips the navigate_to tool call — so the form never opens. Detect
      // these intents by regex and emit the navigate action ourselves.
      if (tab === "products") {
        const nav = this.detectProductNavIntent(message);
        if (nav) {
          const text =
            nav.action === "add"
              ? "Opening the Add Product form…"
              : `Opening **${nav.productName}** for editing…`;
          const reply: BotResponse = {
            text,
            botAction: {
              type: "navigate",
              tab: "products",
              action: nav.action,
              ...(nav.productName ? { productName: nav.productName } : {}),
            },
            quickActions: this.suggestActions("product"),
          };
          this.appendHistory(shopkeeperId, message, reply.text);
          return reply;
        }
      }

      // Deterministic fast path for "add customer …" intents. Render an
      // inline Add Customer form INSIDE the chat (not navigate to the CRM
      // tab), pre-filled with whatever fields the shopkeeper supplied. The
      // widget posts the form straight to the existing create-user endpoint
      // when the shopkeeper clicks Create. Skips the LLM and create_customer.
      if (tab === "crm") {
        const crm = this.detectCrmAddIntent(message);
        if (crm) {
          const fullName = [crm.firstName, crm.lastName]
            .filter(Boolean)
            .join(" ");
          const text = fullName
            ? `Review **${fullName}**'s details below and click Create when ready.`
            : "Fill in the customer's details below and click Create.";
          const reply: BotResponse = {
            text,
            customerForm: crm,
          };
          this.appendHistory(shopkeeperId, message, reply.text);
          return reply;
        }
      }

      // Stage 2 — specialist for that tab runs the tool-calling loop.
      const reply = await this.runSpecialist(
        shopkeeperId,
        message,
        tab,
        shopName,
        firstName,
        shopkeeper?.country,
      );
      this.appendHistory(shopkeeperId, message, reply.text);
      return reply;
    } catch (error: any) {
      const detail =
        error?.response?.data?.error?.failed_generation ||
        error?.error?.failed_generation ||
        "";
      this.logger.error(
        `AI Error: ${error.message}${detail ? ` | failed_generation: ${JSON.stringify(detail).slice(0, 500)}` : ""}`,
      );
      return this.fallbackKeyword(shopkeeperId, message, jwtName);
    }
  }

  // Stage 1 — small, cheap classification call. Returns one of:
  // dashboard | kiosk | orders | crm | products | storefront | settings | general
  private async routeToTab(
    shopkeeperId: string,
    message: string,
  ): Promise<string> {
    const validTabs = Object.keys(ChatbotService.TAB_TOOLS);

    // Heuristic shortcut — unambiguous phrases bypass the LLM entirely.
    // Saves tokens and guarantees correct routing regardless of model.
    const m = message.toLowerCase().trim();
    // CRM first — "add customer" must not be confused with "add" → products.
    if (
      /\b(add|new|create|register)\s+(a\s+)?(customer|client|buyer|contact)\b/.test(
        m,
      )
    )
      return "crm";
    if (
      /\b(edit|update|change|remove|delete)\s+(a\s+)?(customer|client|contact)\b/.test(
        m,
      )
    )
      return "crm";
    if (
      /\b(customer list|list customers|show customers|all customers|my customers|vip customers|show customer|customer details|crm stats)\b/.test(
        m,
      )
    )
      return "crm";
    if (/\b(place|create|new|take|ring up|ringup)\s+(an?\s+)?order\b/.test(m))
      return "kiosk";
    if (/\b(checkout|kiosk mode)\b/.test(m)) return "kiosk";
    if (
      /\b(pending orders|order status|mark order|confirm payment|update order|cancel order)\b/.test(
        m,
      )
    )
      return "orders";
    if (
      /\b(revenue|analytics|stats|performance|how is my shop|earnings|earning|income|report)\b/.test(
        m,
      )
    )
      return "dashboard";
    // Targeted analytics intents — "sales of X", "how is X doing", "X's stats / spending".
    if (
      /\b(sales|sold|performance|stats|spending|spent|breakdown)\s+(of|for)\b/.test(
        m,
      )
    )
      return "dashboard";
    if (/\bhow (is|are|much)\s+\w+\s+(doing|selling|spent|spending)\b/.test(m))
      return "dashboard";
    if (this.detectAnalyticsPeriod(m)) return "dashboard";
    if (
      /\b(add|edit|delete|remove|update|create|new)\s+(a\s+|an\s+|the\s+)?(new\s+)?(product|variant|subcategory|option)\b/.test(
        m,
      )
    )
      return "products";
    if (
      /\b(low stock|top products|show menu|view menu|catalog|catalogue|inventory)\b/.test(
        m,
      )
    )
      return "products";
    if (this.isListProductsIntent(m)) return "products";

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
- **kiosk**: CREATE / PLACE a new order for a walk-in / in-store / over-the-counter customer, generate payment QR, issue receipt. Phrases like "place order for X", "create order", "new order", "take order", "ring up", "checkout for", "kiosk" → ALWAYS kiosk.
- orders: LIST / VIEW / UPDATE STATUS of EXISTING orders, confirm Gmail-matched payments. Phrases like "show pending orders", "mark order X as ready", "confirm payment for order X" → orders. Does NOT create new orders.
- crm: customer list, customer details, customer messaging
- products: product catalog, inventory, prices, variants, edit/create/delete PRODUCTS (not orders), low stock
- storefront: store branding, banners, colors, logo, SEO, theme/design
- settings: shop profile, operators, coupons, tax/discount, pickup settings, subscription plan, shop details
- general: greetings, help, unclear or off-topic

KEY RULE: creating / placing a new order = **kiosk**. Managing existing orders = **orders**. Never confuse them.

If the latest message is a short follow-up / clarification to recent turns (e.g. the user just picked a variant you had asked about), stick with the tab that fits the overall flow — usually the same tab the earlier messages were on.

Return just the id.`,
          },
          ...recent,
          { role: "user", content: message },
        ],
        max_tokens: 12,
        temperature: 0,
      });
      const raw = ((res.choices?.[0]?.message as any)?.content || "general")
        .trim()
        .toLowerCase();
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
    personFirstName: string = "there",
    country?: string,
  ): Promise<BotResponse> {
    const allowed = new Set([
      ...(ChatbotService.TAB_TOOLS[tab] || []),
      "navigate_to",
    ]);
    const tools = this.tools.filter(
      (t) => t.type === "function" && allowed.has(t.function.name),
    );
    const greetingLine = this.buildGreetingLine(personFirstName, country);
    const prompt = (
      ChatbotService.SPECIALIST_PROMPTS[tab] ||
      ChatbotService.SPECIALIST_PROMPTS.general
    )
      .replace("{SHOP}", shopName)
      .replace("{PERSON}", personFirstName)
      .replace("{GREETING_LINE}", greetingLine);

    const sysCommon = `
Hard rules — violations are bugs:
- THREE QUESTION CLASSES (everything else gets the polite refusal):
  (a) DATA questions about THIS shop (orders, products, customers, revenue, payments, plan, operators, stock) — require a tool call. Numbers/IDs/names come ONLY from the tool result received this turn. No invention, no estimation, no hedging.
  (b) EXPLAINER questions about KiosCart itself ("how do I X", "what does Y do", "can KiosCart …", "where is Z", pricing/hardware/security) — answer from PLATFORM KNOWLEDGE. No tool call. Cite tabs by name.
  (c) CHIT-CHAT (greeting, thanks, "ok", compliment, goodbye, "how are you") — one warm sentence, then a one-line nudge back to a product action. Never expand into off-product conversation.
- HARD PRODUCT FENCE: never answer non-product tasks (translation, math, code, weather, news, world knowledge, recipes, jokes, anything off-domain). Reply: "That's outside what I can help with — I'm built for orders, products, customers, payments, and analytics on KiosCart. What can I help you with there?" Do not pretend or try to be helpful with the off-product ask. Never call a tool for an off-product ask.
- DATA-ONLY OUTPUT for class (a). Reply IS the data. No preamble ("Here's…", "Sure,", "Of course,"), no postamble ("Let me know…", "Hope this helps"). Start with the table/form/sentence and stop.
- Format for class (a): multi-row → GFM markdown table; single record → "**Label:** value" form one per line; analytics → "**Snapshot — <period>**" + KPI table; write-tool confirm → one sentence with **ID/name** in bold.
- Format for class (b): 2–4 short sentences, plain text. Reference the relevant tab (e.g. "Settings → Operators"). End with one "Next:" footer if a concrete action makes sense.
- Empty tool result → reply exactly: "No matching records." Question outside both classes (no tool, no knowledge) → reply exactly: "I don't have an answer for that yet — please check the relevant tab in your dashboard."
- No hedging (approximately/around/roughly/probably/maybe/I think). No filler. Bold only numbers, IDs, and form labels. No emojis except where a specialist template explicitly includes one (greetings 👋, kiosk confirmations ✅, errors ⚠️). No exclamation marks except inside the explicit greeting template.
- Tool-calling via the structured API only — never inline "<function=name{...}>" text. On tool error, surface the message and suggest one next action.
- Language: reply in the shopkeeper's input language/script. Don't default to Hindi when the input is English.`;

    const history = this.historyAsMessages(shopkeeperId);
    const lang = this.detectLanguage(message);
    const langDirective = `REPLY LANGUAGE: ${lang}. This is mandatory — the shopkeeper's message is in ${lang}, so every word of your response must be in ${lang}. Ignore any earlier replies that used a different language.`;
    // Currency directive — every money value the model emits must carry the
    // shopkeeper's local currency symbol so India shopkeepers never see "S$"
    // and Singapore shopkeepers never see "₹".
    const currency = this.currencySymbol(country);
    const currencyDirective = `CURRENCY: this shop is in ${country || "IN"} — every money value in your reply must be prefixed with "${currency}" (e.g. "${currency}250.00", "${currency}1,250"). Never strip the symbol, never substitute a different one.`;
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `${langDirective}\n${currencyDirective}\n\n${prompt}\n${sysCommon}\n${ChatbotService.KNOWLEDGE_BASE}`,
      },
      ...history,
      { role: "user", content: message },
    ];

    let response: any;
    let currentModel = this.model;
    const runCompletion = (modelId: string) =>
      this.ai.chat.completions.create({
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
      if (
        this.isRateLimit(err) &&
        this.fallbackModel &&
        this.fallbackModel !== currentModel
      ) {
        this.logger.warn(
          `Primary model rate-limited; falling back to ${this.fallbackModel}`,
        );
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
                    function: {
                      name: parsed.name,
                      arguments: JSON.stringify(parsed.args),
                    },
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
    let productTree: ProductTreeItem[] | undefined;
    let analytics: AnalyticsSummary | undefined;

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      const toolMessages: any[] = [...messages, assistantMsg];

      for (const tc of assistantMsg.tool_calls) {
        // The 8B fallback sometimes returns "null" or malformed JSON as the args
        // payload. Normalise to an empty object so every executor case can safely
        // read input.<field> without guarding.
        let args: any = {};
        try {
          const raw = tc.function.arguments;
          if (raw && raw !== "null") args = JSON.parse(raw) || {};
        } catch {
          args = {};
        }
        if (!args || typeof args !== "object") args = {};
        this.logger.log(
          `[Tool] ${tc.function.name}(${JSON.stringify(args).slice(0, 200)})`,
        );
        const result = await this.executeTool(
          shopkeeperId,
          tc.function.name,
          args,
        );
        this.logger.log(
          `[Tool] ${tc.function.name} → ${JSON.stringify(result).slice(0, 200)}`,
        );
        toolMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
        if (tc.function.name === "navigate_to") {
          botAction = {
            type: "navigate",
            tab: args.tab,
            ...(args.action ? { action: args.action } : {}),
            ...(args.productName ? { productName: args.productName } : {}),
          };
        } else if (
          tc.function.name === "get_payment_qr" &&
          result &&
          !result.error
        ) {
          botAction = {
            type: "showQR",
            orderId: result.orderId,
            orderMongoId: result.orderMongoId,
            amount: result.amount,
            country: result.country,
            shopName: result.shopName,
            shopkeeperPhone: result.shopkeeperPhone,
            paymentURL: result.paymentURL,
          };
        } else if (
          tc.function.name === "get_products" &&
          Array.isArray(result?.products)
        ) {
          // Surface the structured product list so the widget can render an
          // expandable tree (matching the Products tab UI).
          productTree = result.products;
        } else if (
          tc.function.name === "get_analytics" &&
          result &&
          !result.error
        ) {
          // Surface the analytics summary so the widget can render the same
          // four KPI cards used on the Analytics page.
          analytics = {
            revenue: Number(result.revenue) || 0,
            orders: Number(result.orders) || 0,
            avgOrder: Number(result.avgOrder) || 0,
            customers: Number(result.customers) || 0,
            currency: result.currency || "Rs.",
            period: args?.period,
            topProducts: Array.isArray(result.topProducts)
              ? result.topProducts
              : undefined,
            subject: "shop",
          };
        } else if (
          (tc.function.name === "get_product_analytics" ||
            tc.function.name === "get_customer_analytics" ||
            tc.function.name === "get_order_analytics") &&
          result &&
          !result.error
        ) {
          // The targeted-analytics tools already return the AnalyticsSummary
          // shape with subject + subjectName populated. Pass through.
          analytics = {
            revenue: Number(result.revenue) || 0,
            orders: Number(result.orders) || 0,
            avgOrder: Number(result.avgOrder) || 0,
            customers: Number(result.customers) || 0,
            currency: result.currency || "Rs.",
            period: result.period,
            topProducts: Array.isArray(result.topProducts)
              ? result.topProducts
              : undefined,
            subject: result.subject,
            subjectName: result.subjectName,
          };
        }
      }

      // Follow-up renders the final reply from tool results. Cap tokens
      // tighter and drop temperature to 0 to discourage rambling/hallucinated
      // narrative around the data.
      let followUp: any;
      try {
        followUp = await this.ai.chat.completions.create({
          model: currentModel,
          messages: toolMessages,
          max_tokens: 600,
          temperature: 0,
        });
      } catch (fErr: any) {
        if (this.isRateLimit(fErr) && this.fallbackModel !== currentModel) {
          this.logger.warn(
            `Follow-up rate-limited; falling back to ${this.fallbackModel}`,
          );
          followUp = await this.ai.chat.completions.create({
            model: this.fallbackModel,
            messages: toolMessages,
            max_tokens: 600,
            temperature: 0,
          });
        } else {
          throw fErr;
        }
      }
      const rawFollow = (followUp.choices[0].message as any).content;
      const text =
        rawFollow && rawFollow.trim() ? rawFollow : "No matching records.";
      return {
        text,
        quickActions: this.suggestActions(message),
        botAction,
        productTree,
        analytics,
      };
    }

    // No tool calls path — model replied with text only. Whitespace counts as
    // empty for the safety check; fall through to a polite redirect so the
    // shopkeeper always sees something useful.
    const directText =
      assistantMsg.content && assistantMsg.content.trim()
        ? assistantMsg.content
        : "Could you give me a bit more detail? You can also try one of the shortcuts below.";
    return {
      text: directText,
      quickActions: this.suggestActions(message),
      botAction,
      productTree,
      analytics,
    };
  }

  private suggestActions(msg: string): QuickAction[] {
    const m = msg.toLowerCase();
    if (m.includes("order"))
      return [
        { label: "Pending Orders", action: "show pending orders" },
        { label: "Today's Revenue", action: "today's revenue" },
      ];
    if (m.includes("product"))
      return [
        { label: "Add Product", action: "add a new product" },
        { label: "Low Stock", action: "low stock alerts" },
      ];
    if (m.includes("payment"))
      return [
        { label: "Confirm Payments", action: "confirm all matched payments" },
        { label: "Summary", action: "payment summary" },
      ];
    if (m.includes("hi") || m.includes("hello") || m.includes("help"))
      return [
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
    const live = all.filter((e) => e.ts >= cutoff);
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

  private historyAsMessages(
    sid: string,
    limit = ChatbotService.MAX_TURNS * 2,
  ): OpenAI.ChatCompletionMessageParam[] {
    const hist = this.getHistory(sid).slice(-limit);
    return hist.map((e) => ({ role: e.role, content: e.content }));
  }

  // Recover from Groq's llama-3.x text-wrapped tool calls, e.g.:
  //   <function=get_analytics{"period":"lastmonth"}>
  //   <function=navigate_to({"tab":"products"})>
  private parseMalformedToolCall(
    text: string,
  ): { name: string; args: any } | null {
    if (!text) return null;
    const m = text.match(
      /<function\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(?\s*(\{[\s\S]*?\})\s*\)?\s*(?:\/?>|<\/function>)?/,
    );
    if (!m) return null;
    try {
      return { name: m[1], args: JSON.parse(m[2]) };
    } catch {
      return null;
    }
  }

  // Deterministic parser for kiosk orders. Accepts both:
  //   "Place order for NAME[, PHONE, EMAIL]: items [cash|qr]"   (colon form)
  //   "Place order for NAME[, PHONE, EMAIL], items [cash|qr]"   (no colon — natural)
  // Returns null if the format doesn't match, in which case the LLM path runs.
  // When only a name is given, place_order will look up phone/email from the CRM.
  private tryParseKioskOrder(
    message: string,
  ): null | {
    customer_name: string;
    whatsapp?: string;
    email?: string;
    items: { product_name: string; variant_title?: string; quantity: number }[];
    payment_method?: "cash" | "qr";
  } {
    const prefix = message.match(
      /^\s*(?:please\s+)?(?:place|create|new|take|ring\s*up)\s+(?:an?\s+|the\s+)?order\s+(?:for\s+)?(.+?)\s*$/i,
    );
    if (!prefix) return null;
    let tail = prefix[1].trim();

    // Strip trailing payment method off the tail before splitting.
    let payment_method: "cash" | "qr" | undefined;
    const payMatch = tail.match(/(?:,\s*|\s+)(cash|qr|upi|paynow)\s*$/i);
    if (payMatch) {
      const p = payMatch[1].toLowerCase();
      payment_method = p === "cash" ? "cash" : "qr";
      tail = tail.slice(0, tail.length - payMatch[0].length).trim();
    }

    // Decide where header (name + contact) ends and body (items) begins.
    let header: string;
    let body: string;
    const colonIdx = tail.indexOf(":");
    if (colonIdx !== -1) {
      header = tail.slice(0, colonIdx).trim();
      body = tail.slice(colonIdx + 1).trim();
    } else {
      // No colon: walk comma-separated parts. The first part that looks
      // item-like ("2 Mango", "Chai x2") marks the start of the body.
      const parts = tail
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length < 2) return null;
      const isContactish = (p: string) =>
        /@/.test(p) || /^\+?[\d\s\-()]{6,}$/.test(p);
      const isItemish = (p: string) =>
        /^\d/.test(p) || /\s+x\s*\d+\s*$/i.test(p);
      let splitIdx = -1;
      for (let i = 1; i < parts.length; i++) {
        if (isContactish(parts[i])) continue;
        if (isItemish(parts[i])) {
          splitIdx = i;
          break;
        }
      }
      if (splitIdx === -1) return null;
      header = parts.slice(0, splitIdx).join(", ");
      body = parts.slice(splitIdx).join(", ");
    }
    if (!header || !body) return null;

    // Split header by comma: name, whatsapp, email (in any order; whatsapp starts with + or digits, email has @)
    const parts = header
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let customer_name = "";
    let whatsapp: string | undefined;
    let email: string | undefined;
    for (const part of parts) {
      if (!email && /@/.test(part)) email = part;
      else if (!whatsapp && /^\+?[\d\s\-()]{6,}$/.test(part))
        whatsapp = part.replace(/[\s\-()]/g, "");
      else if (!customer_name) customer_name = part;
    }
    if (!customer_name) customer_name = parts[0] || "";
    if (!customer_name) return null;

    // Split body into items by comma, then parse quantity out of each.
    const itemStrings = body.split(/\s*,\s*/).filter(Boolean);
    if (itemStrings.length === 0) return null;

    const items = itemStrings.map((raw) => {
      let s = raw.trim();
      let quantity = 1;
      // "2 Chai" — leading integer
      let m1 = s.match(/^(\d+)\s+(.+)$/);
      if (m1) {
        quantity = parseInt(m1[1], 10);
        s = m1[2].trim();
      } else {
        // "Chai x2" / "Chai X2"
        const m2 = s.match(/^(.+?)\s+x\s*(\d+)$/i);
        if (m2) {
          quantity = parseInt(m2[2], 10);
          s = m2[1].trim();
        }
      }
      // Pass the whole descriptor as product_name. The executor tries the full
      // string first; if no product matches and it contains spaces, auto-split
      // peels the descriptor word-by-word and pushes the remainder into
      // variant_title. That way "Mixed Nuts" stays intact when it's a real
      // product name, and "Clothes T-shirt XL" gets split correctly.
      return { product_name: s, quantity };
    });

    return { customer_name, whatsapp, email, items, payment_method };
  }

  // Builds the user-facing reply for a deterministic kiosk order. If place_order
  // succeeded and the method is QR, auto-calls get_payment_qr so the widget shows
  // the code without needing another round trip.
  // Currency symbol for a shopkeeper's country. Used everywhere the chat
  // renders money so India shopkeepers see ₹ and Singapore shopkeepers see S$.
  private currencySymbol(country?: string): string {
    const c = (country || "").toString().trim().toUpperCase();
    if (c.startsWith("SG") || c.startsWith("SING")) return "S$";
    return "₹";
  }

  // Two-decimal money formatter scoped to a country.
  private fmtMoney(value: any, country?: string): string {
    const n = Number(value) || 0;
    return `${this.currencySymbol(country)}${n.toFixed(2)}`;
  }

  private async renderKioskOrderReply(
    shopkeeperId: string,
    result: any,
    paymentMethod?: "cash" | "qr",
  ): Promise<BotResponse> {
    if (result?.error) {
      const lines = [`⚠️ ${result.error}`];
      if (result.available) {
        if (result.available.variants?.length)
          lines.push(`Variants: ${result.available.variants.join(", ")}`);
        if (result.available.subcategories?.length)
          lines.push(
            `Subcategories: ${result.available.subcategories.join(", ")}`,
          );
        if (result.available.subcategoryVariants?.length)
          lines.push(
            `Sub-variants: ${result.available.subcategoryVariants.join(", ")}`,
          );
        if (result.available.options?.length)
          lines.push(`Options: ${result.available.options.join(", ")}`);
      }
      if (Array.isArray(result.matches) && result.matches.length)
        lines.push(`Matched: ${result.matches.join(", ")}`);
      lines.push("Please reply with the exact variant/subcategory name.");
      return { text: lines.join("\n"), quickActions: this.suggestActions("") };
    }
    if (!result?.success)
      return { text: "Couldn't place order. Please try again." };

    // Resolve country once so every money line gets the right symbol.
    const sk: any = await this.shopkeeperModel.findById(shopkeeperId).lean();
    const country = sk?.country;

    const b = result.breakdown || {};
    const itemsLine = (result.items || [])
      .map((i: any) => {
        const parts = [i.subcategory, i.variant].filter(Boolean);
        if (i.option)
          parts.push(
            `option ${i.option}${i.optionPrice ? ` +${this.fmtMoney(i.optionPrice, country)}` : ""}`,
          );
        const detail = parts.length ? ` (${parts.join(" > ")})` : "";
        const priceLine =
          i.unitPrice !== undefined
            ? ` — ${this.fmtMoney(i.unitPrice, country)} × ${i.qty}`
            : "";
        return `  ${i.qty}× ${i.name}${detail}${priceLine}`;
      })
      .join("\n");
    const text = [
      `✅ Order **#${result.orderId}** placed for ${result.customer}.`,
      itemsLine,
      `Subtotal: ${this.fmtMoney(b.subtotal, country)}${b.discountPercentage ? `  ·  Discount ${b.discountPercentage}%: -${this.fmtMoney(b.discount, country)}` : ""}${b.taxPercentage ? `  ·  Tax ${b.taxPercentage}%: +${this.fmtMoney(b.tax, country)}` : ""}`,
      `**Total: ${this.fmtMoney(b.total, country)}**  (${paymentMethod === "cash" ? "cash received" : "QR payment"})`,
    ]
      .filter(Boolean)
      .join("\n");

    // QR orders → pre-fetch the QR payload so the widget renders it inline.
    // Cash orders → emit a showReceipt action so the widget renders a Download
    // Receipt pill (with the same A4 / 58mm picker the QR card already uses).
    let botAction: BotAction | undefined;
    if (paymentMethod === "cash") {
      if (result.orderMongoId) {
        botAction = {
          type: "showReceipt",
          orderId: result.orderId,
          orderMongoId: result.orderMongoId,
          amount: Number(result.breakdown?.total) || 0,
          country: this.currencySymbol(country) === "S$" ? "SG" : "IN",
        };
      }
    } else {
      const qr = await this.executeTool(shopkeeperId, "get_payment_qr", {
        order_id: result.orderId,
      });
      if (qr && !qr.error) {
        botAction = {
          type: "showQR",
          orderId: qr.orderId,
          orderMongoId: qr.orderMongoId,
          amount: qr.amount,
          country: qr.country,
          shopName: qr.shopName,
          shopkeeperPhone: qr.shopkeeperPhone,
          paymentURL: qr.paymentURL,
        };
      }
    }

    return { text, quickActions: this.suggestActions("order"), botAction };
  }

  // Maps a shopkeeper's analytics-style request to a get_analytics period
  // ("today" / "monthly" / "lastmonth" / ...). Returns null for messages that
  // aren't analytics queries, so the dashboard fast-path leaves them alone.
  private detectAnalyticsPeriod(message: string): string | null {
    const m = (message || "").toLowerCase().trim();
    // Must be analytics-shaped: revenue / sales / analytics / report / stats /
    // performance / dashboard / "how is my shop" / today summary.
    // NOTE: "today's orders" / "this month orders" are NOT analytics — they
    // are list requests that should route to the orders specialist so the
    // shopkeeper sees a real table of order rows, not a KPI snapshot. So we
    // intentionally exclude `orders` from the today/this-month patterns.
    const isAnalyticsish =
      /\b(revenue|sales|analytics|report|stats|performance|dashboard|earnings|earning|income)\b/.test(
        m,
      ) ||
      /\bhow\s+is\s+my\s+shop\b/.test(m) ||
      /\btoday(['‘’]s)?\s+(sales?|revenue|summary|stats?)\b/.test(m) ||
      /\bthis\s+(month|year|quarter)\s+(sales?|revenue|summary|stats?|report|analytics)\b/.test(
        m,
      );
    if (!isAnalyticsish) return null;

    if (/\blast\s+month\b/.test(m)) return "lastmonth";
    if (/\blast\s+quarter\b/.test(m)) return "lastquarter";
    if (/\blast\s+year\b/.test(m)) return "lastyear";
    if (/\bthis\s+month\b|\bmonthly\b|\bthis\s+mo\b/.test(m)) return "monthly";
    if (/\bthis\s+quarter\b|\bquarterly\b/.test(m)) return "quarterly";
    if (/\bthis\s+year\b|\byearly\b|\bannual\b/.test(m)) return "yearly";
    if (/\btoday\b|\baaj\b/.test(m)) return "today";
    // Generic "show analytics" / "revenue" with no period → default to monthly.
    return "monthly";
  }

  // "add product" / "edit product X" → open the dashboard's product form.
  // Returns null when the message looks like a narrow inline edit
  // ("change Mango price to 50") so update_product still wins for those.
  private detectProductNavIntent(
    message: string,
  ): { action: "add" | "edit"; productName?: string } | null {
    const m = (message || "")
      .toLowerCase()
      .trim()
      .replace(/[?!.]+$/, "");
    if (!m) return null;
    // Inline-value edits ("change X price to 50", "X stock 100") — leave to LLM/update_product.
    if (
      /\b(price|cost|category|inventory|stock|sku|tags?|barcode|measurement|description|discount)\b/.test(
        m,
      )
    )
      return null;

    // ADD intents — pure form-open phrasing, no other details.
    if (
      /^(?:please\s+)?(?:add|create)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?product(?:\s+form)?$/.test(
        m,
      ) ||
      /^(?:please\s+)?new\s+product$/.test(m) ||
      /^(?:please\s+)?(?:open|show|give\s+me)\s+(?:the\s+)?add\s+product(?:\s+form)?$/.test(
        m,
      )
    ) {
      return { action: "add" };
    }

    // EDIT intents — must name a target, must not contain a number (those go to
    // update_product). Strip a trailing " form" if the shopkeeper added it.
    if (/\d/.test(m)) return null;
    const edit = m.match(
      /^(?:please\s+)?(?:edit|update|modify)\s+(?:product\s+)?(.+?)$/,
    );
    if (edit) {
      const name = edit[1].replace(/\s+form\s*$/, "").trim();
      if (
        name &&
        !["product", "the product", "this product", "a product"].includes(name)
      ) {
        return { action: "edit", productName: name };
      }
    }
    const open = m.match(
      /^open\s+(.+?)\s+(?:for\s+(?:editing|edit)|edit\s+form)$/,
    );
    if (open) return { action: "edit", productName: open[1].trim() };

    return null;
  }
  // True when the message is asking about a SPECIFIC product / customer / order
  // rather than the whole shop. We disable the whole-shop fast path for these
  // so the LLM (or the targeted-analytics fast path) can answer correctly.
  private isTargetedAnalyticsIntent(message: string): boolean {
    return !!this.tryParseTargetedAnalytics(message);
  }

  // Parse free-form date windows the shopkeeper might type:
  //   "since January"           → Jan 1 of current year (or last year if January is in the future)
  //   "since 2026-01-15"        → that exact date
  //   "from March to May"       → Mar 1 → June 1 (end-exclusive)
  //   "from Jan 1 to Mar 31"    → Jan 1 → Apr 1
  //   "last 7 days" / "past 30 days"
  //   "this week" / "last week"
  //   "yesterday"
  // Returns { start, end (exclusive), label } or null when no custom range was
  // expressed. Named periods like "monthly" / "today" are NOT handled here —
  // those still go through the existing detectAnalyticsPeriod path.
  private parseCustomDateRange(
    message: string,
  ): { start: Date; end: Date; label: string } | null {
    const m = (message || "").toLowerCase().trim();
    if (!m) return null;
    const now = new Date();
    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const monthIndex = (s: string): number => {
      const map: Record<string, number> = {
        jan: 0,
        january: 0,
        feb: 1,
        february: 1,
        mar: 2,
        march: 2,
        apr: 3,
        april: 3,
        may: 4,
        jun: 5,
        june: 5,
        jul: 6,
        july: 6,
        aug: 7,
        august: 7,
        sep: 8,
        sept: 8,
        september: 8,
        oct: 9,
        october: 9,
        nov: 10,
        november: 10,
        dec: 11,
        december: 11,
      };
      return map[s.toLowerCase()] ?? -1;
    };
    const monthPattern =
      "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

    // Yesterday.
    if (/\byesterday\b/.test(m)) {
      const end = startOfDay(now);
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      return { start, end, label: "yesterday" };
    }

    // This week (Mon → next Mon).
    if (/\bthis\s+week\b/.test(m)) {
      const start = startOfDay(now);
      const dayOfWeek = (start.getDay() + 6) % 7; // 0 = Monday
      start.setDate(start.getDate() - dayOfWeek);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end, label: "this week" };
    }

    // Last week (previous Mon → this Mon).
    if (/\blast\s+week\b/.test(m)) {
      const thisMonday = startOfDay(now);
      const dayOfWeek = (thisMonday.getDay() + 6) % 7;
      thisMonday.setDate(thisMonday.getDate() - dayOfWeek);
      const start = new Date(thisMonday);
      start.setDate(start.getDate() - 7);
      return { start, end: thisMonday, label: "last week" };
    }

    // "last N days" / "past N days".
    let mt = m.match(/\b(?:last|past)\s+(\d{1,3})\s+(day|week|month|year)s?\b/);
    if (mt) {
      const n = Number(mt[1]);
      const unit = mt[2];
      const end = new Date(now);
      const start = new Date(now);
      if (unit === "day") start.setDate(start.getDate() - n);
      else if (unit === "week") start.setDate(start.getDate() - n * 7);
      else if (unit === "month") start.setMonth(start.getMonth() - n);
      else if (unit === "year") start.setFullYear(start.getFullYear() - n);
      return {
        start: startOfDay(start),
        end,
        label: `in the last ${n} ${unit}${n > 1 ? "s" : ""}`,
      };
    }

    // "from <date> to <date>" / "between <date> and <date>".
    // Anchor the second capture to end-of-string or punctuation so multi-word
    // dates like "march 15" aren't truncated to just "march".
    mt = m.match(
      /\b(?:from|between)\s+(.+?)\s+(?:to|and|until|till|-)\s+(.+?)\s*(?:[.,?!]|$)/,
    );
    if (mt) {
      const a = this.parseLooseDate(mt[1], now, "start");
      const b = this.parseLooseDate(mt[2], now, "end");
      if (a && b && b > a) {
        // For an inclusive end-date like "march 15", bump end by 1 day so the
        // [start, end) range actually covers all of march 15.
        const endExclusive = this.isSingleDay(mt[2])
          ? new Date(b.getTime() + 24 * 60 * 60 * 1000)
          : b;
        return {
          start: a,
          end: endExclusive,
          label: `from ${a.toDateString()} to ${b.toDateString()}`,
        };
      }
    }

    // "since <date>" / "after <date>".
    mt = m.match(
      /\b(?:since|after|from)\s+(.+?)(?:\s+till|\s+until|\s+to|$|\.|,|\?)/,
    );
    if (mt) {
      const start = this.parseLooseDate(mt[1], now, "start");
      if (start && start <= now)
        return { start, end: now, label: `since ${start.toDateString()}` };
    }

    // Bare month name on its own ("March", "January") — interpret as that
    // month in the current year (or last year if the month hasn't started yet).
    mt = m.match(
      new RegExp(
        `^${monthPattern}\\s*(?:analytics|stats?|sales|revenue|report)?$`,
      ),
    );
    if (mt) {
      const mi = monthIndex(mt[1]);
      if (mi >= 0) {
        const year =
          mi > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
        const start = new Date(year, mi, 1);
        const end = new Date(year, mi + 1, 1);
        return {
          start,
          end,
          label: `for ${start.toLocaleString("en-US", { month: "long", year: "numeric" })}`,
        };
      }
    }

    return null;
  }

  // Public — used by the chat controller's /chatbot/customer-search route.
  // Wraps findCustomersForShopkeeper with the same operator → shop scope
  // resolution that processMessage does.
  async searchCustomersForOrderForm(callerId: string, query: string) {
    let scopedShopId = callerId;
    const skExists = await this.shopkeeperModel.exists({ _id: callerId });
    if (!skExists) {
      const op: any = await this.operatorModel.findById(callerId).lean();
      if (op?.shopkeeperId) scopedShopId = String(op.shopkeeperId);
    }
    const matches = await this.findCustomersForShopkeeper(scopedShopId, query);
    return {
      count: matches.length,
      customers: matches.slice(0, 10).map((u: any) => ({
        id: u._id.toString(),
        name: u.name || "",
        whatsapp: u.whatsAppNumber || "",
        email: u.email || "",
      })),
    };
  }

  // "confirm today's orders" / "process all today's orders" → bulk-flip
  // pending → processing for today. Caught before the LLM so the action is
  // deterministic and idempotent.
  private isConfirmTodayOrdersIntent(message: string): boolean {
    const m = (message || "")
      .toLowerCase()
      .trim()
      .replace(/[?!.]+$/, "");
    if (!m) return false;
    if (
      /^(?:please\s+)?(?:confirm|process|move|update|mark|approve)\s+(?:all\s+)?(?:of\s+)?(?:today'?s?|today)\s+(?:pending\s+)?orders?(?:\s+to\s+processing)?$/.test(
        m,
      )
    )
      return true;
    if (
      /^(?:please\s+)?(?:confirm|process|approve)\s+all\s+orders\s+received\s+today$/.test(
        m,
      )
    )
      return true;
    if (/^(?:please\s+)?(?:start|begin)\s+(?:the\s+)?day$/.test(m)) return true;
    if (/^process\s+(?:the\s+)?(?:day's?\s+)?(?:pending\s+)?orders?$/.test(m))
      return true;
    return false;
  }

  // Render a clean reply for the bulk-confirm-today action — table of
  // confirmed orders + a one-line summary of what was skipped.
  private renderConfirmTodayReply(result: any, country?: string): BotResponse {
    if (!result || result.total === 0) {
      return {
        text: "No orders today yet — nothing to confirm.",
      };
    }
    if (result.confirmed === 0) {
      const breakdown = [
        result.alreadyProcessing > 0
          ? `${result.alreadyProcessing} already processing`
          : "",
        result.completed > 0 ? `${result.completed} completed` : "",
        result.cancelled > 0 ? `${result.cancelled} cancelled` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        text: `All ${result.total} of today's orders are already past pending${breakdown ? ` (${breakdown})` : ""}.`,
        quickActions: [
          { label: "Today's Orders", action: "show today's orders" },
          { label: "Pending Orders", action: "show pending orders" },
        ],
      };
    }
    const rows = (result.confirmedOrders || [])
      .map(
        (o: any) =>
          `| #${o.orderId} | ${o.customer || "Customer"} | ${this.fmtMoney(o.amount, country)} |`,
      )
      .join("\n");
    const skipped: string[] = [];
    if (result.alreadyProcessing > 0)
      skipped.push(`${result.alreadyProcessing} already processing`);
    if (result.completed > 0) skipped.push(`${result.completed} completed`);
    if (result.cancelled > 0) skipped.push(`${result.cancelled} cancelled`);
    const skippedLine =
      skipped.length > 0 ? ` (${skipped.join(" · ")} left as-is.)` : "";
    const text = [
      `Moved **${result.confirmed}** of today's pending orders to processing.${skippedLine}`,
      "",
      "| Order | Customer | Total |",
      "|-------|----------|-------|",
      rows,
    ].join("\n");
    return {
      text,
      quickActions: [
        { label: "Today's Orders", action: "show today's orders" },
        { label: "Pending Orders", action: "show pending orders" },
        {
          label: "Confirm Matched Payments",
          action: "confirm all matched payments",
        },
      ],
    };
  }

  // Chit-chat detector — returns the bucket the message falls into, or null
  // if it's a real product question. Bucket "offtopic" = a non-product task
  // (math/translation/weather/world-knowledge) we should politely refuse.
  private detectChitChat(
    message: string,
  ):
    | "greeting"
    | "thanks"
    | "ack"
    | "compliment"
    | "bye"
    | "howareyou"
    | "joke"
    | "offtopic"
    | null {
    const m = (message || "")
      .toLowerCase()
      .trim()
      .replace(/[?!.]+$/, "");
    if (!m) return null;
    // Length guard — anything over 80 chars likely contains a real ask, leave
    // it for the specialist routing.
    if (m.length > 80) return null;

    // Hard reject — these phrases look chit-chat-shaped but actually ask the
    // bot to do off-product work. Catch them so we redirect explicitly.
    if (
      /\b(translate|translation|paraphrase|rewrite|summarise|summarize)\b/.test(
        m,
      )
    )
      return "offtopic";
    if (
      /\b(weather|temperature|forecast|news|stock\s+price|cricket|sports|election)\b/.test(
        m,
      )
    )
      return "offtopic";
    if (
      /\b(write\s+(?:a\s+)?(?:poem|story|essay|song|email|code|script|program))\b/.test(
        m,
      )
    )
      return "offtopic";
    if (
      /\b(solve|calculate|compute|what\s+is\s+\d+|\d+\s*[+\-*/x]\s*\d+)\b/.test(
        m,
      )
    )
      return "offtopic";
    if (
      /\b(who\s+(?:is|was)\s+(?:the\s+)?(?:president|prime\s+minister|king|queen|ceo))\b/.test(
        m,
      )
    )
      return "offtopic";
    if (
      /\b(capital\s+of|population\s+of|currency\s+of|language\s+of)\b/.test(m)
    )
      return "offtopic";
    if (/\b(recipe|cook|cooking)\b/.test(m)) return "offtopic";

    // Greetings (full-message-only — "hi" inside a longer sentence isn't a greeting).
    if (
      /^(?:hi|hii+|hello+|hey+|yo|hola|namaste|namaskar|salaam|salam|hii\s+there|hey\s+there|hi\s+there)$/.test(
        m,
      )
    )
      return "greeting";
    if (/^good\s+(?:morning|afternoon|evening|night)$/.test(m))
      return "greeting";

    // Thanks
    if (
      /^(?:thanks|thank\s+you|thanku|thankyou|thx|ty|tysm|shukriya|dhanyavaad|dhanyavad)$/.test(
        m,
      )
    )
      return "thanks";
    if (
      /^(?:thanks|thank\s+you|thx)\s+(?:a\s+lot|so\s+much|very\s+much)$/.test(m)
    )
      return "thanks";

    // Acknowledgements
    if (
      /^(?:ok|okay|okk+|k|kk+|alright|got\s+it|noted|sure|fine|cool|done|yes|yeah|yep|nope|no)$/.test(
        m,
      )
    )
      return "ack";

    // Compliments / praise
    if (
      /^(?:great|good|awesome|amazing|brilliant|perfect|excellent|wow|nice)$/.test(
        m,
      )
    )
      return "compliment";
    if (
      /\byou(?:'re|\s+are)\s+(?:great|amazing|awesome|smart|cool|the\s+best|so\s+helpful|helpful)\b/.test(
        m,
      )
    )
      return "compliment";
    if (/\b(?:good|great|nice|well)\s+(?:job|work)\b/.test(m))
      return "compliment";

    // How-are-you
    if (
      /^(?:how\s+are\s+you|how('|\s+i)s\s+it\s+going|how\s+r\s+u|hru|whats\s+up|sup|kaise\s+ho|kaisa\s+hai)$/.test(
        m,
      )
    )
      return "howareyou";

    // Goodbye
    if (
      /^(?:bye+|goodbye|see\s+you|see\s+ya|cya|talk\s+later|later|good\s+night|alvida|tata)$/.test(
        m,
      )
    )
      return "bye";

    // Joke / fun small-talk request
    if (
      /^(?:tell\s+(?:me\s+)?(?:a\s+)?joke|make\s+me\s+laugh|haha|lol|lmao|rofl)$/.test(
        m,
      )
    )
      return "joke";

    return null;
  }
  // True when the date string names a specific day (e.g. "march 15", "2026-01-15",
  // "15/01/2026") rather than a whole month ("march", "2026-01"). Used to decide
  // whether to bump the end edge by 1 day so an inclusive "to march 15" actually
  // includes march 15.
  private isSingleDay(s: string): boolean {
    const v = (s || "").trim();
    if (/^\d{4}[-\/]\d{1,2}[-\/]\d{1,2}$/.test(v)) return true; // 2026-01-15
    if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(v)) return true; // 15/01/2026
    if (/^[a-z]+\s+\d{1,2}(?:[\s,]+\d{4})?$/i.test(v)) return true; // March 15
    if (/^\d{1,2}\s+[a-z]+(?:[\s,]+\d{4})?$/i.test(v)) return true; // 15 March
    return false;
  }

  // Loose date parser used by parseCustomDateRange.
  // Accepts:  "January", "Jan 15", "January 15 2026", "2026-01-15", "15/01/2026",
  //           "2026-01"  → first/last of that month depending on `edge`.
  private parseLooseDate(
    s: string,
    now: Date,
    edge: "start" | "end",
  ): Date | null {
    const v = (s || "")
      .trim()
      .replace(/^the\s+/, "")
      .replace(/[?.!]+$/, "");
    if (!v) return null;
    const monthIndex = (s: string): number => {
      const map: Record<string, number> = {
        jan: 0,
        january: 0,
        feb: 1,
        february: 1,
        mar: 2,
        march: 2,
        apr: 3,
        april: 3,
        may: 4,
        jun: 5,
        june: 5,
        jul: 6,
        july: 6,
        aug: 7,
        august: 7,
        sep: 8,
        sept: 8,
        september: 8,
        oct: 9,
        october: 9,
        nov: 10,
        november: 10,
        dec: 11,
        december: 11,
      };
      return map[s.toLowerCase()] ?? -1;
    };
    // ISO yyyy-mm-dd or yyyy/mm/dd.
    let mt = v.match(/^(\d{4})[-\/](\d{1,2})(?:[-\/](\d{1,2}))?$/);
    if (mt) {
      const y = Number(mt[1]),
        mo = Number(mt[2]) - 1,
        d = mt[3] ? Number(mt[3]) : edge === "start" ? 1 : 0;
      const date = mt[3]
        ? new Date(y, mo, d)
        : edge === "start"
          ? new Date(y, mo, 1)
          : new Date(y, mo + 1, 1);
      return isNaN(+date) ? null : date;
    }
    // dd/mm/yyyy.
    mt = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (mt) {
      const date = new Date(Number(mt[3]), Number(mt[2]) - 1, Number(mt[1]));
      return isNaN(+date) ? null : date;
    }
    // "Jan 15", "January 15", "Jan 15 2026", "15 Jan", "15 January 2026".
    mt = v.match(/^([a-z]+)\s+(\d{1,2})(?:[\s,]+(\d{4}))?$/i);
    if (mt && monthIndex(mt[1]) >= 0) {
      const year = mt[3] ? Number(mt[3]) : now.getFullYear();
      const date = new Date(year, monthIndex(mt[1]), Number(mt[2]));
      return isNaN(+date) ? null : date;
    }
    mt = v.match(/^(\d{1,2})\s+([a-z]+)(?:[\s,]+(\d{4}))?$/i);
    if (mt && monthIndex(mt[2]) >= 0) {
      const year = mt[3] ? Number(mt[3]) : now.getFullYear();
      const date = new Date(year, monthIndex(mt[2]), Number(mt[1]));
      return isNaN(+date) ? null : date;
    }
    // Bare month — "January" / "March". For start edge → first of month;
    // end edge → first of next month (so the range covers the month inclusively).
    mt = v.match(/^([a-z]+)$/i);
    if (mt && monthIndex(mt[1]) >= 0) {
      const mi = monthIndex(mt[1]);
      const year =
        mi > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      return edge === "start"
        ? new Date(year, mi, 1)
        : new Date(year, mi + 1, 1);
    }
    return null;
  }

  // Aggregate revenue / orders / avg / customers / top products for an
  // arbitrary date window directly from the Order collection. Used by the
  // custom-range fast path so any window the shopkeeper names is supported.
  private async aggregateShopAnalytics(
    shopkeeperId: string,
    start: Date,
    end: Date,
    currency: string,
  ): Promise<AnalyticsSummary> {
    const match: any = {
      shopkeeperId,
      isSoftDeleted: { $ne: true },
      createdAt: { $gte: start, $lt: end },
    };
    const headline = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: {
              $convert: {
                input: "$totalAmount",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          orders: { $sum: 1 },
          customers: { $addToSet: "$userId" },
        },
      },
    ]);
    const top = await this.orderModel.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productName",
          sold: {
            $sum: {
              $convert: {
                input: "$items.quantity",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          revenue: {
            $sum: {
              $multiply: [
                {
                  $convert: {
                    input: "$items.price",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
                {
                  $convert: {
                    input: "$items.quantity",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              ],
            },
          },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]);
    const h = headline[0] || { revenue: 0, orders: 0, customers: [] };
    const orders = Number(h.orders) || 0;
    const revenue = Number(h.revenue) || 0;
    return {
      revenue: Math.round(revenue * 100) / 100,
      orders,
      avgOrder: orders ? Math.round((revenue / orders) * 100) / 100 : 0,
      customers: Array.isArray(h.customers)
        ? h.customers.filter(Boolean).length
        : 0,
      currency,
      period: `${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}`,
      subject: "shop",
      topProducts: top
        .filter((t: any) => t._id)
        .map((t: any) => ({
          name: String(t._id),
          sold: t.sold,
          revenue: Math.round((t.revenue || 0) * 100) / 100,
        })),
    };
  }

  // Parse phrases like:
  //   "analytics for Mango Juice"            → get_product_analytics
  //   "sales of pizza last month"            → get_product_analytics
  //   "how is mango doing this month"        → get_product_analytics
  //   "analytics for customer Vansh"         → get_customer_analytics
  //   "Vansh's spending" / "spending of X"   → get_customer_analytics
  //   "breakdown of order 0001"              → get_order_analytics
  //   "analytics for order 0001"             → get_order_analytics
  // Returns the tool name + args, or null if nothing matched.
  private tryParseTargetedAnalytics(
    message: string,
  ): {
    tool:
      | "get_product_analytics"
      | "get_customer_analytics"
      | "get_order_analytics";
    args: any;
  } | null {
    const raw = (message || "").trim();
    if (!raw) return null;
    const m = raw.toLowerCase();
    const period = this.detectExplicitPeriod(m);
    // Custom date window — the targeted-analytics tools accept start_date and
    // end_date so the LLM-or-fastpath can scope to any window.
    const range = this.parseCustomDateRange(raw);
    const dateArgs = range
      ? {
          start_date: range.start.toISOString(),
          end_date: range.end.toISOString(),
        }
      : {};

    // Order — most specific, check first.
    let mt = m.match(
      /(?:analytics|breakdown|details|stats?|summary)\s+(?:for|of)\s+order\s+([a-z0-9-]+)/i,
    );
    if (mt) return { tool: "get_order_analytics", args: { order_id: mt[1] } };
    mt = m.match(
      /order\s+([a-z0-9-]+)\s+(?:breakdown|details|analytics|stats?)/i,
    );
    if (mt) return { tool: "get_order_analytics", args: { order_id: mt[1] } };

    // Customer — explicit "customer" keyword.
    mt = raw.match(
      /(?:analytics|stats?|spending|spend|history|orders?)\s+(?:for|of)\s+customer\s+(.+?)\s*$/i,
    );
    if (mt)
      return {
        tool: "get_customer_analytics",
        args: { ...this.parseCustomerIdentifier(mt[1]), ...dateArgs },
      };
    mt = raw.match(
      /customer\s+(.+?)\s+(?:analytics|stats?|spending|spend|history)/i,
    );
    if (mt)
      return {
        tool: "get_customer_analytics",
        args: { ...this.parseCustomerIdentifier(mt[1]), ...dateArgs },
      };

    // Customer — possessive ("Vansh's spending") or "spending of X".
    mt = raw.match(
      /(.+?)['‘’]s\s+(?:spending|spend|orders?|history|analytics|stats?)/i,
    );
    if (mt)
      return {
        tool: "get_customer_analytics",
        args: { ...this.parseCustomerIdentifier(mt[1]), ...dateArgs },
      };
    mt = raw.match(/(?:spending|spend|history)\s+of\s+(.+?)\s*$/i);
    if (mt)
      return {
        tool: "get_customer_analytics",
        args: { ...this.parseCustomerIdentifier(mt[1]), ...dateArgs },
      };
    mt = raw.match(/how much (?:has|did)\s+(.+?)\s+(?:spent|spend)/i);
    if (mt)
      return {
        tool: "get_customer_analytics",
        args: { ...this.parseCustomerIdentifier(mt[1]), ...dateArgs },
      };

    // Product — explicit "product" keyword.
    mt = raw.match(
      /(?:analytics|sales|stats?|performance)\s+(?:for|of)\s+product\s+(.+?)\s*$/i,
    );
    if (mt)
      return {
        tool: "get_product_analytics",
        args: { product_name: this.stripPeriod(mt[1]), period, ...dateArgs },
      };

    // Product — generic "analytics/sales for/of <name>" (after order+customer
    // were ruled out).
    mt = raw.match(
      /(?:analytics|sales|stats?|performance|breakdown)\s+(?:for|of)\s+(.+?)\s*$/i,
    );
    if (mt)
      return {
        tool: "get_product_analytics",
        args: { product_name: this.stripPeriod(mt[1]), period, ...dateArgs },
      };

    // "How is <name> doing/selling".
    mt = raw.match(/how\s+is\s+(.+?)\s+(?:doing|selling|performing)/i);
    if (mt)
      return {
        tool: "get_product_analytics",
        args: { product_name: this.stripPeriod(mt[1]), period, ...dateArgs },
      };

    // "<name> stats" / "<name> sales" — only when it's clearly a product-shaped
    // tail (avoid catching "today's stats" → fall to whole-shop path).
    mt = raw.match(
      /^(?!today|this|last|yesterday)(.+?)\s+(?:sales|stats?|performance)\s*$/i,
    );
    if (mt)
      return {
        tool: "get_product_analytics",
        args: { product_name: this.stripPeriod(mt[1]), period, ...dateArgs },
      };

    return null;
  }

  // Friendly, KiosCart-scoped reply for each chit-chat bucket. Always pivots
  // back to a product action so the conversation stays on rails.
  private respondChitChat(
    bucket:
      | "greeting"
      | "thanks"
      | "ack"
      | "compliment"
      | "bye"
      | "howareyou"
      | "joke"
      | "offtopic",
    shopName: string,
    firstName: string,
    country?: string,
  ): BotResponse {
    const greetingLine = this.buildGreetingLine(firstName, country);
    const name = firstName && firstName !== "there" ? firstName : "Kiosker";

    const productActions: QuickAction[] = [
      { label: "Today's Orders", action: "show today's orders" },
      { label: "Today's Revenue", action: "today's revenue" },
      { label: "Place an Order", action: "Place an order" },
      { label: "Show Products", action: "show all products" },
    ];

    switch (bucket) {
      case "greeting":
        return {
          text: `${greetingLine} 👋 I'm KiosAI, your store assistant for **${shopName}**. What can I do for you today?`,
          quickActions: productActions,
        };
      case "thanks":
        return {
          text: `You're welcome, ${name}. Anything else for **${shopName}**?`,
          quickActions: productActions,
        };
      case "ack":
        return {
          text: `Got it. Ready when you are.`,
          quickActions: productActions,
        };
      case "compliment":
        return {
          text: `Appreciate it, ${name} — happy to keep **${shopName}** running smoothly.`,
          quickActions: productActions,
        };
      case "howareyou":
        return {
          text: `All systems green here. How's **${shopName}** doing today?`,
          quickActions: [
            { label: "Today's Orders", action: "show today's orders" },
            { label: "Today's Revenue", action: "today's revenue" },
            { label: "Pending Orders", action: "show pending orders" },
          ],
        };
      case "bye":
        return {
          text: `Take care, ${name}. I'll be here whenever **${shopName}** needs me.`,
        };
      case "joke":
        return {
          text: `I keep my humour scoped to your shop, ${name} — but I can tell you what's selling.`,
          quickActions: [
            { label: "Top Products", action: "top products" },
            { label: "Today's Revenue", action: "today's revenue" },
          ],
        };
      case "offtopic":
        return {
          text: `That's outside what I can help with, ${name}. I'm built for **${shopName}** — orders, products, customers, payments, and analytics. What can I help you with there?`,
          quickActions: productActions,
        };
    }
  }

  // "place an order" / "new order" / "kiosk order" with NO items mentioned →
  // open the inline kiosk-order form. We only fire when the message is the
  // pure intent (no items, no customer); a fully-formed "Place order for X: 2 Y"
  // is still picked up by tryParseKioskOrder so existing single-line ordering
  // continues to work.
  private isKioskOrderTriggerIntent(message: string): boolean {
    const m = (message || "")
      .toLowerCase()
      .trim()
      .replace(/[?!.]+$/, "");
    if (!m) return false;
    // Reject messages that look like full one-liners (have ":" or item numbers).
    if (/:/.test(m)) return false;
    if (/\bfor\s+\S+\s*:/.test(m)) return false;
    return (
      /^(?:please\s+)?(?:place|create|new|take|start|ring\s*up)\s+(?:(?:an?|the|new|a\s+new|the\s+new)\s+)?order$/.test(
        m,
      ) ||
      /^(?:please\s+)?(?:open|show|start)\s+(?:the\s+)?(?:kiosk|order)\s*(?:form|order)?$/.test(
        m,
      ) ||
      /^kiosk\s*order$/.test(m) ||
      /^new\s+order$/.test(m)
    );
  }

  // Build the structured catalog payload the inline order form consumes.
  // Mirrors the public catalog (active, non-deleted) but limits to 200 rows so
  // the dropdown stays responsive. Each row carries enough shape for the
  // frontend to drive cascading option/subcategory/variant dropdowns.
  private async buildOrderFormCatalog(sid: string) {
    const products = await this.productModel
      .find({
        shopkeeperId: sid,
        isSoftDeleted: { $ne: true },
        status: { $ne: "archived" },
      })
      .sort({ name: 1 })
      .limit(200)
      .lean();
    return products.map((p: any) => ({
      name: p.name,
      price: Number(p.price) || 0,
      category: p.category,
      productOptions: (p.productOptions || []).map((o: any) => ({
        title: o.title,
        price: Number(o.price) || 0,
      })),
      variants: (p.variants || []).map((v: any) => ({
        title: v.title,
        price: Number(v.price) || 0,
      })),
      subcategories: (p.subcategories || []).map((s: any) => ({
        name: s.name,
        basePrice: Number(s.basePrice) || 0,
        variants: (s.variants || []).map((v: any) => ({
          title: v.title,
          price: Number(v.price) || 0,
        })),
      })),
    }));
  }

  // "add customer Vansh, +91…, email@x" → open the Add Customer form pre-filled.
  // Returns null when the message isn't a CRM-add intent. Empty tail
  // (just "add a customer") returns an object with no fields so the form opens
  // empty.
  private detectCrmAddIntent(message: string): null | {
    firstName?: string;
    lastName?: string;
    whatsapp?: string;
    email?: string;
  } {
    const m = (message || "").trim();
    if (!m) return null;
    const head = m.match(
      /^(?:please\s+)?(?:add|create|new|register)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:customer|client|contact|buyer)\b\s*[:,]?\s*(.*)$/i,
    );
    if (!head) return null;
    const tail = (head[1] || "").trim();
    if (!tail) return {}; // "add a customer" → open empty form

    const parts = tail
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    let name = "";
    let phone = "";
    let email = "";
    for (const p of parts) {
      if (!email && /@/.test(p)) email = p.toLowerCase();
      else if (!phone && /^\+?[\d\s\-()]{6,}$/.test(p))
        phone = p.replace(/[\s\-()]/g, "");
      else if (!name) name = p;
    }
    if (!name && !phone && !email) return {}; // open empty form

    const nameParts = name.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || undefined;
    const lastName = nameParts.slice(1).join(" ") || undefined;
    const out: {
      firstName?: string;
      lastName?: string;
      whatsapp?: string;
      email?: string;
    } = {};
    if (firstName) out.firstName = firstName;
    if (lastName) out.lastName = lastName;
    if (phone)
      out.whatsapp = phone.startsWith("+")
        ? phone
        : `+${phone.replace(/^\+/, "")}`;
    if (email) out.email = email;
    return out;
  }

  // Strip trailing period words ("last month", "this quarter", etc.) from a
  // captured subject name so "pizza last month" → "pizza".
  private stripPeriod(s: string): string {
    return s
      .replace(
        /\b(today|yesterday|this\s+(?:month|quarter|year)|last\s+(?:month|quarter|year)|monthly|quarterly|yearly|annual)\b.*$/i,
        "",
      )
      .replace(/[?.!]+$/, "")
      .trim();
  }

  // Pull a period token out of the full message (so "sales of pizza last month"
  // → period: "lastmonth"). Returns undefined if none mentioned, so the analytics
  // tool defaults to all-time.
  private detectExplicitPeriod(m: string): string | undefined {
    if (/\blast\s+month\b/.test(m)) return "lastmonth";
    if (/\blast\s+quarter\b/.test(m)) return "lastquarter";
    if (/\blast\s+year\b/.test(m)) return "lastyear";
    if (/\bthis\s+month\b|\bmonthly\b/.test(m)) return "monthly";
    if (/\bthis\s+quarter\b|\bquarterly\b/.test(m)) return "quarterly";
    if (/\bthis\s+year\b|\byearly\b|\bannual\b/.test(m)) return "yearly";
    if (/\btoday\b/.test(m)) return "today";
    return undefined;
  }

  // Decide whether a captured customer name string is actually a phone, email,
  // or plain name — so we route to the right findCustomer field.
  private parseCustomerIdentifier(s: string): {
    phone?: string;
    email?: string;
    name?: string;
  } {
    const v = (s || "").trim().replace(/[?.!]+$/, "");
    if (/^\+?\d[\d\s-]{6,}$/.test(v)) return { phone: v.replace(/[\s-]/g, "") };
    if (/@/.test(v)) return { email: v };
    return { name: v };
  }

  // "show all products", "product list", "list my products", "show menu", etc.
  // Excludes single-product / detail / edit intents so we don't render a full
  // catalog when the shopkeeper meant "show product Mango".
  private isListProductsIntent(message: string): boolean {
    const m = (message || "").toLowerCase().trim();
    if (
      /\b(add|edit|update|delete|remove|create|change|low\s*stock|top|best)\b/.test(
        m,
      )
    )
      return false;
    if (/\bshow\s+product\s+\S/.test(m)) return false; // "show product Mango"
    if (
      /\b(show|list|view|display|see|browse)\s+(me\s+)?(all\s+)?(my\s+|the\s+)?products?\b/.test(
        m,
      )
    )
      return true;
    if (/\bproducts?\s+list\b/.test(m)) return true;
    if (/\b(show|view)\s+(menu|catalog|catalogue|inventory)\b/.test(m))
      return true;
    if (/\b(all|my)\s+products?\b/.test(m)) return true;
    if (/\bproducts?\s*\?$/.test(m)) return true; // "products?"
    return false;
  }

  // Time-of-day greeting based on the shopkeeper's local time. Falls back to
  // server time when the country isn't recognised. Common countries get an
  // explicit IANA timezone so a shop in India sees "Good morning" even when
  // the server runs in UTC.
  private timeOfDayGreeting(country?: string): string {
    const tzMap: Record<string, string> = {
      IN: "Asia/Kolkata",
      IND: "Asia/Kolkata",
      INDIA: "Asia/Kolkata",
      SG: "Asia/Singapore",
      SGP: "Asia/Singapore",
      SING: "Asia/Singapore",
      SINGAPORE: "Asia/Singapore",
      US: "America/New_York",
      USA: "America/New_York",
      GB: "Europe/London",
      UK: "Europe/London",
      AE: "Asia/Dubai",
      UAE: "Asia/Dubai",
      AU: "Australia/Sydney",
    };
    const tz = country
      ? tzMap[country.toString().trim().toUpperCase()]
      : undefined;
    let hour: number;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: tz,
      });
      hour = parseInt(formatter.format(new Date()), 10);
      if (!Number.isFinite(hour)) hour = new Date().getHours();
    } catch {
      hour = new Date().getHours();
    }
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    return "Good evening";
  }

  // Builds the personalised greeting line used in the general specialist prompt
  // and the keyword fallback. Falls back to "Kiosker" (the on-brand noun for
  // a KiosCart user) when no real name is available, so the bot never says
  // a flat "Good evening!" with no addressee.
  private buildGreetingLine(firstName?: string, country?: string): string {
    const greeting = this.timeOfDayGreeting(country);
    const name = (firstName || "").trim();
    const display = !name || name.toLowerCase() === "there" ? "Kiosker" : name;
    return `${greeting}, ${display}!`;
  }

  // Quick language/script detection so we can force the specialist to reply in kind.
  // Returns one of: Hindi (Devanagari), Tamil, Chinese, Arabic, Hinglish, English.
  private detectLanguage(message: string): string {
    const s = message || "";
    if (/[\u0900-\u097F]/.test(s)) return "Hindi (Devanagari script)";
    if (/[\u0B80-\u0BFF]/.test(s)) return "Tamil";
    if (/[\u4E00-\u9FFF]/.test(s)) return "Chinese";
    if (/[\u0600-\u06FF]/.test(s)) return "Arabic";
    // Hinglish detection — Latin script with HINDI-ONLY words. We deliberately
    // exclude English loanwords ("shop", "order") and ambiguous short tokens
    // ("do", "lo", "ji") because they fire on plain English messages like
    // "show pending orders" or "do I have any orders" and flip the bot's
    // reply language. Require TWO distinct matches OR one strong-signal word
    // so a lone ambiguous match can't trip the detector.
    const hinglishWords =
      /\b(aaj|kal(?!\.com)|kya|kyu|kyun|hai|hain|nahi|nahin|kar|karo|karna|kiya|chahiye|kitna|kitni|kitne|mera|mere|meri|tumhara|tumhari|aap|tum|main|hum|dukaan|theek|accha|achha|haan|dena|lena|paisa|paise|rupay|rupaye|bhej|bhejo|batao|bataao|namaste|namaskar|dhanyavaad|shukriya)\b/gi;
    const matches = s.match(hinglishWords);
    if (matches) {
      const distinct = new Set(matches.map((w) => w.toLowerCase()));
      // Strong-signal words alone are enough — these are unambiguous Hindi.
      const strong =
        /\b(aaj|kya|nahi|nahin|chahiye|dukaan|namaste|namaskar|bhejo|batao|bataao|dhanyavaad|shukriya|kitna|kitni|kitne|tumhara|tumhari)\b/i;
      if (distinct.size >= 2 || strong.test(s)) {
        return "Hinglish (Hindi in Latin script)";
      }
    }
    return "English";
  }

  // Voice transcription spells things out: "at" for @, spaces in phone numbers,
  // missing country codes, etc. Clean these up before storing.
  private normalisePhone(raw: any, defaultCountryCode: string): string | null {
    if (!raw) return null;
    const s = String(raw).replace(/[\s\-()]+/g, "");
    if (!s) return null;
    if (s.startsWith("+")) return s; // already has country code
    // 10+ digits starting with 0 → strip the 0 and prepend cc
    if (/^0\d{10,}$/.test(s)) return defaultCountryCode + s.slice(1);
    if (/^\d{10}$/.test(s)) return defaultCountryCode + s;
    if (/^\d{8}$/.test(s) && defaultCountryCode === "+65")
      return defaultCountryCode + s;
    if (/^\d{11,14}$/.test(s)) return "+" + s; // already has cc, missing plus
    return /^\+?\d{6,15}$/.test(s) ? (s.startsWith("+") ? s : "+" + s) : null;
  }

  private normaliseEmail(raw: any): string | undefined {
    if (!raw) return undefined;
    let s = String(raw).trim().toLowerCase();
    // Common voice/IME variants for @ and .
    // "at the rate" (Indian English), "at rate", "at" → @
    // "dot" → .
    s = s
      .replace(/\s+at\s+the\s+rate\s+/g, "@")
      .replace(/\s+at\s+rate\s+/g, "@")
      .replace(/\s+at\s+/g, "@")
      .replace(/\s+dot\s+/g, ".");
    // Remove stray spaces inside the email
    s = s.replace(/\s+/g, "");
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : undefined;
  }

  // Returns every customer in this shopkeeper's scope whose name matches the query —
  // either created by the shopkeeper (provider "Shopkeeper" + providerId) OR who has
  // placed at least one order at this shop. Used by place_order so the shopkeeper can
  // say "place order for Vansh" and we silently reuse Vansh's stored phone/email.
  private async findCustomersForShopkeeper(
    sid: string,
    nameQuery: string,
  ): Promise<any[]> {
    const q = String(nameQuery || "").trim();
    if (!q) return [];
    const candidates = await this.userModel
      .find({ name: { $regex: q, $options: "i" } })
      .lean();
    if (candidates.length === 0) return [];
    const ids = candidates.map((u: any) => String(u._id));
    const orderedIds: any[] = await this.orderModel.distinct("userId", {
      shopkeeperId: sid,
      userId: { $in: ids },
      isSoftDeleted: { $ne: true },
    });
    const orderedSet = new Set(orderedIds.map((id: any) => String(id)));
    return candidates.filter(
      (u: any) =>
        (u.provider === "Shopkeeper" && String(u.providerId || "") === sid) ||
        orderedSet.has(String(u._id)),
    );
  }

  // Flexible customer lookup by phone, email, or name (any one is enough).
  private async findCustomer(input: {
    phone?: string;
    email?: string;
    name?: string;
  }): Promise<any | null> {
    if (input.phone) {
      const u = await this.userModel
        .findOne({ whatsAppNumber: input.phone })
        .lean();
      if (u) return u;
    }
    if (input.email) {
      const u = await this.userModel
        .findOne({
          email: { $regex: `^${String(input.email).trim()}$`, $options: "i" },
        })
        .lean();
      if (u) return u;
    }
    if (input.name) {
      const u = await this.userModel
        .findOne({ name: { $regex: String(input.name).trim(), $options: "i" } })
        .lean();
      if (u) return u;
    }
    return null;
  }

  // Looser product lookup used by analytics — picks the best fuzzy match instead
  // of erroring on multiple hits, since "show analytics for pizza" should still
  // resolve when the catalog has both "Pizza" and "Pizza Slice".
  private async findProductByName(
    sid: string,
    query: string,
  ): Promise<any | null> {
    if (!query) return null;
    // Exact match first (case-insensitive), then prefix, then substring.
    const exact = await this.productModel
      .findOne({
        shopkeeperId: sid,
        isSoftDeleted: { $ne: true },
        name: {
          $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          $options: "i",
        },
      })
      .lean();
    if (exact) return exact;
    const matches = await this.productModel
      .find({
        shopkeeperId: sid,
        isSoftDeleted: { $ne: true },
        name: {
          $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          $options: "i",
        },
      })
      .lean();
    if (matches.length === 0) return null;
    // Prefer the shortest name (best signal of "exact concept match" — "Pizza"
    // beats "Pizza Slice" when the shopkeeper said "pizza").
    matches.sort(
      (a: any, b: any) => (a.name?.length || 0) - (b.name?.length || 0),
    );
    return matches[0];
  }

  // Resolve either an explicit start_date/end_date pair or a named period
  // token to a date range. Returns null for "all-time".
  private resolveRange(input: {
    period?: string;
    start_date?: string;
    end_date?: string;
  }): { start: Date; end: Date; label: string } | null {
    if (input.start_date) {
      const start = new Date(input.start_date);
      if (isNaN(+start)) return null;
      const end = input.end_date ? new Date(input.end_date) : new Date();
      if (isNaN(+end)) return null;
      return {
        start,
        end,
        label: `${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}`,
      };
    }
    const r = this.periodToDateRange(input.period);
    return r ? { ...r, label: input.period || "" } : null;
  }

  // Map a period token (today / monthly / lastmonth / quarterly / lastquarter /
  // yearly / lastyear / all) to a [start, end) date range. Returns null for "all".
  private periodToDateRange(
    period?: string,
  ): { start: Date; end: Date } | null {
    if (!period || period === "all") return null;
    const now = new Date();
    if (period === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    if (period === "monthly") {
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    }
    if (period === "lastmonth") {
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 1),
      };
    }
    if (period === "quarterly") {
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: new Date(now.getFullYear(), q * 3, 1),
        end: new Date(now.getFullYear(), q * 3 + 3, 1),
      };
    }
    if (period === "lastquarter") {
      const q = Math.floor(now.getMonth() / 3);
      const y = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = q === 0 ? 9 : (q - 1) * 3;
      return { start: new Date(y, m, 1), end: new Date(y, m + 3, 1) };
    }
    if (period === "yearly") {
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: new Date(now.getFullYear() + 1, 0, 1),
      };
    }
    if (period === "lastyear") {
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear(), 0, 1),
      };
    }
    return null;
  }

  private async findOneProduct(
    sid: string,
    query: string,
  ): Promise<{ product: any } | { error: string; matches?: string[] }> {
    if (!query) return { error: "product_name required" };
    const matches = await this.productModel
      .find({
        shopkeeperId: sid,
        isSoftDeleted: { $ne: true },
        name: { $regex: query, $options: "i" },
      })
      .lean();
    if (matches.length === 0) return { error: "Product not found" };
    if (matches.length > 1)
      return {
        error: "Multiple products matched — please be more specific",
        matches: matches.slice(0, 5).map((p: any) => p.name),
      };
    return { product: matches[0] };
  }

  private async executeTool(
    sid: string,
    name: string,
    input: any,
  ): Promise<any> {
    switch (name) {
      case "get_today_orders": {
        const s = new Date();
        s.setHours(0, 0, 0, 0);
        const orders = await this.orderModel
          .find({
            shopkeeperId: sid,
            createdAt: { $gte: s },
            isSoftDeleted: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .lean();
        const customers = new Set(
          orders.map((o: any) => o.userId).filter(Boolean),
        ).size;
        return {
          total: orders.length,
          pending: orders.filter((o: any) => o.status === "pending").length,
          completed: orders.filter((o: any) => o.status === "completed").length,
          processing: orders.filter((o: any) => o.status === "processing")
            .length,
          revenue: orders.reduce(
            (a: number, o: any) => a + (o.totalAmount || 0),
            0,
          ),
          customers,
          // Surface the actual order rows so the orders specialist can render
          // them as a markdown table when the shopkeeper asks "today's orders"
          // or "show today's orders" instead of a snapshot.
          orders: orders.slice(0, 20).map((o: any) => ({
            orderId: o.orderId,
            amount: o.totalAmount,
            status: o.status,
            customer: o.customerName || o.firstName || "Customer",
            time: o.createdAt,
          })),
        };
      }
      case "get_pending_orders": {
        const orders = await this.orderModel
          .find({
            shopkeeperId: sid,
            status: "pending",
            isSoftDeleted: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        return orders.map((o: any) => ({
          orderId: o.orderId,
          amount: o.totalAmount,
          customer: o.customerName || o.firstName || "Customer",
          date: o.createdAt,
        }));
      }
      case "get_recent_orders": {
        const orders = await this.orderModel
          .find({ shopkeeperId: sid, isSoftDeleted: { $ne: true } })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        return orders.map((o: any) => ({
          orderId: o.orderId,
          amount: o.totalAmount,
          status: o.status,
          customer: o.customerName || o.firstName || "Customer",
        }));
      }
      case "get_order_detail": {
        const order: any = await this.orderModel
          .findOne({
            shopkeeperId: sid,
            orderId: { $regex: input.order_id, $options: "i" },
            isSoftDeleted: { $ne: true },
          })
          .lean();
        if (!order) return { error: "Order not found" };
        return {
          orderId: order.orderId,
          status: order.status,
          total: order.totalAmount,
          type: order.orderType,
          customer: order.customerName || order.firstName,
          items: (order.cartItems || []).map((i: any) => ({
            name: i.title || i.name,
            qty: i.quantity,
            price: i.price,
          })),
        };
      }
      case "update_order_status": {
        const order = await this.orderModel.findOne({
          shopkeeperId: sid,
          orderId: { $regex: input.order_id, $options: "i" },
          isSoftDeleted: { $ne: true },
        });
        if (!order) return { error: "Order not found" };
        order.status = input.status;
        order.statusHistory = [
          ...(order.statusHistory || []),
          { status: input.status, changedAt: new Date(), changedBy: "KiosAI" },
        ];
        await order.save();
        return {
          success: true,
          orderId: order.orderId,
          newStatus: input.status,
        };
      }
      case "get_products": {
        const products = await this.productModel
          .find({ shopkeeperId: sid, isSoftDeleted: { $ne: true } })
          .sort({ createdAt: -1 })
          .limit(15)
          .lean();
        const total = await this.productModel.countDocuments({
          shopkeeperId: sid,
          isSoftDeleted: { $ne: true },
        });
        return {
          total,
          products: products.map((p: any) => {
            const variants = (p.variants || []).map((v: any) => ({
              title: v.title,
              price: v.price,
              inventory: v.inventory,
            }));
            const subcategories = (p.subcategories || []).map((s: any) => ({
              name: s.name,
              basePrice: s.basePrice,
              variants: (s.variants || []).map((v: any) => ({
                title: v.title,
                price: v.price,
                inventory: v.inventory,
              })),
            }));
            const options = (p.productOptions || []).map((o: any) => ({
              title: o.title,
              price: o.price,
              inventory: o.inventory,
            }));
            const treeSummary: string[] = [];
            if (variants.length)
              treeSummary.push(
                `${variants.length} variant${variants.length > 1 ? "s" : ""}`,
              );
            if (subcategories.length)
              treeSummary.push(
                `${subcategories.length} subcategor${subcategories.length > 1 ? "ies" : "y"}`,
              );
            if (options.length)
              treeSummary.push(
                `${options.length} option${options.length > 1 ? "s" : ""}`,
              );
            return {
              name: p.name,
              price: p.price,
              status: p.status,
              inventory: p.inventory,
              category: p.category,
              hasTree:
                variants.length + subcategories.length + options.length > 0,
              treeSummary: treeSummary.join(", ") || undefined,
              variants: variants.length ? variants : undefined,
              subcategories: subcategories.length ? subcategories : undefined,
              options: options.length ? options : undefined,
            };
          }),
        };
      }
      case "get_product_count": {
        const [total, active, draft] = await Promise.all([
          this.productModel.countDocuments({
            shopkeeperId: sid,
            isSoftDeleted: { $ne: true },
          }),
          this.productModel.countDocuments({
            shopkeeperId: sid,
            status: "active",
            isSoftDeleted: { $ne: true },
          }),
          this.productModel.countDocuments({
            shopkeeperId: sid,
            status: "draft",
            isSoftDeleted: { $ne: true },
          }),
        ]);
        return { total, active, draft };
      }
      case "get_low_stock": {
        const p = await this.productModel
          .find({
            shopkeeperId: sid,
            isSoftDeleted: { $ne: true },
            trackQuantity: true,
            $expr: { $lte: ["$inventory", "$lowstockThreshold"] },
          })
          .lean();
        return p.map((x: any) => ({
          name: x.name,
          stock: x.inventory,
          threshold: x.lowstockThreshold,
        }));
      }
      case "get_product_detail": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const prod = p.product;
        return {
          name: prod.name,
          price: prod.price,
          status: prod.status,
          sku: prod.sku,
          category: prod.category,
          inventory: prod.inventory,
          trackQuantity: prod.trackQuantity,
          lowstockThreshold: prod.lowstockThreshold,
          isDiscounted: prod.isDiscounted,
          discountedPrice: prod.discountedPrice,
          productOptions: (prod.productOptions || []).map((o: any) => ({
            title: o.title,
            price: o.price,
            inventory: o.inventory,
            trackQuantity: o.trackQuantity,
          })),
          variants: (prod.variants || []).map((v: any) => ({
            title: v.title,
            sku: v.sku,
            price: v.price,
            inventory: v.inventory,
            trackQuantity: v.trackQuantity,
          })),
          subcategories: (prod.subcategories || []).map((s: any) => ({
            name: s.name,
            basePrice: s.basePrice,
            inventory: s.inventory,
            variants: (s.variants || []).map((v: any) => ({
              title: v.title,
              sku: v.sku,
              price: v.price,
              inventory: v.inventory,
            })),
          })),
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
        if (input.lowstockThreshold !== undefined)
          updates.lowstockThreshold = input.lowstockThreshold;
        if (input.trackQuantity !== undefined)
          updates.trackQuantity = input.trackQuantity;
        if (input.isDiscounted !== undefined)
          updates.isDiscounted = input.isDiscounted;
        if (input.discountedPrice !== undefined)
          updates.discountedPrice = input.discountedPrice;
        if (input.description !== undefined)
          updates.description = input.description;
        if (input.barcode !== undefined) updates.barcode = input.barcode;
        if (input.measurement !== undefined)
          updates.measurement = input.measurement;
        if (Array.isArray(input.tags))
          updates.tags = input.tags
            .map((t: any) => String(t).trim())
            .filter(Boolean);
        if (Object.keys(updates).length === 0)
          return { error: "No fields to update" };
        await this.productModel.findByIdAndUpdate(product._id, {
          $set: updates,
        });
        const note =
          (product.productOptions?.length || 0) > 0 ||
          (product.variants?.length || 0) > 0 ||
          (product.subcategories?.length || 0) > 0
            ? "Note: this product has variants/options/subcategories — top-level fields updated, but variant prices/stock are separate. Use update_variant to edit them."
            : undefined;
        return { success: true, product: product.name, updated: updates, note };
      }
      case "update_variant": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const fields: any = {};
        for (const f of [
          "price",
          "inventory",
          "lowstockThreshold",
          "trackQuantity",
          "isDiscounted",
          "discountedPrice",
        ]) {
          if (input[f] !== undefined) fields[f] = input[f];
        }
        if (Object.keys(fields).length === 0)
          return { error: "No fields to update" };
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
          const si = (product.subcategories || []).findIndex(
            (s: any) =>
              (s.name || "").toLowerCase() === sq ||
              (s.name || "").toLowerCase().includes(sq),
          );
          if (si < 0)
            return {
              error: `Subcategory "${input.subcategory_name}" not found`,
              availableSubcategories: (product.subcategories || []).map(
                (s: any) => s.name,
              ),
            };
          const vi = (product.subcategories[si].variants || []).findIndex(
            match,
          );
          if (vi < 0)
            return {
              error: `Variant not found inside ${product.subcategories[si].name}`,
              availableVariants: (product.subcategories[si].variants || []).map(
                (v: any) => v.title,
              ),
            };
          path = `subcategories.${si}.variants.${vi}`;
        } else {
          const topIdx = (product.variants || []).findIndex(match);
          if (topIdx >= 0) path = `variants.${topIdx}`;
          if (!path) {
            for (let si = 0; si < (product.subcategories || []).length; si++) {
              const vi = (product.subcategories[si].variants || []).findIndex(
                match,
              );
              if (vi >= 0) {
                path = `subcategories.${si}.variants.${vi}`;
                break;
              }
            }
          }
        }
        if (!path)
          return {
            error: "Variant not found",
            availableVariants: [
              ...(product.variants || []).map((v: any) => v.title),
              ...(product.subcategories || []).flatMap((s: any) =>
                (s.variants || []).map((v: any) => `${s.name} > ${v.title}`),
              ),
            ],
          };
        const setDoc: any = {};
        for (const [k, v] of Object.entries(fields)) setDoc[`${path}.${k}`] = v;
        await this.productModel.findByIdAndUpdate(product._id, {
          $set: setDoc,
        });
        return {
          success: true,
          product: product.name,
          variantPath: path,
          updated: fields,
        };
      }
      case "update_subcategory": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const q = (input.subcategory_name || "").toLowerCase();
        const idx = (product.subcategories || []).findIndex(
          (s: any) =>
            (s.name || "").toLowerCase() === q ||
            (s.name || "").toLowerCase().includes(q),
        );
        if (idx < 0)
          return {
            error: "Subcategory not found",
            availableSubcategories: (product.subcategories || []).map(
              (s: any) => s.name,
            ),
          };
        const setDoc: any = {};
        for (const f of [
          "basePrice",
          "additionalPrice",
          "inventory",
          "lowstockThreshold",
          "trackQuantity",
        ]) {
          if (input[f] !== undefined)
            setDoc[`subcategories.${idx}.${f}`] = input[f];
        }
        if (Object.keys(setDoc).length === 0)
          return { error: "No fields to update" };
        await this.productModel.findByIdAndUpdate(product._id, {
          $set: setDoc,
        });
        return {
          success: true,
          product: product.name,
          subcategory: product.subcategories[idx].name,
          updated: Object.keys(setDoc),
        };
      }
      case "update_option": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const q = (input.option_title || "").toLowerCase();
        const idx = (product.productOptions || []).findIndex(
          (o: any) =>
            (o.title || "").toLowerCase() === q ||
            (o.title || "").toLowerCase().includes(q),
        );
        if (idx < 0)
          return {
            error: "Option not found",
            availableOptions: (product.productOptions || []).map(
              (o: any) => o.title,
            ),
          };
        const setDoc: any = {};
        for (const f of [
          "price",
          "inventory",
          "lowstockThreshold",
          "trackQuantity",
          "isDiscounted",
          "discountedPrice",
        ]) {
          if (input[f] !== undefined)
            setDoc[`productOptions.${idx}.${f}`] = input[f];
        }
        if (Object.keys(setDoc).length === 0)
          return { error: "No fields to update" };
        await this.productModel.findByIdAndUpdate(product._id, {
          $set: setDoc,
        });
        return {
          success: true,
          product: product.name,
          option: product.productOptions[idx].title,
          updated: Object.keys(setDoc),
        };
      }
      case "add_variant": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        if (!input.title || input.price === undefined)
          return { error: "title and price are required" };
        const variant = {
          id: Date.now(),
          title: String(input.title),
          price: Number(input.price),
          sku: input.sku
            ? String(input.sku)
            : `${product.name.slice(0, 3).toUpperCase()}-${String(input.title).slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
          inventory:
            input.inventory !== undefined ? Number(input.inventory) : 0,
          trackQuantity: !!input.trackQuantity,
          lowstockThreshold:
            input.lowstockThreshold !== undefined
              ? Number(input.lowstockThreshold)
              : 10,
          options: {},
        };
        if (input.subcategory_name) {
          const sq = String(input.subcategory_name).toLowerCase();
          const si = (product.subcategories || []).findIndex(
            (s: any) =>
              (s.name || "").toLowerCase() === sq ||
              (s.name || "").toLowerCase().includes(sq),
          );
          if (si < 0)
            return {
              error: `Subcategory "${input.subcategory_name}" not found`,
              availableSubcategories: (product.subcategories || []).map(
                (s: any) => s.name,
              ),
            };
          await this.productModel.findByIdAndUpdate(product._id, {
            $push: { [`subcategories.${si}.variants`]: variant },
          });
          return {
            success: true,
            product: product.name,
            addedTo: `${product.subcategories[si].name} (subcategory)`,
            variant,
          };
        }
        await this.productModel.findByIdAndUpdate(product._id, {
          $push: { variants: variant },
        });
        return {
          success: true,
          product: product.name,
          addedTo: "top-level variants",
          variant,
        };
      }
      case "remove_variant": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const vq = String(input.variant_title || "").toLowerCase();
        const match = (v: any) =>
          (v.title || "").toLowerCase() === vq ||
          (v.title || "").toLowerCase().includes(vq) ||
          (v.sku || "").toLowerCase() === vq;
        if (input.subcategory_name) {
          const sq = String(input.subcategory_name).toLowerCase();
          const si = (product.subcategories || []).findIndex(
            (s: any) =>
              (s.name || "").toLowerCase() === sq ||
              (s.name || "").toLowerCase().includes(sq),
          );
          if (si < 0)
            return {
              error: `Subcategory "${input.subcategory_name}" not found`,
            };
          const v = (product.subcategories[si].variants || []).find(match);
          if (!v)
            return {
              error: `Variant "${input.variant_title}" not found in ${product.subcategories[si].name}`,
              availableVariants: (product.subcategories[si].variants || []).map(
                (x: any) => x.title,
              ),
            };
          await this.productModel.findByIdAndUpdate(product._id, {
            $pull: { [`subcategories.${si}.variants`]: { id: v.id } },
          });
          return {
            success: true,
            product: product.name,
            removed: `${product.subcategories[si].name} > ${v.title}`,
          };
        }
        const v = (product.variants || []).find(match);
        if (!v)
          return {
            error: `Variant "${input.variant_title}" not found`,
            availableVariants: (product.variants || []).map(
              (x: any) => x.title,
            ),
          };
        await this.productModel.findByIdAndUpdate(product._id, {
          $pull: { variants: { id: v.id } },
        });
        return { success: true, product: product.name, removed: v.title };
      }
      case "add_subcategory": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        if (!input.name) return { error: "name is required" };
        const exists = (product.subcategories || []).some(
          (s: any) =>
            (s.name || "").toLowerCase() === String(input.name).toLowerCase(),
        );
        if (exists)
          return {
            error: `Subcategory "${input.name}" already exists on ${product.name}`,
          };
        const sub = {
          id: Date.now(),
          name: String(input.name),
          basePrice:
            input.basePrice !== undefined ? Number(input.basePrice) : 0,
          inventory:
            input.inventory !== undefined ? Number(input.inventory) : 0,
          trackQuantity: !!input.trackQuantity,
          lowstockThreshold:
            input.lowstockThreshold !== undefined
              ? Number(input.lowstockThreshold)
              : 10,
          variants: [],
        };
        await this.productModel.findByIdAndUpdate(product._id, {
          $push: { subcategories: sub },
        });
        return { success: true, product: product.name, added: sub.name };
      }
      case "remove_subcategory": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const sq = String(input.subcategory_name || "").toLowerCase();
        const sc = (product.subcategories || []).find(
          (s: any) =>
            (s.name || "").toLowerCase() === sq ||
            (s.name || "").toLowerCase().includes(sq),
        );
        if (!sc)
          return {
            error: `Subcategory "${input.subcategory_name}" not found`,
            availableSubcategories: (product.subcategories || []).map(
              (s: any) => s.name,
            ),
          };
        await this.productModel.findByIdAndUpdate(product._id, {
          $pull: { subcategories: { id: sc.id } },
        });
        return {
          success: true,
          product: product.name,
          removed: sc.name,
          removedVariantCount: (sc.variants || []).length,
        };
      }
      case "add_option": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        if (!input.title || input.price === undefined)
          return { error: "title and price are required" };
        const exists = (product.productOptions || []).some(
          (o: any) =>
            (o.title || "").toLowerCase() === String(input.title).toLowerCase(),
        );
        if (exists)
          return {
            error: `Option "${input.title}" already exists on ${product.name}`,
          };
        const opt = {
          id: Date.now(),
          title: String(input.title),
          price: Number(input.price),
          inventory:
            input.inventory !== undefined ? Number(input.inventory) : 0,
          trackQuantity: !!input.trackQuantity,
          lowstockThreshold:
            input.lowstockThreshold !== undefined
              ? Number(input.lowstockThreshold)
              : 10,
        };
        await this.productModel.findByIdAndUpdate(product._id, {
          $push: { productOptions: opt },
          $set: { hasOptions: true },
        });
        return { success: true, product: product.name, added: opt.title };
      }
      case "remove_option": {
        const p = await this.findOneProduct(sid, input.product_name);
        if ("error" in p) return p;
        const product: any = p.product;
        const q = String(input.option_title || "").toLowerCase();
        const opt = (product.productOptions || []).find(
          (o: any) =>
            (o.title || "").toLowerCase() === q ||
            (o.title || "").toLowerCase().includes(q),
        );
        if (!opt)
          return {
            error: `Option "${input.option_title}" not found`,
            availableOptions: (product.productOptions || []).map(
              (o: any) => o.title,
            ),
          };
        const remaining = (product.productOptions || []).filter(
          (o: any) => o.id !== opt.id,
        );
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
        await this.productModel.findByIdAndUpdate(product._id, {
          $set: { isSoftDeleted: true, softDeletedAt: new Date() },
        });
        return { success: true, deleted: product.name };
      }
      case "create_product": {
        if (!input.name || input.price === undefined || !input.category)
          return { error: "name, price and category are required" };
        const dup = await this.productModel
          .findOne({
            shopkeeperId: sid,
            name: { $regex: `^${String(input.name).trim()}$`, $options: "i" },
            isSoftDeleted: { $ne: true },
          })
          .lean();
        if (dup)
          return { error: `A product named "${input.name}" already exists` };
        const sku = input.sku
          ? String(input.sku)
          : `${String(input.name).slice(0, 3).toUpperCase().replace(/\s/g, "")}-${Date.now().toString().slice(-5)}`;
        const doc = await this.productModel.create({
          shopkeeperId: sid,
          name: String(input.name).trim(),
          price: Number(input.price),
          category: String(input.category).trim(),
          sku,
          status: input.status || "active",
          description: input.description || undefined,
          inventory:
            input.inventory !== undefined ? Number(input.inventory) : 0,
          trackQuantity: !!input.trackQuantity,
          lowstockThreshold:
            input.lowstockThreshold !== undefined
              ? Number(input.lowstockThreshold)
              : 10,
          tags: Array.isArray(input.tags)
            ? input.tags.map((t: any) => String(t).trim()).filter(Boolean)
            : [],
          images: [],
          variants: [],
          subcategories: [],
          productOptions: [],
        });
        return {
          success: true,
          product: {
            id: doc._id.toString(),
            name: doc.name,
            sku: doc.sku,
            price: doc.price,
            category: doc.category,
            status: doc.status,
          },
        };
      }
      case "bulk_update_products_status": {
        if (
          !Array.isArray(input.product_names) ||
          input.product_names.length === 0
        )
          return { error: "product_names array is required" };
        if (!["active", "draft", "archived"].includes(input.status))
          return { error: "status must be active | draft | archived" };
        const updated: string[] = [];
        const notFound: string[] = [];
        for (const raw of input.product_names) {
          const hits = await this.productModel
            .find({
              shopkeeperId: sid,
              isSoftDeleted: { $ne: true },
              name: { $regex: `^${String(raw).trim()}$`, $options: "i" },
            })
            .lean();
          if (hits.length === 1) {
            await this.productModel.updateOne(
              { _id: (hits[0] as any)._id },
              { $set: { status: input.status } },
            );
            updated.push((hits[0] as any).name);
          } else {
            notFound.push(raw);
          }
        }
        return { success: true, status: input.status, updated, notFound };
      }
      case "bulk_delete_products": {
        if (
          !Array.isArray(input.product_names) ||
          input.product_names.length === 0
        )
          return { error: "product_names array is required" };
        const deleted: string[] = [];
        const notFound: string[] = [];
        for (const raw of input.product_names) {
          const hits = await this.productModel
            .find({
              shopkeeperId: sid,
              isSoftDeleted: { $ne: true },
              name: { $regex: `^${String(raw).trim()}$`, $options: "i" },
            })
            .lean();
          if (hits.length === 1) {
            await this.productModel.updateOne(
              { _id: (hits[0] as any)._id },
              { $set: { isSoftDeleted: true, softDeletedAt: new Date() } },
            );
            deleted.push((hits[0] as any).name);
          } else {
            notFound.push(raw);
          }
        }
        return { success: true, deleted, notFound };
      }
      case "confirm_payment_by_order_id": {
        const order: any = await this.orderModel.findOne({
          shopkeeperId: sid,
          orderId: { $regex: input.order_id, $options: "i" },
          isSoftDeleted: { $ne: true },
        });
        if (!order) return { error: "Order not found" };
        const payment: any = await this.paymentEmailModel.findOne({
          shopkeeperId: sid,
          matchedOrderId: order.orderId,
          status: "matched",
        });
        if (!payment)
          return {
            error: "No matched payment awaiting confirmation for this order",
            hint: "Check if the payment email was received and matched, or use confirm_matched_payments to see the list.",
          };
        await this.paymentEmailModel.findByIdAndUpdate(payment._id, {
          status: "confirmed",
        });
        order.status = "processing";
        order.statusHistory = [
          ...(order.statusHistory || []),
          { status: "processing", changedAt: new Date(), changedBy: "KiosAI" },
        ];
        await order.save();
        return {
          success: true,
          orderId: order.orderId,
          amount: payment.amount,
          newStatus: "processing",
        };
      }
      case "place_order": {
        if (!Array.isArray(input.items) || input.items.length === 0)
          return { error: "No items provided" };
        const resolved: any[] = [];
        for (const it of input.items) {
          if (!it?.product_name)
            return { error: "Each item needs a product_name" };
          const quantity = Number(it.quantity || 1);
          // Primary lookup
          let prodMatches = await this.productModel
            .find({
              shopkeeperId: sid,
              isSoftDeleted: { $ne: true },
              name: { $regex: it.product_name, $options: "i" },
            })
            .lean();

          // Forgiveness path: weaker LLMs sometimes lump the whole descriptor into
          // product_name (e.g. "Clothes 9 XL" → 0 matches). If product_name has
          // spaces and no match, try progressively shorter prefixes and push the
          // remainder into variant_title for the resolver below.
          if (
            prodMatches.length === 0 &&
            typeof it.product_name === "string" &&
            it.product_name.includes(" ")
          ) {
            const words = it.product_name.trim().split(/\s+/);
            for (let n = words.length - 1; n >= 1; n--) {
              const guess = words.slice(0, n).join(" ");
              const rem = words.slice(n).join(" ");
              const cand = await this.productModel
                .find({
                  shopkeeperId: sid,
                  isSoftDeleted: { $ne: true },
                  name: { $regex: `^${guess}$|^${guess}\\b`, $options: "i" },
                })
                .lean();
              if (cand.length === 1) {
                prodMatches = cand;
                it.product_name = cand[0].name;
                if (!it.variant_title) it.variant_title = rem;
                else it.variant_title = `${rem} ${it.variant_title}`.trim();
                this.logger.log(
                  `[place_order] auto-split product_name → "${cand[0].name}" + variant "${it.variant_title}"`,
                );
                break;
              }
            }
          }

          if (prodMatches.length === 0)
            return { error: `Product not found: "${it.product_name}"` };
          if (prodMatches.length > 1)
            return {
              error: `Multiple products matched "${it.product_name}"`,
              matches: prodMatches.slice(0, 5).map((p: any) => p.name),
            };
          const prod: any = prodMatches[0];

          // Resolve up to three independent layers: productOption + subcategory + variant.
          // Final unit price = (variant/subcat base price OR product base price) + option price.
          // Number() everywhere because prices can be stored as strings in some catalogs.
          const num = (x: any) => Number(x) || 0;
          let basePrice = num(
            prod.isDiscounted && prod.discountedPrice
              ? prod.discountedPrice
              : prod.price,
          );
          let price = basePrice;
          let variantTitle: string | undefined;
          let subcategoryName: string | undefined;
          let optionTitle: string | undefined;
          let optionPrice: number | undefined;
          const hasOpts = (prod.productOptions || []).length > 0;
          const hasSubs = (prod.subcategories || []).length > 0;
          const hasVars = (prod.variants || []).length > 0;
          const avail = () => ({
            variants: (prod.variants || []).map((v: any) => v.title),
            subcategories: (prod.subcategories || []).map((sc: any) => sc.name),
            subcategoryVariants: (prod.subcategories || []).flatMap((sc: any) =>
              (sc.variants || []).map((v: any) => `${sc.name} > ${v.title}`),
            ),
            options: (prod.productOptions || []).map((o: any) => o.title),
          });

          // A) Resolve option_title first if provided OR if product requires an option
          if (it.option_title && hasOpts) {
            const oq = String(it.option_title).toLowerCase();
            const opt = (prod.productOptions || []).find(
              (o: any) =>
                (o.title || "").toLowerCase() === oq ||
                (o.title || "").toLowerCase().includes(oq),
            );
            if (!opt)
              return {
                error: `Option "${it.option_title}" not found on ${prod.name}`,
                available: {
                  options: (prod.productOptions || []).map((o: any) => o.title),
                },
              };
            optionTitle = opt.title;
            optionPrice = num(
              opt.isDiscounted && opt.discountedPrice
                ? opt.discountedPrice
                : opt.price,
            );
          }

          if (it.subcategory_name) {
            const sq = String(it.subcategory_name).toLowerCase();
            const sc = (prod.subcategories || []).find(
              (s: any) =>
                (s.name || "").toLowerCase() === sq ||
                (s.name || "").toLowerCase().includes(sq),
            );
            if (!sc)
              return {
                error: `Subcategory "${it.subcategory_name}" not found on ${prod.name}`,
                available: avail(),
              };
            subcategoryName = sc.name;
            if (it.variant_title) {
              const vq = String(it.variant_title).toLowerCase();
              const v = (sc.variants || []).find(
                (x: any) =>
                  (x.title || "").toLowerCase() === vq ||
                  (x.title || "").toLowerCase().includes(vq) ||
                  (x.sku || "").toLowerCase().includes(vq),
              );
              if (!v)
                return {
                  error: `Variant "${it.variant_title}" not found inside ${prod.name} > ${sc.name}`,
                  available: (sc.variants || []).map((x: any) => x.title),
                };
              variantTitle = v.title;
              price = num(
                v.isDiscounted && v.discountedPrice
                  ? v.discountedPrice
                  : v.price,
              );
            } else {
              // Subcategory-only (uses basePrice)
              price = num(sc.basePrice ?? prod.price);
            }
          } else if (it.variant_title) {
            const q = String(it.variant_title).toLowerCase();
            // 1. Top-level variants
            const top = (prod.variants || []).find(
              (v: any) =>
                (v.title || "").toLowerCase().includes(q) ||
                (v.sku || "").toLowerCase().includes(q),
            );
            if (top) {
              price = num(
                top.isDiscounted && top.discountedPrice
                  ? top.discountedPrice
                  : top.price,
              );
              variantTitle = top.title;
            }
            // 2. Subcategory > variants (match anywhere in the tree)
            if (!variantTitle) {
              for (const sc of prod.subcategories || []) {
                const scv = (sc.variants || []).find(
                  (v: any) =>
                    (v.title || "").toLowerCase().includes(q) ||
                    (v.sku || "").toLowerCase().includes(q),
                );
                if (scv) {
                  price = num(
                    scv.isDiscounted && scv.discountedPrice
                      ? scv.discountedPrice
                      : scv.price,
                  );
                  variantTitle = scv.title;
                  subcategoryName = sc.name;
                  break;
                }
              }
            }
            // 3. Subcategory by name
            if (!variantTitle && !subcategoryName) {
              const sc = (prod.subcategories || []).find((s: any) =>
                (s.name || "").toLowerCase().includes(q),
              );
              if (sc) {
                price = num(sc.basePrice ?? prod.price);
                subcategoryName = sc.name;
              }
            }
            // 4. productOptions (Size / Quantity / Pack)
            if (!variantTitle && !subcategoryName) {
              const opt = (prod.productOptions || []).find((o: any) =>
                (o.title || "").toLowerCase().includes(q),
              );
              if (opt) {
                // Option as the only leaf: it REPLACES the base price (no double-count).
                price = num(
                  opt.isDiscounted && opt.discountedPrice
                    ? opt.discountedPrice
                    : opt.price,
                );
                optionTitle = opt.title;
                optionPrice = 0; // already counted in `price`
              }
            }
            // 5. Fallback: auto-split multi-word descriptors as subcategory + variant.
            // Handles "Veg Medium", "Summer Red L", etc. where the LLM didn't use
            // subcategory_name explicitly. Tries each subcategory whose name is a
            // prefix of the descriptor, then looks for the remainder in its variants.
            if (
              !variantTitle &&
              !subcategoryName &&
              !optionTitle &&
              q.includes(" ")
            ) {
              outer: for (const sc of prod.subcategories || []) {
                const scName = (sc.name || "").toLowerCase();
                if (!scName || !q.startsWith(scName + " ")) continue;
                const remainder = q.slice(scName.length).trim();
                for (const v of sc.variants || []) {
                  const vt = (v.title || "").toLowerCase();
                  const vs = (v.sku || "").toLowerCase();
                  if (
                    vt === remainder ||
                    vt.includes(remainder) ||
                    vs === remainder
                  ) {
                    price = num(
                      v.isDiscounted && v.discountedPrice
                        ? v.discountedPrice
                        : v.price,
                    );
                    variantTitle = v.title;
                    subcategoryName = sc.name;
                    break outer;
                  }
                }
              }
            }
            // 6. Fuzzy multi-layer: the caller lumped several leaves into
            // variant_title (e.g. "option 9 T-shirt XL"). Tokenise the string,
            // strip filler words, and match each known option / subcategory /
            // variant by substring. Only accept when at least one layer matches.
            if (!variantTitle && !subcategoryName && !optionTitle) {
              const haystack = q;
              const normalise = (s: any) =>
                String(s || "")
                  .toLowerCase()
                  .trim();
              // productOption
              for (const o of prod.productOptions || []) {
                const t = normalise(o.title);
                if (t && new RegExp(`(^|\\W)${t}(\\W|$)`).test(haystack)) {
                  optionTitle = o.title;
                  optionPrice = num(
                    o.isDiscounted && o.discountedPrice
                      ? o.discountedPrice
                      : o.price,
                  );
                  break;
                }
              }
              // subcategory
              for (const sc of prod.subcategories || []) {
                const n = normalise(sc.name);
                if (n && haystack.includes(n)) {
                  subcategoryName = sc.name;
                  // variant inside that subcategory
                  for (const v of sc.variants || []) {
                    const vt = normalise(v.title);
                    if (
                      vt &&
                      new RegExp(`(^|\\W)${vt}(\\W|$)`).test(haystack)
                    ) {
                      variantTitle = v.title;
                      price = num(
                        v.isDiscounted && v.discountedPrice
                          ? v.discountedPrice
                          : v.price,
                      );
                      break;
                    }
                  }
                  if (!variantTitle) price = num(sc.basePrice ?? prod.price);
                  break;
                }
              }
              // top-level variant if no subcategory used
              if (!subcategoryName && !variantTitle) {
                for (const v of prod.variants || []) {
                  const vt = normalise(v.title);
                  if (vt && new RegExp(`(^|\\W)${vt}(\\W|$)`).test(haystack)) {
                    variantTitle = v.title;
                    price = num(
                      v.isDiscounted && v.discountedPrice
                        ? v.discountedPrice
                        : v.price,
                    );
                    break;
                  }
                }
              }
            }
            if (!variantTitle && !subcategoryName && !optionTitle) {
              return {
                error: `No variant/subcategory/option matching "${it.variant_title}" on ${prod.name}`,
                available: avail(),
              };
            }
          }

          // Per-layer validation. A product that exposes a layer MUST have that
          // layer resolved (otherwise we'd silently ring it up at the wrong price).
          const missing: string[] = [];
          if (hasOpts && !optionTitle)
            missing.push(
              `option (${(prod.productOptions || []).map((o: any) => o.title).join(" / ")})`,
            );
          if (hasSubs && !subcategoryName)
            missing.push(
              `subcategory (${(prod.subcategories || []).map((s: any) => s.name).join(" / ")})`,
            );
          // If the selected subcategory has variants of its own, require a variant
          if (subcategoryName && !variantTitle) {
            const sc = (prod.subcategories || []).find(
              (s: any) => s.name === subcategoryName,
            );
            if (sc && (sc.variants || []).length > 0) {
              missing.push(
                `variant for ${subcategoryName} (${(sc.variants || []).map((v: any) => v.title).join(" / ")})`,
              );
            }
          }
          if (hasVars && !subcategoryName && !variantTitle && !optionTitle) {
            missing.push(
              `variant (${(prod.variants || []).map((v: any) => v.title).join(" / ")})`,
            );
          }
          if (missing.length > 0) {
            return {
              error: `"${prod.name}" needs: ${missing.join(" AND ")}. Please specify all required leaves and try again.`,
              available: avail(),
            };
          }

          // Final unit price = (variant/sub base price OR product base price) + option add-on
          const unitPrice = (price || 0) + (optionPrice || 0);
          this.logger.log(
            `[place_order] resolved ${prod.name} → option="${optionTitle}" (${optionPrice}) + subcat="${subcategoryName}" + variant="${variantTitle}" (${price}) = unit ${unitPrice} × qty ${quantity}`,
          );
          resolved.push({
            productId: prod._id.toString(),
            productName: prod.name,
            price: unitPrice,
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
        const subtotal = resolved.reduce(
          (s, r) => s + (r.price || 0) * (r.quantity || 0),
          0,
        );
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const discountPct = Number(sk?.discountPercentage || 0);
        const taxPct = Number(sk?.taxPercentage || 0);
        const discount = (subtotal * discountPct) / 100;
        const afterDiscount = subtotal - discount;
        const tax = (afterDiscount * taxPct) / 100;
        const totalAmount = Math.round((afterDiscount + tax) * 100) / 100;

        const paymentMethod = String(
          input.payment_method || "qr",
        ).toLowerCase();
        const isCash = paymentMethod === "cash";
        const orderId = `KIOSAI-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const nameParts = String(input.customer_name || "")
          .trim()
          .split(/\s+/);
        const now = new Date();
        const pickupDate = now.toISOString().split("T")[0];
        const pickupTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        // Resolve WhatsApp + email: if the shopkeeper only gave a name, try to
        // look the customer up in their CRM (created or previously ordered). Only
        // demand phone+email when the customer is brand new.
        const shopDoc: any = await this.shopkeeperModel.findById(sid).lean();
        const defaultCC = (shopDoc?.country || "")
          .toString()
          .toUpperCase()
          .startsWith("SG")
          ? "+65"
          : "+91";
        let whatsAppNumber = this.normalisePhone(input.whatsapp, defaultCC);
        let email = this.normaliseEmail(input.email);
        let existingUser: any = null;

        if (!whatsAppNumber && input.customer_name) {
          const matches = await this.findCustomersForShopkeeper(
            sid,
            input.customer_name,
          );
          if (matches.length === 1) {
            existingUser = matches[0];
            whatsAppNumber = existingUser.whatsAppNumber;
            if (!email) email = existingUser.email || undefined;
          } else if (matches.length > 1) {
            return {
              error: `Found ${matches.length} customers named "${input.customer_name}". Please include the WhatsApp number so I know which one.`,
              matches: matches
                .slice(0, 5)
                .map((m: any) => ({
                  name: m.name,
                  whatsapp: m.whatsAppNumber,
                  email: m.email,
                })),
            };
          } else {
            return {
              error: `"${input.customer_name}" isn't in your CRM yet. Please share their WhatsApp number (and email if possible) and I'll place the order + add them as a customer.`,
              missing: ["whatsapp", "email"],
            };
          }
        }

        if (!whatsAppNumber)
          return { error: "WhatsApp number is required for a new customer." };

        try {
          // Upsert user by WhatsApp, matching OrdersService.createOrder.
          let user: any =
            existingUser ||
            (await this.userModel.findOne({ whatsAppNumber }).lean());
          if (!user) {
            user = await this.userModel.create({
              name: input.customer_name || "Kiosk Customer",
              email: email || null,
              password: null,
              provider: "Shopkeeper",
              providerId: sid,
              whatsAppNumber,
            });
          } else if (email && !user.email) {
            // Backfill email on an existing phone-only user
            await this.userModel.updateOne(
              { _id: user._id },
              { $set: { email } },
            );
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
            customerWhatsApp:
              whatsAppNumber !== "kiosk-order" ? whatsAppNumber : undefined,
            customerEmail: email,
            status: isCash ? "processing" : "pending",
            paymentConfirmed: isCash,
            instructions: input.instructions || undefined,
            statusHistory: [
              {
                status: isCash ? "processing" : "pending",
                changedAt: new Date(),
                changedBy: "KiosAI",
              },
            ],
          });
          for (const r of resolved) {
            if (!r.trackQuantity) continue;
            try {
              if (r.variantTitle && r.subcategoryName) {
                await this.productModel.updateOne(
                  {
                    _id: r.productId,
                    "subcategories.name": r.subcategoryName,
                    "subcategories.variants.title": r.variantTitle,
                  },
                  {
                    $inc: {
                      "subcategories.$[sc].variants.$[v].inventory":
                        -r.quantity,
                    },
                  },
                  {
                    arrayFilters: [
                      { "sc.name": r.subcategoryName },
                      { "v.title": r.variantTitle },
                    ],
                  } as any,
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
                await this.productModel.updateOne(
                  { _id: r.productId },
                  { $inc: { inventory: -r.quantity } },
                );
              }
            } catch (invErr) {
              this.logger.warn(
                `Inventory decrement failed for ${r.productName}: ${(invErr as any)?.message}`,
              );
            }
          }
          return {
            success: true,
            orderId: order.orderId,
            // Mongo _id surfaced for downstream callers (renderKioskOrderReply
            // uses it to wire a Download Receipt pill on cash orders).
            orderMongoId: order._id.toString(),
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
            items: resolved.map((r) => ({
              name: r.productName,
              variant: r.variantTitle,
              subcategory: r.subcategoryName,
              option: r.optionTitle,
              optionPrice: r.optionPrice,
              qty: r.quantity,
              unitPrice: r.price, // already includes option price add-on
            })),
            nextStep: isCash
              ? "Call get_order_receipt with this orderId to provide a PDF receipt."
              : "Call get_payment_qr with this orderId to show the customer a QR code.",
          };
        } catch (err: any) {
          return { error: `Failed to create order: ${err.message}` };
        }
      }
      case "get_payment_qr": {
        const order: any = await this.orderModel
          .findOne({
            shopkeeperId: sid,
            orderId: { $regex: input.order_id, $options: "i" },
            isSoftDeleted: { $ne: true },
          })
          .lean();
        if (!order) return { error: "Order not found" };
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const rawCountry = (sk?.country || "IN")
          .toString()
          .trim()
          .toUpperCase();
        const country =
          rawCountry.startsWith("SG") || rawCountry.startsWith("SING")
            ? "SG"
            : "IN";
        return {
          orderId: order.orderId,
          orderMongoId: order._id.toString(),
          amount: order.totalAmount,
          country,
          shopName: sk?.shopName,
          shopkeeperPhone: country === "SG" ? sk?.whatsappNumber : undefined,
          paymentURL: country === "IN" ? sk?.paymentURL : undefined,
          message:
            country === "SG"
              ? "PayNow QR will be shown."
              : "UPI QR will be shown.",
        };
      }
      case "get_order_receipt": {
        const order: any = await this.orderModel
          .findOne({
            shopkeeperId: sid,
            orderId: { $regex: input.order_id, $options: "i" },
            isSoftDeleted: { $ne: true },
          })
          .lean();
        if (!order) return { error: "Order not found" };
        // Receipt endpoint returns the PDF; the frontend can embed or open in a new tab.
        const baseUrl =
          process.env.BACKEND_URL ||
          `http://localhost:${process.env.PORT || 3000}`;
        return {
          orderId: order.orderId,
          receiptUrl: `${baseUrl}/orders/${order._id}/receipt`,
          message:
            "Share this URL with the customer, or open it to view/print the receipt.",
        };
      }
      case "get_analytics": {
        try {
          const r = await fetch(
            `http://localhost:${process.env.PORT || 3000}/shopkeeper/analytics/${sid}/report/${input.period}`,
          );
          if (!r.ok) return { error: "Failed" };
          const d = (await r.json()).data;
          // Normalise topProducts to the shape the chatbot widget renders
          // ({ name, sold, revenue }). The analytics report itself uses
          // { productName, totalQuantity, totalRevenue }, which would otherwise
          // render as blank rows.
          const topProducts = Array.isArray(d.topProducts)
            ? d.topProducts.slice(0, 5).map((p: any) => ({
                name: p.productName ?? p.name,
                sold: p.totalQuantity ?? p.sold,
                revenue: p.totalRevenue ?? p.revenue,
              }))
            : undefined;
          return {
            revenue: d.totalRevenue,
            orders: d.totalOrders,
            customers: d.totalCustomers,
            avgOrder: d.avgOrderValue,
            items: d.totalItems,
            currency: d.currencySymbol,
            topProducts,
          };
        } catch {
          return { error: "Unavailable" };
        }
      }
      case "get_today_revenue": {
        const s = new Date();
        s.setHours(0, 0, 0, 0);
        const orders = await this.orderModel
          .find({
            shopkeeperId: sid,
            createdAt: { $gte: s },
            isSoftDeleted: { $ne: true },
          })
          .lean();
        return {
          revenue: orders.reduce(
            (a: number, o: any) => a + (o.totalAmount || 0),
            0,
          ),
          orderCount: orders.length,
        };
      }
      case "get_top_products": {
        const agg = await this.orderModel.aggregate([
          { $match: { shopkeeperId: sid, isSoftDeleted: { $ne: true } } },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.productName",
              totalQty: { $sum: "$items.quantity" },
              revenue: {
                $sum: {
                  $multiply: [
                    {
                      $convert: {
                        input: "$items.price",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                    {
                      $convert: {
                        input: "$items.quantity",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ]);
        return agg.map((p: any) => ({
          name: p._id,
          sold: p.totalQty,
          revenue: p.revenue,
        }));
      }
      case "get_product_analytics": {
        const name = (input.product_name || "").trim();
        if (!name) return { error: "product_name is required" };
        const product = await this.findProductByName(sid, name);
        if (!product)
          return {
            error: `No product matched "${name}". Try the exact catalog name.`,
          };
        const range = this.resolveRange(input);
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const country = (sk?.country || "IN").toString().trim().toUpperCase();
        const currency =
          country.startsWith("SG") || country.startsWith("SING") ? "S$" : "Rs.";
        const match: any = { shopkeeperId: sid, isSoftDeleted: { $ne: true } };
        if (range) match.createdAt = { $gte: range.start, $lt: range.end };
        // Match on either productName (chat-style "Product · Variant") or productId.
        const escName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        match["items.productName"] = { $regex: escName, $options: "i" };
        const headline = await this.orderModel.aggregate([
          { $match: match },
          { $unwind: "$items" },
          {
            $match: { "items.productName": { $regex: escName, $options: "i" } },
          },
          {
            $group: {
              _id: null,
              revenue: {
                $sum: {
                  $multiply: [
                    {
                      $convert: {
                        input: "$items.price",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                    {
                      $convert: {
                        input: "$items.quantity",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              },
              units: {
                $sum: {
                  $convert: {
                    input: "$items.quantity",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
              orderIds: { $addToSet: "$_id" },
              userIds: { $addToSet: "$userId" },
            },
          },
        ]);
        const variants = await this.orderModel.aggregate([
          { $match: match },
          { $unwind: "$items" },
          {
            $match: { "items.productName": { $regex: escName, $options: "i" } },
          },
          {
            $group: {
              _id: {
                $ifNull: [
                  "$items.variantTitle",
                  { $ifNull: ["$items.optionTitle", "$items.subcategoryName"] },
                ],
              },
              sold: {
                $sum: {
                  $convert: {
                    input: "$items.quantity",
                    to: "double",
                    onError: 0,
                    onNull: 0,
                  },
                },
              },
              revenue: {
                $sum: {
                  $multiply: [
                    {
                      $convert: {
                        input: "$items.price",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                    {
                      $convert: {
                        input: "$items.quantity",
                        to: "double",
                        onError: 0,
                        onNull: 0,
                      },
                    },
                  ],
                },
              },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
        ]);
        const h = headline[0] || {
          revenue: 0,
          units: 0,
          orderIds: [],
          userIds: [],
        };
        const orders = (h.orderIds || []).length;
        const customers = (h.userIds || []).filter(Boolean).length;
        return {
          revenue: Math.round((h.revenue || 0) * 100) / 100,
          orders,
          // For a product, "units" is more interesting than avg-order, so we
          // surface it as avgOrder. The widget renders units when subject="product".
          avgOrder: h.units || 0,
          customers,
          currency,
          period: range?.label || input.period || "all",
          subject: "product",
          subjectName: product.name,
          topProducts: variants
            .filter((v: any) => v._id)
            .map((v: any) => ({
              name: String(v._id),
              sold: v.sold,
              revenue: Math.round((v.revenue || 0) * 100) / 100,
            })),
        };
      }
      case "get_customer_analytics": {
        const user = await this.findCustomer(input);
        if (!user)
          return {
            error: "Customer not found. Try a different phone / email / name.",
          };
        const range = this.resolveRange(input);
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const country = (sk?.country || "IN").toString().trim().toUpperCase();
        const currency =
          country.startsWith("SG") || country.startsWith("SING") ? "S$" : "Rs.";
        const match: any = {
          shopkeeperId: sid,
          userId: user._id.toString(),
          isSoftDeleted: { $ne: true },
        };
        if (range) match.createdAt = { $gte: range.start, $lt: range.end };
        const orders = await this.orderModel
          .find(match)
          .sort({ createdAt: -1 })
          .lean();
        const totalSpent = orders.reduce(
          (s: number, o: any) => s + (Number(o.totalAmount) || 0),
          0,
        );
        const orderCount = orders.length;
        const avgOrder = orderCount ? totalSpent / orderCount : 0;
        // Favorite products — aggregate quantity & revenue across this customer's orders.
        const favMap = new Map<string, { sold: number; revenue: number }>();
        for (const o of orders) {
          for (const it of (o as any).items || []) {
            const key = String(it.productName || "Unknown");
            const cur = favMap.get(key) || { sold: 0, revenue: 0 };
            cur.sold += Number(it.quantity) || 0;
            cur.revenue += (Number(it.price) || 0) * (Number(it.quantity) || 0);
            favMap.set(key, cur);
          }
        }
        const favorites = Array.from(favMap.entries())
          .map(([name, v]) => ({
            name,
            sold: v.sold,
            revenue: Math.round(v.revenue * 100) / 100,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
        return {
          revenue: Math.round(totalSpent * 100) / 100,
          orders: orderCount,
          avgOrder: Math.round(avgOrder * 100) / 100,
          // For a customer, "customers" slot doubles as their unique-product variety,
          // which is useful for spotting one-product-only buyers vs explorers.
          customers: favorites.length,
          currency,
          period: range?.label || input.period || "all",
          subject: "customer",
          subjectName: user.name || user.whatsAppNumber || "Customer",
          topProducts: favorites,
        };
      }
      case "get_order_analytics": {
        const order: any = await this.orderModel
          .findOne({
            orderId: input.order_id,
            shopkeeperId: sid,
            isSoftDeleted: { $ne: true },
          })
          .lean();
        if (!order) return { error: `Order ${input.order_id} not found.` };
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const country = (sk?.country || "IN").toString().trim().toUpperCase();
        const currency =
          country.startsWith("SG") || country.startsWith("SING") ? "S$" : "Rs.";
        const items = (order.items || []).map((i: any) => ({
          name: [i.productName, i.subcategoryName, i.variantTitle]
            .filter(Boolean)
            .join(" · "),
          sold: Number(i.quantity) || 0,
          revenue:
            Math.round(
              (Number(i.price) || 0) * (Number(i.quantity) || 0) * 100,
            ) / 100,
        }));
        const totalUnits = items.reduce((s: number, x: any) => s + x.sold, 0);
        const user: any = order.userId
          ? await this.userModel.findById(order.userId).lean()
          : null;
        return {
          revenue: Math.round((Number(order.totalAmount) || 0) * 100) / 100,
          orders: 1,
          avgOrder: totalUnits, // re-purposed as units
          customers: 1,
          currency,
          period: "all",
          subject: "product", // reuse product card layout (units + line-item table)
          subjectName: `Order ${order.orderId}${user?.name ? ` · ${user.name}` : ""}`,
          topProducts: items,
        };
      }
      case "get_payment_summary": {
        const [u, m, c, ig] = await Promise.all([
          this.paymentEmailModel.countDocuments({
            shopkeeperId: sid,
            status: "unmatched",
          }),
          this.paymentEmailModel.countDocuments({
            shopkeeperId: sid,
            status: "matched",
          }),
          this.paymentEmailModel.countDocuments({
            shopkeeperId: sid,
            status: "confirmed",
          }),
          this.paymentEmailModel.countDocuments({
            shopkeeperId: sid,
            status: "ignored",
          }),
        ]);
        return {
          unmatched: u,
          matched: m,
          confirmed: c,
          ignored: ig,
          total: u + m + c + ig,
        };
      }
      case "confirm_matched_payments": {
        const matched = await this.paymentEmailModel
          .find({
            shopkeeperId: sid,
            status: "matched",
            matchedOrderId: { $ne: null },
          })
          .lean();
        let count = 0;
        for (const pe of matched) {
          await this.paymentEmailModel.findByIdAndUpdate(pe._id, {
            status: "confirmed",
          });
          await this.orderModel.findOneAndUpdate(
            { orderId: pe.matchedOrderId, status: "pending" },
            {
              status: "processing",
              $push: {
                statusHistory: {
                  status: "processing",
                  changedAt: new Date(),
                  changedBy: "KiosAI",
                },
              },
            },
          );
          count++;
        }
        return { confirmed: count };
      }
      case "confirm_today_orders": {
        // Move ALL of today's pending orders → processing in one shot.
        // Anything already in processing / completed / cancelled is left
        // untouched (per shopkeeper request: "if some are in processing
        // then no change other all changed").
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayOrders: any[] = await this.orderModel
          .find({
            shopkeeperId: sid,
            createdAt: { $gte: startOfDay },
            isSoftDeleted: { $ne: true },
          })
          .lean();
        const pending = todayOrders.filter((o) => o.status === "pending");
        const alreadyProcessing = todayOrders.filter(
          (o) => o.status === "processing",
        ).length;
        const completed = todayOrders.filter(
          (o) => o.status === "completed",
        ).length;
        const cancelled = todayOrders.filter(
          (o) => o.status === "cancelled",
        ).length;

        if (pending.length === 0) {
          return {
            confirmed: 0,
            alreadyProcessing,
            completed,
            cancelled,
            total: todayOrders.length,
            message:
              todayOrders.length === 0
                ? "No orders today yet."
                : "All today's orders are already past pending — nothing to confirm.",
            confirmedOrders: [],
          };
        }

        const now = new Date();
        await this.orderModel.updateMany(
          { _id: { $in: pending.map((o) => o._id) } },
          {
            $set: { status: "processing" },
            $push: {
              statusHistory: {
                status: "processing",
                changedAt: now,
                changedBy: "KiosAI",
              },
            },
          },
        );

        return {
          confirmed: pending.length,
          alreadyProcessing,
          completed,
          cancelled,
          total: todayOrders.length,
          confirmedOrders: pending.slice(0, 20).map((o) => ({
            orderId: o.orderId,
            amount: o.totalAmount,
            customer: o.customerName || o.firstName || "Customer",
          })),
        };
      }
      case "get_matched_payments": {
        const p = await this.paymentEmailModel
          .find({
            shopkeeperId: sid,
            status: "matched",
            matchedOrderId: { $ne: null },
          })
          .sort({ receivedAt: -1 })
          .limit(10)
          .lean();
        return p.map((x: any) => ({
          amount: x.amount,
          sender: x.senderName || x.from,
          orderId: x.matchedOrderId,
          provider: x.bankOrProvider,
        }));
      }
      case "get_unmatched_payments": {
        const p = await this.paymentEmailModel
          .find({ shopkeeperId: sid, status: "unmatched" })
          .sort({ receivedAt: -1 })
          .limit(10)
          .lean();
        return p.map((x: any) => ({
          amount: x.amount,
          sender: x.senderName || x.from,
          provider: x.bankOrProvider,
        }));
      }
      case "get_customers": {
        const agg = await this.orderModel.aggregate([
          { $match: { shopkeeperId: sid, isSoftDeleted: { $ne: true } } },
          { $group: { _id: "$userId" } },
        ]);
        return { totalCustomers: agg.length };
      }
      case "list_customers": {
        const limit = Math.min(Number(input.limit) || 20, 100);
        // Aggregate per-customer stats from the Order collection
        const stats = await this.orderModel.aggregate([
          { $match: { shopkeeperId: sid, isSoftDeleted: { $ne: true } } },
          {
            $group: {
              _id: "$userId",
              orderCount: { $sum: 1 },
              totalSpent: { $sum: { $ifNull: ["$totalAmount", 0] } },
              lastOrderDate: { $max: "$createdAt" },
            },
          },
          { $sort: { totalSpent: -1 } },
        ]);
        const userIds = stats.map((s: any) => s._id).filter(Boolean);
        const users = await this.userModel
          .find({ _id: { $in: userIds } })
          .lean();
        const userById = new Map(users.map((u: any) => [u._id.toString(), u]));
        // Also include shopkeeper-created users that have no orders yet, scoped
        // to THIS shopkeeper. The previous query was global (no providerId
        // filter) and case-mismatched, so it returned other shops' customers.
        const createdUsers = await this.userModel
          .find({ providerId: sid })
          .lean();
        for (const u of createdUsers as any[]) {
          const id = u._id.toString();
          if (!userById.has(id)) userById.set(id, u);
        }
        let combined = Array.from(userById.values()).map((u: any) => {
          const s =
            stats.find((x: any) => String(x._id) === String(u._id)) || {};
          const totalSpent = Number(s.totalSpent || 0);
          return {
            id: u._id.toString(),
            name: u.name,
            email: u.email,
            whatsapp: u.whatsAppNumber,
            orderCount: s.orderCount || 0,
            totalSpent,
            lastOrderDate: s.lastOrderDate,
            status:
              totalSpent > 100 ? "vip" : s.orderCount ? "active" : "inactive",
          };
        });
        if (input.search) {
          const q = String(input.search).toLowerCase();
          combined = combined.filter(
            (c) =>
              (c.name || "").toLowerCase().includes(q) ||
              (c.email || "").toLowerCase().includes(q) ||
              (c.whatsapp || "").toLowerCase().includes(q),
          );
        }
        if (input.vip_only)
          combined = combined.filter((c) => c.status === "vip");
        return { count: combined.length, customers: combined.slice(0, limit) };
      }
      case "get_customer": {
        const user = await this.findCustomer(input);
        if (!user)
          return {
            error: "Customer not found. Try a different phone / email / name.",
          };
        const orders = await this.orderModel
          .find({
            shopkeeperId: sid,
            userId: user._id.toString(),
            isSoftDeleted: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .lean();
        const totalSpent = orders.reduce(
          (s: number, o: any) => s + (Number(o.totalAmount) || 0),
          0,
        );
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          whatsapp: user.whatsAppNumber,
          provider: user.provider,
          joinDate: (user as any).createdAt,
          orderCount: orders.length,
          totalSpent: Math.round(totalSpent * 100) / 100,
          avgOrderValue: orders.length
            ? Math.round((totalSpent / orders.length) * 100) / 100
            : 0,
          firstOrderDate: orders[orders.length - 1]?.createdAt,
          lastOrderDate: orders[0]?.createdAt,
          status:
            totalSpent > 100 ? "vip" : orders.length ? "active" : "inactive",
          // Full history — order by most recent first
          orderHistory: orders.map((o: any) => ({
            orderId: o.orderId,
            status: o.status,
            totalAmount: o.totalAmount,
            orderType: o.orderType,
            paymentConfirmed: o.paymentConfirmed,
            createdAt: o.createdAt,
            items: (o.items || []).map((i: any) => {
              const extras = [i.subcategoryName, i.variantTitle]
                .filter(Boolean)
                .join(" > ");
              const optPart = i.optionTitle ? ` [opt ${i.optionTitle}]` : "";
              return `${i.quantity}× ${i.productName}${extras ? ` (${extras})` : ""}${optPart}`;
            }),
          })),
        };
      }
      case "get_customer_orders": {
        const user = await this.findCustomer(input);
        if (!user)
          return {
            error: "Customer not found. Try a different phone / email / name.",
          };
        const limit = Math.min(Number(input.limit) || 10, 50);
        const orders = await this.orderModel
          .find({
            shopkeeperId: sid,
            userId: user._id.toString(),
            isSoftDeleted: { $ne: true },
          })
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
        return {
          customer: user.name || user.whatsAppNumber,
          orders: orders.map((o: any) => ({
            orderId: o.orderId,
            status: o.status,
            totalAmount: o.totalAmount,
            orderType: o.orderType,
            createdAt: o.createdAt,
            items: (o.items || [])
              .map(
                (i: any) =>
                  `${i.quantity}× ${i.productName}${i.variantTitle ? ` (${i.variantTitle})` : ""}`,
              )
              .join(", "),
          })),
        };
      }
      case "create_customer": {
        const { first_name, last_name } = input;
        if (!first_name || !last_name)
          return { error: "first_name and last_name are required" };
        // Normalise voice-transcribed inputs: "8347 450600" → "+918347450600",
        // "MK vartani at Gmail.com" → "mkvartani@gmail.com"
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const country = (sk?.country || "IN").toString().trim().toUpperCase();
        const defaultCC =
          country.startsWith("SG") || country.startsWith("SING")
            ? "+65"
            : "+91";
        const whatsapp = this.normalisePhone(input.whatsapp, defaultCC);
        if (!whatsapp)
          return {
            error:
              "A valid whatsapp number is required (include country code if possible)",
          };
        const email = this.normaliseEmail(input.email);
        const existing: any = await this.userModel
          .findOne({ whatsAppNumber: whatsapp })
          .lean();
        if (existing)
          return {
            error: "A customer with that whatsapp already exists",
            existing: {
              id: existing._id.toString(),
              name: existing.name,
              email: existing.email,
            },
          };
        const user = await this.userModel.create({
          name: `${first_name} ${last_name}`.trim(),
          email: email || null,
          password: null,
          // The CRM tab filters users by { provider: "Shopkeeper", providerId: shopkeeperId }
          // (see users.service.fetchUsersByShopkeeperId), so both fields must match exactly.
          provider: "Shopkeeper",
          providerId: sid,
          whatsAppNumber: whatsapp,
        });
        return {
          success: true,
          customer: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            whatsapp: user.whatsAppNumber,
          },
        };
      }
      case "update_customer": {
        const user: any = await this.findCustomer(input);
        if (!user) return { error: "Customer not found" };
        const updates: any = {};
        if (input.new_first_name || input.new_last_name) {
          const first =
            input.new_first_name || user.name?.split(" ")?.[0] || "";
          const last =
            input.new_last_name ??
            user.name?.split(" ")?.slice(1).join(" ") ??
            "";
          updates.name = `${first} ${last}`.trim();
        }
        if (input.new_whatsapp !== undefined) {
          const sk: any = await this.shopkeeperModel.findById(sid).lean();
          const defaultCC = (sk?.country || "")
            .toString()
            .toUpperCase()
            .startsWith("SG")
            ? "+65"
            : "+91";
          const phone = this.normalisePhone(input.new_whatsapp, defaultCC);
          if (!phone) return { error: "Invalid new_whatsapp" };
          updates.whatsAppNumber = phone;
        }
        if (input.new_email !== undefined)
          updates.email = this.normaliseEmail(input.new_email);
        if (Object.keys(updates).length === 0)
          return {
            error:
              "No fields to update. Provide new_first_name / new_last_name / new_whatsapp / new_email.",
          };
        await this.userModel.updateOne({ _id: user._id }, { $set: updates });
        return {
          success: true,
          customer: { id: user._id.toString(), ...updates },
        };
      }
      case "get_crm_stats": {
        const orders = await this.orderModel
          .find(
            { shopkeeperId: sid, isSoftDeleted: { $ne: true } },
            { userId: 1, totalAmount: 1 },
          )
          .lean();
        const byUser = new Map<string, { count: number; spent: number }>();
        let totalRevenue = 0;
        for (const o of orders) {
          const uid = String(o.userId);
          const amt = Number(o.totalAmount) || 0;
          totalRevenue += amt;
          const cur = byUser.get(uid) || { count: 0, spent: 0 };
          cur.count++;
          cur.spent += amt;
          byUser.set(uid, cur);
        }
        const totalCustomers = byUser.size;
        const vipCount = Array.from(byUser.values()).filter(
          (v) => v.spent > 100,
        ).length;
        // Local vs international based on shopkeeper country
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        const country = (sk?.country || "IN").toString().trim().toUpperCase();
        const localPrefix =
          country.startsWith("SG") || country.startsWith("SING")
            ? "+65"
            : "+91";
        const users = await this.userModel
          .find(
            { _id: { $in: Array.from(byUser.keys()) } },
            { whatsAppNumber: 1 },
          )
          .lean();
        const localCustomers = users.filter((u: any) =>
          (u.whatsAppNumber || "").startsWith(localPrefix),
        ).length;
        const totalOrders = orders.length;
        const avgOrderValue = totalOrders
          ? Math.round((totalRevenue / totalOrders) * 100) / 100
          : 0;
        return {
          totalCustomers,
          vipCount,
          totalOrders,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          avgOrderValue,
          localCustomers,
          internationalCustomers: totalCustomers - localCustomers,
        };
      }
      case "get_coupons": {
        const c = await this.couponModel
          .find({ shopkeeperId: sid, isDeleted: false, isActive: true })
          .lean();
        return c.map((x: any) => ({
          code: x.code,
          type: x.discountType,
          value:
            x.discountType === "PERCENTAGE"
              ? x.discountPercentage + "%"
              : "$" + x.flatDiscountAmount,
          used: x.usedCount,
          max: x.maxUsage || "unlimited",
        }));
      }
      case "get_plan_info": {
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        if (!sk?.planId) return { subscribed: false };
        const plan: any = await this.planModel.findById(sk.planId).lean();
        const exp = sk.planExpiryDate ? new Date(sk.planExpiryDate) : null;
        return {
          planName: plan?.planName,
          price: sk.pricePaid,
          daysLeft: exp
            ? Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86400000))
            : 0,
          expires: exp?.toLocaleDateString(),
        };
      }
      case "get_operators": {
        const ops = await this.operatorModel
          .find({ shopkeeperId: sid, isSoftDeleted: { $ne: true } })
          .lean();
        return ops.map((o: any) => ({
          name: o.name,
          phone: o.whatsAppNumber,
          email: o.email,
        }));
      }
      case "get_shop_info": {
        const sk: any = await this.shopkeeperModel.findById(sid).lean();
        return {
          shopName: sk?.shopName,
          owner: sk?.name,
          category: sk?.businessCategory,
          phone: sk?.phone,
          whatsapp: sk?.whatsappNumber,
          address: sk?.address,
        };
      }
      case "navigate_to":
        return { navigating: true, tab: input.tab };
      default:
        return { error: "Unknown tool" };
    }
  }

  private async fallbackKeyword(
    sid: string,
    msg: string,
    jwtName?: string,
  ): Promise<BotResponse> {
    const m = msg.toLowerCase();
    if (m.includes("hi") || m.includes("hello") || m.includes("help")) {
      // Same identity resolution as processMessage so the greeting is personal
      // even when the AI provider is unreachable.
      let person: any = await this.shopkeeperModel.findById(sid).lean();
      if (!person) person = await this.operatorModel.findById(sid).lean();
      const first = (jwtName || person?.name || "").split(/\s+/)[0] || "there";
      const shop: any = person?.shopName
        ? person
        : await this.shopkeeperModel
            .findById(person?.shopkeeperId || sid)
            .lean();
      const shopName = shop?.shopName || "your store";
      const greetingLine = this.buildGreetingLine(first, shop?.country);
      return {
        text: `${greetingLine} 👋 I'm **KiosAI**, your assistant for **${shopName}**. What can I do for you today?`,
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
      const orders = await this.orderModel
        .find({
          shopkeeperId: sid,
          status: "pending",
          isSoftDeleted: { $ne: true },
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();
      const list = orders
        .map(
          (o: any, i: number) =>
            `${i + 1}. **#${o.orderId}** — $${o.totalAmount?.toFixed(2)}`,
        )
        .join("\n");
      return {
        text: orders.length
          ? `⏳ **${orders.length} Pending:**\n\n${list}`
          : "No pending orders!",
      };
    }
    if (m.includes("revenue") || m.includes("earning")) {
      const s = new Date();
      s.setHours(0, 0, 0, 0);
      const orders = await this.orderModel
        .find({
          shopkeeperId: sid,
          createdAt: { $gte: s },
          isSoftDeleted: { $ne: true },
        })
        .lean();
      return {
        text: `💰 Today: **$${orders.reduce((a: number, o: any) => a + (o.totalAmount || 0), 0).toFixed(2)}** from ${orders.length} orders`,
      };
    }
    if (m.includes("product")) {
      // Render the same expandable tree the LLM path would produce, so the UX
      // doesn't degrade when the AI provider is unreachable.
      if (this.isListProductsIntent(msg)) {
        const result = await this.executeTool(sid, "get_products", {});
        const total = result?.total ?? 0;
        const products = Array.isArray(result?.products) ? result.products : [];
        return {
          text:
            total > 0
              ? `📦 You have **${total}** products — click any row with a chevron to expand its variants.`
              : "📦 You don't have any products yet.",
          productTree: products,
          quickActions: [{ label: "Add Product", action: "add product" }],
        };
      }
      const total = await this.productModel.countDocuments({
        shopkeeperId: sid,
        isSoftDeleted: { $ne: true },
      });
      return {
        text: `📦 You have **${total}** products.`,
        quickActions: [
          { label: "Show All", action: "show all products" },
          { label: "Add Product", action: "add product" },
        ],
      };
    }
    if (m.includes("confirm") && m.includes("payment")) {
      const matched = await this.paymentEmailModel
        .find({
          shopkeeperId: sid,
          status: "matched",
          matchedOrderId: { $ne: null },
        })
        .lean();
      if (matched.length === 0)
        return { text: "No matched payments to confirm." };
      let c = 0;
      for (const pe of matched) {
        await this.paymentEmailModel.findByIdAndUpdate(pe._id, {
          status: "confirmed",
        });
        await this.orderModel.findOneAndUpdate(
          { orderId: pe.matchedOrderId, status: "pending" },
          { status: "processing" },
        );
        c++;
      }
      return {
        text: `✅ **${c} payments confirmed!** Orders moved to processing.`,
      };
    }
    return {
      text: "I can help with orders, products, payments, analytics & more. What do you need?",
      quickActions: [
        { label: "Orders", action: "today's orders" },
        { label: "Revenue", action: "today's revenue" },
        { label: "Products", action: "show products" },
        { label: "Payments", action: "payment summary" },
      ],
    };
  }
}
