import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  ReceiptType,
  Shopkeeper,
  ShopkeeperDocument,
} from "./schemas/shopkeeper.schema";
import { LoginDto } from "../admin/dto/login.dto";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { MailService } from "../roles/mail.service";
import { CreateShopkeeperDto } from "./dto/createShopkeeper.dto";
import { Otp } from "../otp/entities/otp.entity";
import { Types } from "mongoose";
import Razorpay from "razorpay";
import { CreateRazorpayLinkedAccountDto } from "./dto/razorpay.dto";
import { UpdateShopkeeperDto } from "./dto/updateShopkeeper.dto";
import {
  Operator,
  OperatorDocument,
} from "../operators/entities/operator.entity";

@Injectable()
export class ShopkeepersService {
  private logger = new Logger(ShopkeepersService.name);
  private razorPay: Razorpay;
  constructor(
    @InjectModel(Shopkeeper.name) private shopModel: Model<ShopkeeperDocument>,
    @InjectModel(Otp.name) private otpModel: Model<Otp>,
    @InjectModel(Operator.name) private operatorModel: Model<OperatorDocument>, // Use your existing Otp model
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {
    const Razorpay = require("razorpay");
    this.razorPay = new Razorpay({
      key_id: process.env.RAZORPAY_PARTNER_KEY_ID,
      key_secret: process.env.RAZORPAY_PARTNER_SECRET,
    });
  }

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  async create(data: Partial<Shopkeeper>) {
    const created = new this.shopModel(data);
    return created.save();
  }

  async createShopkeeperByOrganizer(
    data: CreateShopkeeperDto,
    organizerId: string,
  ) {
    try {
      const shopkeeper = await this.shopModel.findOne({
        whatsappNumber: data.whatsappNumber,
        email: data?.email,
      });

      if (shopkeeper) {
        throw new BadRequestException("User Already Exists");
      }

      const created = new this.shopModel({
        name: data.name,
        email: data.email,
        country: data.country,
        shopName: data.shopName,
        provider: "Organizer",
        providerId: organizerId,
        whatsappNumber: data.whatsappNumber,
        phone: data.phone,
        address: data.address,
        approved: true,
        businessCategory: data.businessCategory,
        businessEmail: data.businessEmail,
      });

      const saved = await created.save();
      return { message: "User created successfully", data: saved };
    } catch (error) {
      throw error;
    }
  }

  async updateShopkeeperByOrganizer(
    shopkeeperId: string,
    data: UpdateShopkeeperDto,
    organizerId: string,
  ) {
    try {
      // 1. Check if user exists and belongs to this shopkeeper
      const existingUser = await this.shopModel.findOne({
        _id: shopkeeperId,
        provider: "Organizer",
        providerId: organizerId,
      });

      if (!existingUser) {
        throw new BadRequestException("Shopkeeper not found or access denied");
      }

      // 2. Check for duplicate WhatsApp / Email (excluding current user)
      // const duplicateUser = await this.userModel.findOne({
      //   _id: { $ne: userId },
      //   $or: [{ whatsAppNumber: data.whatsAppNumber }, { email: data.email }],
      // });

      // if (duplicateUser) {
      //   throw new BadRequestException(
      //     "Another user already exists with this WhatsApp number or email",
      //   );
      // }

      // 3. Update fields
      existingUser.name = data.name;
      existingUser.shopName = data.shopName;
      existingUser.country = data.country;
      existingUser.email = data.email;
      existingUser.whatsappNumber = data.whatsappNumber;
      existingUser.phone = data.phone;
      existingUser.address = data.address;
      existingUser.businessCategory = data.businessCategory;
      existingUser.businessEmail = data.businessEmail;

      const updatedUser = await existingUser.save();

      return {
        message: "Shopkeeper updated successfully",
        data: updatedUser,
      };
    } catch (error) {
      throw error;
    }
  }

  async fetchShopkeeperByOrganizerId(organizerId: string) {
    try {
      const shopkeeper = await this.shopModel.find({
        provider: "Organizer",
        providerId: organizerId,
      });

      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper not found");
      }

      return { message: "Shopkeeper fetched successfully", data: shopkeeper };
    } catch (error) {
      throw error;
    }
  }

