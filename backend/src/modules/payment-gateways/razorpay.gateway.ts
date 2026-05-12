import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";
import axios from "axios";
import * as FormData from "form-data";
import {
  PaymentGateway,
  CreateLinkedAccountInput,
  CreateLinkedAccountResult,
  CreateStakeholderInput,
  UploadDocumentInput,
  CreateOrderInput,
  CreateOrderResult,
  CreateOnHoldTransferInput,
  CreateOnHoldTransferResult,
  VerifyWebhookInput,
  LinkedAccountStatus,
  SupportedCountry,
} from "./payment-gateway.interface";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v2";
const RAZORPAY_API_BASE_V1 = "https://api.razorpay.com/v1";

@Injectable()
export class RazorpayGateway implements PaymentGateway {
  readonly providerName = "razorpay";
  readonly supportedCountries: SupportedCountry[] = ["IN"];
  private readonly logger = new Logger(RazorpayGateway.name);
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor() {
    this.keyId = process.env.RAZORPAY_PARTNER_KEY_ID || "";
    this.keySecret = process.env.RAZORPAY_PARTNER_SECRET || "";
    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    if (!this.keyId || !this.keySecret) {
      this.logger.warn(
        "Razorpay credentials not configured. Set RAZORPAY_PARTNER_KEY_ID and RAZORPAY_PARTNER_SECRET.",
      );
    }
  }

  private authHeader(creds?: { keyId: string; keySecret: string }): string {
    const id = creds?.keyId || this.keyId;
    const secret = creds?.keySecret || this.keySecret;
    return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
  }

  /** One-shot probe used by the Direct-mode onboarding flow to verify a shop's
   * pasted keys actually work, before we save them. Hits /v1/payments which
   * returns 200 even with zero history; non-200 = bad creds. */
  async verifyDirectCredentials(keyId: string, keySecret: string) {
    try {
      await axios.request({
        method: "GET",
        url: `${RAZORPAY_API_BASE_V1}/payments?count=1`,
        headers: { Authorization: this.authHeader({ keyId, keySecret }) },
        timeout: 15000,
      });
      return { ok: true as const };
    } catch (err: any) {
      const description =
        err?.response?.data?.error?.description ||
        err?.response?.data?.message ||
        err?.message ||
        "Invalid Razorpay credentials";
      return { ok: false as const, error: description };
    }
  }

