export type SupportedCountry = "IN" | "SG";

export type LinkedAccountStatus =
  | "created"
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

/** Razorpay account `type` field — controls what product the sub-merchant
 *  is onboarded for. `standard` = regular sub-merchant who receives payments
 *  directly into their own settlement (works without Route activation).
 *  `route` = linked account that can receive split transfers from the
 *  platform (requires Route enabled on the partner). */
export type LinkedAccountType = "standard" | "route";

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
  accountType?: LinkedAccountType;
}

/** Soft-onboarding payload — only the 5 fields Razorpay's POST /v2/accounts
 * actually requires. The account is created in `created` state; payments
 * continue routing to the platform master until the merchant completes KYC. */
export interface CreateLinkedAccountMinimalInput {
  shopkeeperId: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  contactName: string;
  businessType?: "proprietorship" | "partnership" | "private_limited" | "llp";
  country: SupportedCountry;
  accountType?: LinkedAccountType;
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

/** Settlement bank details + final TnC acceptance, PATCHed onto the
 *  product configuration created by `requestProductConfiguration`. This is
 *  the step that actually submits the linked account to Razorpay for review
 *  — without it accounts stay in `requested` forever. */
export interface UpdateProductConfigInput {
  accountId: string;
  productConfigId: string;
  settlements: {
    accountNumber: string;
    ifscCode: string;
    beneficiaryName: string;
  };
  tncAccepted?: boolean;
}

/** Editable fields on an existing linked account (PATCH /v2/accounts/{id}).
 *  Only fields you pass are sent — undefined keys are dropped. */
export interface UpdateLinkedAccountInput {
  accountId: string;
  contactName?: string;
  businessType?: "proprietorship" | "partnership" | "private_limited" | "llp";
  panNumber?: string;
  gstNumber?: string;
  registeredAddress?: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
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

  createLinkedAccountMinimal(
    input: CreateLinkedAccountMinimalInput,
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
    productName?: "payment_gateway" | "route",
  ): Promise<{ productConfigId: string; raw: any }>;

  fetchProductConfiguration(
    accountId: string,
    productConfigId: string,
  ): Promise<{ activationStatus: string; raw: any }>;

  updateProductConfiguration(
    input: UpdateProductConfigInput,
  ): Promise<{ activationStatus: string; raw: any }>;

  updateLinkedAccount(
    input: UpdateLinkedAccountInput,
  ): Promise<CreateLinkedAccountResult>;

  createOrder(
    input: CreateOrderInput,
    creds?: { keyId: string; keySecret: string },
  ): Promise<CreateOrderResult>;

  verifyPaymentSignature(
    input: {
      gatewayOrderId: string;
      gatewayPaymentId: string;
      signature: string;
    },
    creds?: { keyId: string; keySecret: string },
  ): boolean;

  createOnHoldTransfer(
    input: CreateOnHoldTransferInput,
  ): Promise<CreateOnHoldTransferResult>;

  releaseTransfer(transferId: string): Promise<{ status: string; raw: any }>;

  reverseTransfer(
    transferId: string,
    amount?: number,
  ): Promise<{ reversalId: string; raw: any }>;

  refundPayment(
    input: {
      gatewayPaymentId: string;
      amount?: number;
      notes?: Record<string, string>;
    },
    creds?: { keyId: string; keySecret: string },
  ): Promise<{ refundId: string; raw: any }>;

  verifyWebhook(input: VerifyWebhookInput): boolean;
}
