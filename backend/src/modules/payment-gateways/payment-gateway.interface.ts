export type SupportedCountry = "IN" | "SG";

export type LinkedAccountStatus =
  | "pending_kyc"
  | "under_review"
  | "active"
  | "rejected"
  | "suspended";

export type TransferStatus =
  | "pending"
  | "captured"
  | "on_hold"
  | "released"
  | "reversed"
  | "failed";

export interface CreateLinkedAccountInput {
  shopkeeperId: string;
  businessName: string;
  businessType: "proprietorship" | "partnership" | "private_limited" | "llp";
  businessEmail: string;
  businessPhone: string;
  panNumber?: string;
  gstNumber?: string;
  uenNumber?: string;
  accountHolderName: string;
  bankName: string;
  bankAccountNumber: string;
  ifscCode: string;
  address: string;
  city: string;
  state: string;
  zipcode: string;
  country: SupportedCountry;
}

export interface CreateLinkedAccountResult {
  accountId: string;
  status: LinkedAccountStatus;
  raw: any;
}

export interface CreateStakeholderInput {
  accountId: string;
  name: string;
  email: string;
  phone?: string;
  pan?: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: SupportedCountry;
  relationship?: { director?: boolean; executive?: boolean };
}

export interface UploadDocumentInput {
  accountId: string;
  documentType:
    | "business_proof_url"
    | "individual_proof_of_identification"
    | "bank_account_doc"
    | "gst_certificate"
    | "address_proof_url";
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface CreateOrderInput {
  amount: number;
  currency: "INR" | "SGD";
  receipt: string;
  notes?: Record<string, string>;
  partialPayment?: boolean;
}

export interface CreateOrderResult {
  gatewayOrderId: string;
  amount: number;
  currency: string;
  raw: any;
}

export interface CreateOnHoldTransferInput {
  paymentId: string;
  linkedAccountId: string;
  amount: number;
  currency: "INR";
  notes?: Record<string, string>;
  onHoldUntil?: Date;
}

export interface CreateOnHoldTransferResult {
  transferId: string;
  amount: number;
  raw: any;
}

export interface VerifyWebhookInput {
  rawBody: string;
  signature: string;
}

/**
 * Gateway-agnostic adapter contract. Each country's implementation lives
 * behind this interface so the rest of the codebase never imports a
 * specific provider's SDK.
 */
export interface PaymentGateway {
  readonly providerName: string;
  readonly supportedCountries: SupportedCountry[];

  createLinkedAccount(
    input: CreateLinkedAccountInput,
  ): Promise<CreateLinkedAccountResult>;

  fetchLinkedAccount(accountId: string): Promise<CreateLinkedAccountResult>;

  createStakeholder(
    input: CreateStakeholderInput,
  ): Promise<{ stakeholderId: string; raw: any }>;

  uploadDocument(
    input: UploadDocumentInput,
  ): Promise<{ documentId: string; raw: any }>;

  requestProductConfiguration(
    accountId: string,
  ): Promise<{ productConfigId: string; raw: any }>;

  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;

  verifyPaymentSignature(input: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
  }): boolean;

  createOnHoldTransfer(
    input: CreateOnHoldTransferInput,
  ): Promise<CreateOnHoldTransferResult>;

  releaseTransfer(transferId: string): Promise<{ status: string; raw: any }>;

  reverseTransfer(
    transferId: string,
    amount?: number,
  ): Promise<{ reversalId: string; raw: any }>;

  refundPayment(input: {
    gatewayPaymentId: string;
    amount?: number;
    notes?: Record<string, string>;
  }): Promise<{ refundId: string; raw: any }>;

  verifyWebhook(input: VerifyWebhookInput): boolean;
}