  async createRazorpayLinkedAccount(
    shopkeeperId: string,
    dto: CreateRazorpayLinkedAccountDto,
  ) {
    try {
      this.logger.log(`Creating Razorpay linked account for: ${shopkeeperId}`);

      // Validate required fields
      if (!dto.businessName || !dto.panNumber || !dto.bankAccountNumber) {
        throw new BadRequestException("Missing required KYC fields");
      }

      // Call Razorpay Partner API
      const linkedAccount = await this.razorPay.accounts.create({
        email: dto.businessEmail,
        phone: dto.businessPhone,
        type: "route", // Enable Route for settlement splits
        legal_business_name: dto.businessName,
        business_type: dto.businessType,

        // Address
        legal_address: {
          street: dto.address,
          city: dto.city,
          state: dto.state,
          postal_code: dto.zipcode,
          country: dto.country === "IN" ? "IN" : "SG",
        },

        // KYC Details
        ...(dto.country === "IN" && {
          pan: dto.panNumber,
          gst: dto.gstNumber || null,
        }),
        ...(dto.country === "SG" && {
          uen: dto.uenNumber,
        }),

        // Bank account for payouts
        bank_account: {
          ifsc_code: dto.ifscCode,
          beneft_name: dto.accountHolderName,
          account_number: dto.bankAccountNumber,
          account_type: "savings",
        },

        // Internal notes
        notes: {
          shopkeeper_id: shopkeeperId,
          platform: "KiosCart",
          created_at: new Date().toISOString(),
        },
      } as any);

      this.logger.log(`✅ Linked account created: ${linkedAccount.id}`);

      // Save to database
      const updated = await this.shopModel.findByIdAndUpdate(
        shopkeeperId,
        {
          razorpay: {
            accountId: linkedAccount.id,
            status: linkedAccount.status || "pending_kyc",
            kycStatus: (linkedAccount as any).kyc_status || "not_provided",
            businessName: dto.businessName,
            panNumber: dto.panNumber,
            gstNumber: dto.gstNumber,
            uenNumber: dto.uenNumber,
            bankAccountNumber: dto.bankAccountNumber,
            bankIfscCode: dto.ifscCode,
            bankName: dto.bankName,
            accountHolderName: dto.accountHolderName,
            businessEmail: dto.businessEmail,
            businessPhone: dto.businessPhone,
            createdAt: new Date(),
          },
        },
        { new: true },
      );

      return {
        success: true,
        accountId: linkedAccount.id,
        status: linkedAccount.status,
        message:
          "Account created. KYC review: 1-3 business days. Money will settle directly to your bank.",
      };
    } catch (error) {
      this.logger.error(`Failed to create linked account: ${error.message}`);
      throw new BadRequestException(`Razorpay setup failed: ${error.message}`);
    }
  }

  // ✅ NEW: Check Razorpay Account Status
  async checkRazorpayAccountStatus(accountId: string) {
    try {
      const account = await this.razorPay.accounts.fetch(accountId);

      return {
        accountId: account.id,
        status: account.status, // 'pending_kyc', 'active', 'rejected', 'suspended'
        kycStatus: (account as any).kyc_status,
        isActive: account.status === "active",
      };
    } catch (error) {
      this.logger.error(`Failed to check account status: ${error.message}`);
      throw new BadRequestException("Could not fetch account status");
    }
  }

  // ✅ NEW: Update Razorpay account status (called by cron/polling)
  async updateRazorpayAccountStatus(shopkeeperId: string, accountId: string) {
    try {
      const status = await this.checkRazorpayAccountStatus(accountId);

      if (status.isActive) {
        await this.shopModel.findByIdAndUpdate(shopkeeperId, {
          "razorpay.status": "active",
          "razorpay.verifiedAt": new Date(),
        });

        this.logger.log(`✅ Account activated: ${accountId}`);
        return { isActive: true };
      }

      return { isActive: false, status: status.status };
    } catch (error) {
      this.logger.error(`Account status update failed: ${error.message}`);
      throw error;
    }
  }