  private async request<T = any>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    body?: any,
    headers?: Record<string, string>,
    creds?: { keyId: string; keySecret: string },
  ): Promise<T> {
    try {
      const res = await axios.request<T>({
        method,
        url,
        data: body,
        headers: {
          Authorization: this.authHeader(creds),
          "Content-Type": "application/json",
          ...(headers || {}),
        },
        timeout: 30000,
      });
      return res.data;
    } catch (err: any) {
      const description =
        err?.response?.data?.error?.description ||
        err?.response?.data?.message ||
        err?.message ||
        "Razorpay request failed";
      this.logger.error(
        `${method} ${url} failed: ${description} | ${JSON.stringify(
          err?.response?.data || {},
        )}`,
      );
      throw new BadRequestException(`Razorpay: ${description}`);
    }
  }

  private mapAccountStatus(rawStatus: string): LinkedAccountStatus {
    switch (rawStatus) {
      case "activated":
      case "active":
        return "active";
      case "under_review":
      case "needs_clarification":
        return "under_review";
      case "rejected":
        return "rejected";
      case "suspended":
        return "suspended";
      default:
        return "pending_kyc";
    }
  }

  async createLinkedAccount(
    input: CreateLinkedAccountInput,
  ): Promise<CreateLinkedAccountResult> {
    if (input.country !== "IN") {
      throw new BadRequestException(
        "Razorpay Route currently supports only India-resident merchants.",
      );
    }
    const payload = {
      email: input.businessEmail,
      phone: input.businessPhone,
      type: "route",
      reference_id: input.shopkeeperId,
      legal_business_name: input.businessName,
      business_type: input.businessType,
      contact_name: input.accountHolderName,
      profile: {
        category: "ecommerce",
        subcategory: "marketplace",
        addresses: {
          registered: {
            street1: input.address,
            street2: "",
            city: input.city,
            state: input.state,
            postal_code: input.zipcode,
            country: "IN",
          },
        },
      },
      legal_info: {
        pan: input.panNumber,
        ...(input.gstNumber ? { gst: input.gstNumber } : {}),
      },
      notes: {
        shopkeeper_id: input.shopkeeperId,
        platform: "KiosCart",
      },
    };

    const account = await this.request<any>(
      "POST",
      `${RAZORPAY_API_BASE}/accounts`,
      payload,
    );

    return {
      accountId: account.id,
      status: this.mapAccountStatus(account.status),
      raw: account,
    };
  }

  async fetchLinkedAccount(
    accountId: string,
  ): Promise<CreateLinkedAccountResult> {
    const account = await this.request<any>(
      "GET",
      `${RAZORPAY_API_BASE}/accounts/${accountId}`,
    );
    return {
      accountId: account.id,
      status: this.mapAccountStatus(account.status),
      raw: account,
    };
  }

  async createStakeholder(input: CreateStakeholderInput) {
    const payload = {
      name: input.name,
      email: input.email,
      ...(input.phone
        ? { phone: { primary: input.phone, secondary: "" } }
        : {}),
      kyc: {
        ...(input.pan ? { pan: input.pan } : {}),
      },
      addresses: {
        residential: {
          street: input.addressLine1,
          city: input.city,
          state: input.state,
          postal_code: input.postalCode,
          country: input.country,
        },
      },
      ...(input.relationship ? { relationship: input.relationship } : {}),
    };

    const stakeholder = await this.request<any>(
      "POST",
      `${RAZORPAY_API_BASE}/accounts/${input.accountId}/stakeholders`,
      payload,
    );

    return { stakeholderId: stakeholder.id, raw: stakeholder };
  }

  async uploadDocument(input: UploadDocumentInput) {
    const form = new FormData();
    form.append("file", input.fileBuffer, {
      filename: input.fileName,
      contentType: input.mimeType,
    });
    form.append("document_type", input.documentType);

    try {
      const res = await axios.post(
        `${RAZORPAY_API_BASE}/accounts/${input.accountId}/documents`,
        form,
        {
          headers: {
            Authorization: this.authHeader(),
            ...form.getHeaders(),
          },
          timeout: 60000,
          maxContentLength: 10 * 1024 * 1024,
          maxBodyLength: 10 * 1024 * 1024,
        },
      );
      const docId =
        res.data?.id || res.data?.[input.documentType]?.[0]?.id || "";
      return { documentId: docId, raw: res.data };
    } catch (err: any) {
      const description =
        err?.response?.data?.error?.description || err?.message;
      throw new BadRequestException(`Razorpay document upload: ${description}`);
    }
  }

  async requestProductConfiguration(accountId: string) {
    const payload = { product_name: "route", tnc_accepted: true };
    const product = await this.request<any>(
      "POST",
      `${RAZORPAY_API_BASE}/accounts/${accountId}/products`,
      payload,
    );
    return { productConfigId: product.id, raw: product };
  }

  async createOrder(
    input: CreateOrderInput,
    creds?: { keyId: string; keySecret: string },
  ): Promise<CreateOrderResult> {
    const payload = {
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      receipt: input.receipt,
      ...(input.partialPayment ? { partial_payment: true } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    };
    const order = await this.request<any>(
      "POST",
      `${RAZORPAY_API_BASE_V1}/orders`,
      payload,
      undefined,
      creds,
    );
    return {
      gatewayOrderId: order.id,
      amount: order.amount / 100,
      currency: order.currency,
      raw: order,
    };
  }

  verifyPaymentSignature(
    input: {
      gatewayOrderId: string;
      gatewayPaymentId: string;
      signature: string;
    },
    creds?: { keyId: string; keySecret: string },
  ): boolean {
    const secret = creds?.keySecret || this.keySecret;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${input.gatewayOrderId}|${input.gatewayPaymentId}`)
      .digest("hex");
    // timingSafeEqual throws if buffers differ in length — an attacker-supplied
    // signature of the wrong length must not crash the request handler.
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(input.signature || "");
    if (givenBuf.length !== expectedBuf.length) return false;
    try {
      return crypto.timingSafeEqual(expectedBuf, givenBuf);
    } catch {
      return false;
    }
  }

  async createOnHoldTransfer(
    input: CreateOnHoldTransferInput,
  ): Promise<CreateOnHoldTransferResult> {
    const payload = {
      transfers: [
        {
          account: input.linkedAccountId,
          amount: Math.round(input.amount * 100),
          currency: input.currency,
          on_hold: 1,
          ...(input.onHoldUntil
            ? {
                on_hold_until: Math.floor(input.onHoldUntil.getTime() / 1000),
              }
            : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      ],
    };
    const result = await this.request<any>(
      "POST",
      `${RAZORPAY_API_BASE_V1}/payments/${input.paymentId}/transfers`,
      payload,
    );
    const transfer = result?.items?.[0] || result;
    return {
      transferId: transfer.id,
      amount: transfer.amount / 100,
      raw: transfer,
    };
  }

  async releaseTransfer(transferId: string) {
    const result = await this.request<any>(
      "PATCH",
      `${RAZORPAY_API_BASE_V1}/transfers/${transferId}`,
      { on_hold: 0 },
    );
    return { status: result.status, raw: result };
  }

  async reverseTransfer(transferId: string, amount?: number) {
    const payload: any = {};
    if (amount) payload.amount = Math.round(amount * 100);
    const result = await this.request<any>(
      "POST",
      `${RAZORPAY_API_BASE_V1}/transfers/${transferId}/reversals`,
      payload,
    );
    return { reversalId: result.id, raw: result };
  }

  async refundPayment(
    input: {
      gatewayPaymentId: string;
      amount?: number;
      notes?: Record<string, string>;
    },
    creds?: { keyId: string; keySecret: string },
  ) {
    const payload: any = {};
    if (input.amount) payload.amount = Math.round(input.amount * 100);
    if (input.notes) payload.notes = input.notes;
    const refund = await this.request<any>(
      "POST",
      `${RAZORPAY_API_BASE_V1}/payments/${input.gatewayPaymentId}/refund`,
      payload,
      undefined,
      creds,
    );
    return { refundId: refund.id, raw: refund };
  }

  verifyWebhook(input: VerifyWebhookInput): boolean {
    if (!this.webhookSecret) {
      this.logger.error("RAZORPAY_WEBHOOK_SECRET not set; rejecting webhook.");
      return false;
    }
    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(input.rawBody)
      .digest("hex");
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(input.signature),
      );
    } catch {
      return false;
    }
  }
}