  async list() {
    try {
      const shopkeeper = await this.shopModel.find().lean().exec();
      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper Not Found");
      }
      return { message: "Shopkeeper Found", data: shopkeeper };
    } catch (error) {
      throw error;
    }
  }

  async getByEmail(email: string) {
    try {
      const normalizedEmail = this.normalizeEmail(email);
      const shopkeeper = await this.shopModel.findOne({
        email: normalizedEmail,
        approved: true,
      });
      if (shopkeeper) return { message: "Shopkeeper found", data: shopkeeper };
    } catch (error) {
      throw error;
    }
  }

  async get(id: string) {
    try {
      const shopkeeper = await this.shopModel.findOne({ _id: id });
      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper not found");
      }

      if (shopkeeper.shopClosedToDate) {
        const today = new Date();
        const closedTo = new Date(shopkeeper.shopClosedToDate);

        // if today is after the closed-to date, clear both fields
        if (today > closedTo) {
          await this.shopModel.findByIdAndUpdate(
            id,
            {
              $unset: {
                shopClosedFromDate: "",
                shopClosedToDate: "",
              },
            },
            { new: true },
          );
          // optionally also update the in-memory object if you need it fresh:
          shopkeeper.shopClosedFromDate = undefined;
          shopkeeper.shopClosedToDate = undefined;
        }
      }

      return { message: "Shopkeeper Found", data: shopkeeper };
    } catch (error) {
      throw error;
    }
  }

  // Request OTP with your existing Otp schema
  async requestOTP(email: string) {
    try {
      const normalizedEmail = this.normalizeEmail(email); // ensure lowercase+trim

      const shopkeeper = await this.shopModel.findOne({
        businessEmail: normalizedEmail,
        approved: true,
      });

      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper not found or not approved");
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const channel = "business_email";
      const role = "shopkeeper";
      const identifier = normalizedEmail;

      // Optional: Cooldown guard (e.g., 30s). Uncomment if wanted.
      // const existing = await this.otpModel.findOne({ channel, role, identifier });
      // if (existing?.lastSentAt && (Date.now() - new Date(existing.lastSentAt).getTime()) < 30_000) {
      //   throw new BadRequestException("Please wait before requesting a new OTP");
      // }

      // Upsert by channel/role/identifier
      await this.otpModel.findOneAndUpdate(
        { channel, role, identifier },
        {
          email: normalizedEmail, // keep legacy field if other code reads it
          otp,
          expiresAt,
          attempts: 0,
          verified: false,
          lastSentAt: new Date(),
          channel,
          identifier,
          role,
        },
        { upsert: true, new: true },
      );

      const businessEmail = shopkeeper.businessEmail || shopkeeper.email;

      await this.mailService.sendOTPEmail({
        name: shopkeeper.name,
        email: businessEmail,
        otp,
        businessName: shopkeeper.shopName || shopkeeper.name,
      });

      return {
        message: "OTP sent successfully to your registered business email",
        data: {
          email: normalizedEmail,
          businessEmail,
          expiresIn: 10,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Verify OTP with your existing Otp schema
  async verifyOTP(email: string, otp: string) {
    try {
      const normalizedEmail = this.normalizeEmail(email);

      const channel = "business_email";
      const role = "shopkeeper";
      const identifier = normalizedEmail;

      const otpDoc = await this.otpModel.findOne({
        channel,
        role,
        identifier,
        verified: false,
      });

      if (!otpDoc) {
        throw new BadRequestException(
          "OTP not found or expired. Please request a new one.",
        );
      }

      if (new Date() > otpDoc.expiresAt) {
        await this.otpModel.deleteOne({ _id: otpDoc._id });
        throw new BadRequestException(
          "OTP has expired. Please request a new one.",
        );
      }

      if (otpDoc.attempts >= 3) {
        await this.otpModel.deleteOne({ _id: otpDoc._id });
        throw new BadRequestException(
          "Too many invalid attempts. Please request a new OTP.",
        );
      }

      if (otpDoc.otp !== otp) {
        await this.otpModel.updateOne(
          { _id: otpDoc._id },
          { $inc: { attempts: 1 } },
        );
        throw new BadRequestException(
          `Invalid OTP. ${3 - otpDoc.attempts - 1} attempts remaining.`,
        );
      }

      const shopkeeper = await this.shopModel.findOne({
        businessEmail: normalizedEmail,
        approved: true,
      });

      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper not found or not approved");
      }

      const payload = {
        name: shopkeeper.name,
        email: shopkeeper.email,
        sub: shopkeeper._id,
        country: shopkeeper.country,
        roles: ["shopkeeper"],
      };

      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "24h",
      });

      await this.otpModel.deleteOne({ _id: otpDoc._id });

      return {
        message: "Login successful",
        data: {
          token,
          shopkeeper: {
            id: shopkeeper._id,
            name: shopkeeper.name,
            email: shopkeeper.email,
            businessName: shopkeeper.shopName,
          },
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Resend OTP with your existing Otp schema
  async resendOTP(email: string) {
    try {
      const normalizedEmail = this.normalizeEmail(email);

      const shopkeeper = await this.shopModel.findOne({
        businessEmail: normalizedEmail,
        approved: true,
      });

      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper not found or not approved");
      }

      const channel = "business_email";
      const role = "shopkeeper";
      const identifier = normalizedEmail;

      // Rate limit: last 60 seconds by lastSentAt (preferred over createdAt after upsert)
      const existing = await this.otpModel.findOne({
        channel,
        role,
        identifier,
      });
      if (
        existing?.lastSentAt &&
        Date.now() - new Date(existing.lastSentAt).getTime() < 60 * 1000
      ) {
        throw new BadRequestException(
          "Please wait 60 seconds before requesting a new OTP",
        );
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await this.otpModel.findOneAndUpdate(
        { channel, role, identifier },
        {
          email: normalizedEmail, // legacy
          otp,
          expiresAt,
          attempts: 0,
          verified: false,
          lastSentAt: new Date(),
          channel,
          identifier,
          role,
        },
        { upsert: true, new: true },
      );

      const businessEmail = shopkeeper.businessEmail || shopkeeper.email;

      await this.mailService.sendOTPEmail({
        name: shopkeeper.name,
        email: businessEmail,
        otp,
        businessName: shopkeeper.shopName || shopkeeper.name,
      });

      return {
        message: "New OTP sent successfully",
        data: {
          email: businessEmail,
          expiresIn: 10,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Rest of your existing methods remain the same...
  async login(dto: LoginDto) {
    try {
      const normalizedEmail = this.normalizeEmail(dto.email);
      const shopkeeper = await this.shopModel.findOne({
        email: normalizedEmail,
      });

      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper Not Found");
      }

      if (!shopkeeper.approved) {
        throw new NotFoundException(
          "Your request is still pending! Please wait for admin Approval...",
        );
      }

      // const isMatch = await bcrypt.compare(dto.password, shopkeeper.password);
      // if (!isMatch) {
      //   throw new UnauthorizedException("Invalid Credentials");
      // }

      const payload = {
        name: shopkeeper.name,
        email: shopkeeper.email,
        sub: shopkeeper._id,
        roles: ["shopkeeper"],
      };

      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "1h",
      });

      return { message: "login Successful", data: token };
    } catch (error) {
      throw error;
    }
  }

  async register(dto: CreateShopkeeperDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);
    const existing = await this.shopModel.findOne({ email: normalizedEmail });
    if (existing) throw new ConflictException("Email already registered");
    const created = await new this.shopModel({
      ...dto,
      email: normalizedEmail,
      approved: false,
      rejected: false,
      status: "pending",
    }).save();

    await this.mailService.sendApprovalRequestToAdmin({
      name: dto.name,
      email: dto.email,
      role: "shopkeeper",
    });

    await this.mailService.sendConfirmationToUser({
      name: dto.name,
      email: dto.email,
      role: "shopkeeper",
    });

    const userObj = created.toObject();
    return userObj;
  }

  async getProfile(id: string) {
    const shopkeeper = await this.shopModel.findById(id).lean().exec();
    if (!shopkeeper) {
      throw new NotFoundException("Shopkeeper not found with this id");
    }

    // delete shopkeeper.password;
    return { message: "Shopkeeper Found", data: shopkeeper };
  }

  async updateProfile(
    id: string,
    body: {
      ownerName?: string;
      shopName?: string;
      email?: string;
      businessEmail?: string;
      whatsappNumber?: string;
      phone?: string;
      address?: string;
      description?: string;
      GSTNumber?: string;
      UENNumber?: string;
      whatsAppQRNumber?: string;
      instagramQR?: boolean;
      whatsAppQR?: boolean;
      instagramHandle?: string;
      dynamicQR?: boolean;
      hasDocVerification?: boolean;
      taxPercentage?: string | number;
      discountPercentage?: string | number;
      businessCategory?: string;
      receiptType?: ReceiptType | string;
      termsAndConditions?: string;
      paymentURL?: string;
      shopClosedFromDate?: Date; // Accept string from FormData
      shopClosedToDate?: Date; // Accept string from FormData
      country?: string; // IN/SG
    },
    paymentQrPublicUrl?: string | null,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid shopkeeper id");
    }

    const update: Record<string, any> = {};

    // ✅ EXISTING FIELDS
    if (body.ownerName !== undefined) update.name = body.ownerName;
    if (body.shopName !== undefined) update.shopName = body.shopName;
    if (body.email !== undefined)
      update.email = this.normalizeEmail(body.email);
    if (body.businessEmail !== undefined)
      update.businessEmail = this.normalizeEmail(body.businessEmail);
    if (body.whatsappNumber !== undefined)
      update.whatsappNumber = body.whatsappNumber;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.address !== undefined) update.address = body.address;
    if (body.description !== undefined) update.description = body.description;

    // ✅ NEW FIELDS
    if (body.GSTNumber !== undefined) update.GSTNumber = body.GSTNumber;
    if (body.UENNumber !== undefined) update.UENNumber = body.UENNumber;
    if (body.hasDocVerification !== undefined) {
      // ✅ Type-safe boolean conversion
      update.hasDocVerification =
        typeof body.hasDocVerification === "boolean"
          ? body.hasDocVerification
          : body.hasDocVerification === "true";
    }
    if (body.dynamicQR !== undefined)
      update.dynamicQR =
        typeof body.dynamicQR === "boolean"
          ? body.dynamicQR
          : body.dynamicQR === "true";
    if (body.whatsAppQR !== undefined)
      update.whatsAppQR =
        typeof body.whatsAppQR === "boolean"
          ? body.whatsAppQR
          : body.whatsAppQR === "true";
    if (body.instagramHandle !== undefined)
      update.instagramHandle = body.instagramHandle;
    if (body.whatsAppQRNumber !== undefined)
      update.whatsAppQRNumber = body.whatsAppQRNumber;
    if (body.instagramQR !== undefined)
      update.instagramQR =
        typeof body.instagramQR === "boolean"
          ? body.instagramQR
          : body.instagramQR === "true";
    if (body.businessCategory !== undefined)
      update.businessCategory = body.businessCategory;

    if (body.termsAndConditions !== undefined)
      update.termsAndConditions = body.termsAndConditions;

    // ✅ TAX PERCENTAGE (handle string/number)
    if (body.taxPercentage !== undefined) {
      const taxNum =
        typeof body.taxPercentage === "string"
          ? parseFloat(body.taxPercentage)
          : body.taxPercentage;
      update.taxPercentage = isNaN(taxNum) ? 0 : taxNum;
    }

    // ✅ DISCOUNT PERCENTAGE (handle string/number)
    if (body.discountPercentage !== undefined) {
      const discountNum =
        typeof body.discountPercentage === "string"
          ? parseFloat(body.discountPercentage)
          : body.discountPercentage;
      update.discountPercentage = isNaN(discountNum) ? 0 : discountNum;
    }

    // ✅ DATES (handle string/Date from FormData)
    if (body.shopClosedFromDate !== undefined) {
      update.shopClosedFromDate =
        typeof body.shopClosedFromDate === "string"
          ? new Date(body.shopClosedFromDate)
          : body.shopClosedFromDate;
    }
    if (body.shopClosedToDate !== undefined) {
      update.shopClosedToDate =
        typeof body.shopClosedToDate === "string"
          ? new Date(body.shopClosedToDate)
          : body.shopClosedToDate;
    }

    // ✅ NEW: Country field
    if (body.country !== undefined) update.country = body.country;

    if (body.receiptType !== undefined) {
      const allowedValues = Object.values(ReceiptType);

      if (!allowedValues.includes(body.receiptType as ReceiptType)) {
        throw new BadRequestException(
          `Invalid receiptType. Allowed values: ${allowedValues.join(", ")}`,
        );
      }

      update.receiptType = body.receiptType;
    }

    // ✅ Persist uploaded QR public URL (overrides paymentURL if provided)
    if (paymentQrPublicUrl) {
      update.paymentURL = paymentQrPublicUrl;
    } else if (body.paymentURL !== undefined) {
      update.paymentURL = body.paymentURL;
    }

    const updated = await this.shopModel
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException("Shopkeeper not found");
    }

    // ✅ Remove sensitive data
    delete (updated as any).password;
    delete (updated as any).__v;

    return {
      message: "Profile updated successfully",
      data: updated,
    };
  }

  async findByWhatsAppNumber(
    whatsAppNumber: string,
    targetId?: string,
    emailId?: string,
  ) {
    try {
      // 1️⃣ Shopkeeper Query
      const shopkeeperQuery: any = {
        $or: [
          { whatsappNumber: whatsAppNumber },
          { whatsAppNumber: whatsAppNumber },
        ],
      };

      if (emailId) shopkeeperQuery.email = emailId;

      // 2️⃣ Operator Query (WhatsApp only)
      const operatorQuery = {
        $or: [
          { whatsappNumber: whatsAppNumber },
          { whatsAppNumber: whatsAppNumber },
        ],
        shopkeeperId: { $exists: true, $ne: null },
      };

      const [shopkeepers, operators] = await Promise.all([
        this.shopModel.find(shopkeeperQuery),
        this.operatorModel.find(operatorQuery),
      ]);

      // 3️⃣ Fetch parent shops for operators
      const operatorShopIds = [
        ...new Set(operators.map((o) => o.shopkeeperId)),
      ];

      const operatorShops = await this.shopModel.find({
        _id: { $in: operatorShopIds },
      });

      const shopLookup = operatorShops.reduce((acc, shop) => {
        acc[shop._id.toString()] = shop.shopName;
        return acc;
      }, {});

      // 4️⃣ Map to unified options
      const shopOptions = shopkeepers.map((s) => ({
        id: s._id.toString(),
        name: s.shopName,
        type: "shopkeeper",
        approved: s.approved,
      }));

      const operatorOptions = operators.map((o) => ({
        id: o.shopkeeperId.toString(),
        name: `${
          shopLookup[o.shopkeeperId.toString()] || "Unknown Shop"
        } (Operator: ${o.name})`,
        type: "operator",
        approved: true,
      }));

      const allOptions = [...shopOptions, ...operatorOptions];

      // 5️⃣ Selection Logic
      if (allOptions.length === 0) {
        return null;
      }

      let selectedOption;

      if (allOptions.length === 1) {
        selectedOption = allOptions[0];
      } else if (targetId) {
        selectedOption = allOptions.find((opt) => opt.id === targetId);

        if (!selectedOption) {
          throw new NotFoundException("Selected account not found.");
        }
      } else {
        return {
          requiresSelection: true,
          shops: allOptions.map((opt) => ({
            id: opt.id,
            shopName: opt.name,
            type: opt.type,
            approved: opt.approved,
          })),
        };
      }

      // 6️⃣ Generate JWT Payload
      let payload: any;

      if (selectedOption.type === "shopkeeper") {
        const shop = shopkeepers.find(
          (s) => s._id.toString() === selectedOption.id,
        );

        payload = {
          name: shop.name,
          email: shop.email,
          sub: shop._id.toString(),
          country: shop.country,
          roles: ["shopkeeper"],
        };
      } else {
        const op = operators.find(
          (o) => o.shopkeeperId.toString() === selectedOption.id,
        );

        const parentShop = operatorShops.find(
          (s) => s._id.toString() === op.shopkeeperId.toString(),
        );

        if (!parentShop) {
          throw new NotFoundException("Parent shop not found.");
        }

        payload = {
          name: op.name,
          email: op.email ?? "",
          sub: parentShop._id.toString(),
          operatorId: op._id.toString(),
          country: parentShop.country,
          roles: ["shopkeeper"],
        };
      }

      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "24h",
      });

      return { message: "Token found", token };
    } catch (error) {
      throw error;
    }
  }

  async whatsAppNumberExists(whatsAppNumber: string) {
    try {
      const shopkeeper = await this.shopModel.findOne({
        whatsappNumber: whatsAppNumber,
      });
      if (!shopkeeper) {
        throw new NotFoundException("Shopkeeper Not Found");
      }

      return { message: "shopkeeper found", data: shopkeeper };
    } catch (error) {
      throw error;
    }
  }

  async findByRazorpayStatus(status: string) {
    return this.shopModel.find({ "razorpay.status": status });
  }
}
