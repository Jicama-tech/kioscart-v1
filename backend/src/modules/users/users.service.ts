import { Model, Types } from "mongoose";
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { User, UserDocument } from "./schemas/user.schema";
import { CreateUserDto } from "./dto/create-users.dto";
import { UpdateUserDto } from "./dto/update-users.dto";
import { JwtService } from "@nestjs/jwt";
import { OtpService } from "../otp/otp.service";
import { GoogleAuthService } from "./google.auth.service";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly googleService: GoogleAuthService,
  ) {}

  async create(data: CreateUserDto) {
    try {
      const created = new this.userModel({
        name: data.name,
        email: data.email,
        password: data.password,
        provider: data.provider,
        providerId: data.providerId,
        whatsAppNumber: data.whatsAppNumber,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      return await created.save();
    } catch (error) {
      console.error(`Failed to create user: ${error.message}`);
      throw new InternalServerErrorException(
        "An error occurred while creating the user.",
      );
    }
  }

  async findByEmail(email: string) {
    try {
      return await this.userModel.findOne({ email }).exec();
    } catch (error) {
      console.error(`Failed to find user by email: ${error.message}`);
      return null;
    }
  }

  async findByProviderId(providerId: string, provider: string) {
    try {
      return await this.userModel.findOne({ providerId, provider }).exec();
    } catch (error) {
      console.error(`Failed to find user by provider ID: ${error.message}`);
      return null;
    }
  }

  async findById(id: string) {
    try {
      const user = await this.userModel.findById(id).lean();

      if (!user) {
        throw new NotFoundException("User not found");
      }

      return { message: "User Found", data: user };
    } catch (error) {
      console.error(`Failed to find user by ID: ${error.message}`);
      return null;
    }
  }

  async updateUser(id: string, updateDTO: UpdateUserDto) {
    try {
      const user = await this.userModel.findByIdAndUpdate(id, updateDTO, {
        new: true,
      });
      if (!user) {
        throw new NotFoundException("User not found");
      }
      return { message: "User updated successfully", data: user };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  /**
   * Verify Google ID token and create/find user, then generate JWT token
   * Input: idToken string (from frontend Google sign-in)
   */
  async verifyGoogleTokenAndGetUser(idToken: string) {
    try {
      // Verify token and get Google user profile info
      const googleProfile = await this.googleService.verifyIdToken(idToken);

      // Try find user by providerId and google as provider
      let user = await this.findByProviderId(googleProfile.sub, "google");

      if (!user) {
        // Create user if doesn't exist
        const createUserDto: CreateUserDto = {
          name: googleProfile.name,
          email: googleProfile.email,
          password: null,
          provider: "google",
          providerId: googleProfile.sub,
        };
        user = await this.create(createUserDto);
      }

      // Generate JWT token
      const payload = {
        name: user.name,
        email: user.email,
        sub: user._id,
        roles: user.roles,
      };

      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "24h",
      });

      return {
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          provider: user.provider,
          providerId: user.providerId,
          whatsAppNumber: user.whatsAppNumber || null,
          isWhatsAppVerified: !!user.whatsAppNumber,
        },
        token,
      };
    } catch (error) {
      console.error("Google token verification error:", error);
      throw new InternalServerErrorException(
        "Failed to verify Google token: " + error.message,
      );
    }
  }

  /**
   * EMAIL VERIFICATION FOR CART (using Google backend flow)
   * 1. Check user by email
   * 2. If exists, return data & token
   * 3. Else, call Google backend flow to create user (simulate)
   */
  async verifyEmailForCart(email: string, whatsAppNumber: string) {
    try {
      // Step 1: Find user by email first (primary); fallback to WhatsApp if provided
      let user = await this.userModel.findOne({ email });

      if (!user && whatsAppNumber) {
        user = await this.userModel.findOne({ whatsAppNumber });
      }

      let isNewUser = false;

      if (user) {
        // Step 2: Update email if needed
        let shouldSave = false;
        if (user.email) {
          if (user.email !== email) {
            user.email = email;
            shouldSave = true;
          } else if (user.email === null) {
            user.email = email;
            shouldSave = true;
          }
        } else {
          user.email = email;
          shouldSave = true;
        }
        if (shouldSave) await user.save();

        const payload = {
          name: user.name,
          email: user.email,
          sub: user._id,
          roles: user.roles,
        };
        const token = this.jwtService.sign(payload, {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: "24h",
        });

        return {
          success: true,
          message: "User found and email ensured/updated",
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            whatsAppNumber: user.whatsAppNumber || null,
            isWhatsAppVerified: !!user.whatsAppNumber,
          },
          token,
          isNewUser: false,
        };
      } else {
        // No user found, create new
        // You may set fullName based on your own logic, here defaulting to prefix of email
        const fullName = email.split("@")[0];
        const createUserDto: CreateUserDto = {
          name: fullName,
          email,
          password: null,
          provider: "google", // Or "email" if you prefer
          providerId: null,
          whatsAppNumber: whatsAppNumber || null,
        };

        user = await this.create(createUserDto);

        const payload = {
          name: user.name,
          email: user.email,
          sub: user._id,
          roles: user.roles,
        };
        const token = this.jwtService.sign(payload, {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: "24h",
        });

        return {
          success: true,
          message: "User created successfully",
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            whatsAppNumber: user.whatsAppNumber || null,
            isWhatsAppVerified: !!user.whatsAppNumber,
          },
          token,
          isNewUser: true,
        };
      }
    } catch (error) {
      console.error("Email verification error:", error);
      throw new InternalServerErrorException(
        "Failed to verify email: " + error.message,
      );
    }
  }

  /**
   * WHATSAPP OTP RELATED METHODS (send, verify, update user)
   */
  async sendWhatsAppOtp(whatsAppNumber: string) {
    try {
      const user = await this.userModel.findOne({ whatsAppNumber });
      // if (!user) throw new NotFoundException("User not found");

      // if (user.whatsAppNumber) {
      //   return {
      //     success: false,
      //     message: "WhatsApp number already verified",
      //     alreadyVerified: true,
      //   };
      // }

      await this.otpService.sendWhatsAppOtp(whatsAppNumber, "user");

      return {
        success: true,
        message: "OTP sent",
        whatsAppNumber,
      };
    } catch (error) {
      console.error("WhatsApp OTP send error:", error);
      throw new InternalServerErrorException(
        "Failed to send WhatsApp OTP: " + error.message,
      );
    }
  }

  async verifyWhatsAppOtp(
    fullName: string,
    whatsAppNumber: string,
    otp: string,
  ) {
    try {
      let user = await this.userModel.findOne({ whatsAppNumber });

      if (!user) {
        // Create new user with fullName and WhatsApp Number
        const createUserDto: CreateUserDto = {
          name: fullName,
          email: null,
          password: null,
          provider: null,
          providerId: null,
          whatsAppNumber,
        };
        user = await this.create(createUserDto);
      }

      await this.otpService.verifyWhatsAppOtp(whatsAppNumber, "user", otp);

      // Update user with WhatsApp Number and fullName if changed
      if (user.name !== fullName || user.whatsAppNumber !== whatsAppNumber) {
        const updateData: UpdateUserDto = {
          name: fullName,
          whatsAppNumber,
        };
        const userId = user._id.toString();
        const updatedUser = await this.updateUser(userId, updateData);
        return {
          success: true,
          message: "WhatsApp verified and user updated",
          user: {
            id: updatedUser.data._id,
            name: updatedUser.data.name,
            whatsAppNumber: updatedUser.data.whatsAppNumber,
            isWhatsAppVerified: true,
          },
        };
      }

      return {
        success: true,
        message: "WhatsApp verified",
        user: {
          id: user._id,
          name: user.name,
          whatsAppNumber: user.whatsAppNumber,
          isWhatsAppVerified: true,
        },
      };
    } catch (error) {
      console.error("WhatsApp OTP verify error:", error);
      if (error.message.includes("Invalid or expired OTP")) {
        throw new BadRequestException("Invalid or expired OTP");
      }
      throw new InternalServerErrorException(
        "Failed to verify WhatsApp OTP: " + error.message,
      );
    }
  }

  async createUserByShopkeeper(data: CreateUserDto, shopkeeperId: string) {
    try {
      const user = await this.userModel.findOne({
        whatsAppNumber: data.whatsAppNumber,
        email: data?.email,
      });

      if (user) {
        throw new BadRequestException("User Already Exists");
      }

      const created = new this.userModel({
        name: data.firstName + " " + data.lastName,
        email: data.email,
        provider: "Shopkeeper",
        providerId: shopkeeperId,
        whatsAppNumber: data.whatsAppNumber,
        firstName: data.firstName,
        lastName: data.lastName,
      });

      const saved = await created.save();
      return { message: "User created successfully", data: saved };
    } catch (error) {
      throw error;
    }
  }

  async updateUserByShopkeeper(
    userId: string,
    data: CreateUserDto,
    shopkeeperId: string,
  ) {
    try {
      // 1. Check if user exists. A malformed id would otherwise surface as a
      // Mongoose CastError, i.e. a 500, for what is just a bad request.
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException("User not found");
      }
      const existingUser = await this.userModel.findById(userId);

      if (!existingUser) {
        throw new BadRequestException("User not found");
      }

      // 1b. The caller has already been proven to own `shopkeeperId`, but the
      // user id is a separate URL parameter. Without this a shop could rename
      // (and rewrite the e-mail and WhatsApp number of) any user in the
      // database, including other shops' customers.
      if (!(await this.isCustomerOfShop(existingUser, shopkeeperId))) {
        throw new ForbiddenException(
          "This customer does not belong to your shop.",
        );
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

      // 3. Update fields. The name is the shop's to correct for any of its
      // customers. The e-mail and WhatsApp number are not: a user is one
      // global record, the Google and WhatsApp-OTP logins find the account
      // by exactly those two fields, and every other shop the customer buys
      // from messages that number. "Has an order here" is far too weak to
      // rewrite them on (an order can be placed for any number without
      // logging in), so only a customer this shop created, and that no
      // other shop has an order for, can have them changed here.
      const ownsContact = await this.shopOwnsContactDetails(
        existingUser,
        shopkeeperId,
      );
      if (!ownsContact) {
        // The CRM form always sends both fields back, so only a real change
        // is refused — compared loosely enough that the same number written
        // another way ("+91 98…" vs "98…") is not one.
        const changesEmail =
          data.email !== undefined &&
          !sameEmail(data.email, existingUser.email);
        const changesNumber =
          data.whatsAppNumber !== undefined &&
          !samePhone(data.whatsAppNumber, existingUser.whatsAppNumber);
        if (changesEmail || changesNumber) {
          throw new ForbiddenException(
            "This customer's e-mail and WhatsApp number are managed by the customer. You can change the name only.",
          );
        }
      }

      existingUser.firstName = data.firstName;
      existingUser.lastName = data.lastName;
      existingUser.name = `${data.firstName} ${data.lastName}`;
      // Contact details change only when the form sent them. The CRM form
      // leaves both out when it shows them locked (a customer who also
      // ordered here) — and assigning `undefined` would silently erase the
      // customer's number. When it does send them, the WhatsApp number is
      // always present and a blank e-mail is omitted, so clearing the e-mail
      // from the form still clears it.
      if (ownsContact && data.whatsAppNumber !== undefined) {
        existingUser.email = data.email;
        existingUser.whatsAppNumber = data.whatsAppNumber;
      }

      const updatedUser = await existingUser.save();

      return {
        message: "User updated successfully",
        data: updatedUser,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Whether this shop may rewrite a customer's e-mail and WhatsApp number:
   * it created the record (provider "Shopkeeper" + its id), and no other
   * shop has an order for that user — once another shop does, the record is
   * that shop's customer too, and its messages follow the number.
   */
  private async shopOwnsContactDetails(
    user: { _id: unknown; provider?: string; providerId?: string },
    shopkeeperId: string,
  ): Promise<boolean> {
    const shopId = String(shopkeeperId || "");
    if (
      !shopId ||
      user.provider !== "Shopkeeper" ||
      String(user.providerId) !== shopId
    ) {
      return false;
    }
    // Raw collection and both id forms, for the reasons in isCustomerOfShop.
    const elsewhere = await this.userModel.db.collection("orders").findOne(
      {
        userId: { $in: bothIdForms(String(user._id)) },
        shopkeeperId: { $nin: bothIdForms(shopId) },
      },
      { projection: { _id: 1 } },
    );
    return !elsewhere;
  }

  /**
   * Whether a user is one of this shop's customers, i.e. someone the CRM
   * lists and so may edit: either the shop created them (provider
   * "Shopkeeper" + providerId = shop, exactly how createUserByShopkeeper and
   * the assistant's create_customer tool store them), or they have placed at
   * least one order there (the order half of the CRM list, see
   * OrdersService.getCustomersWithOrderSummary).
   *
   * The order lookup goes through the connection's raw `orders` collection
   * rather than an injected Order model: UsersModule does not register Order,
   * and the raw driver also skips schema casting. That matters because older
   * orders hold userId/shopkeeperId as plain strings (getCustomersWithOrderSummary
   * matches shopkeeperId as a string and has to $toObjectId the userId), while
   * newer ones hold ObjectIds; a cast query would silently miss one of the two
   * forms, so both are matched explicitly.
   *
   * Soft-deleted orders still count. The CRM list does not exclude them, so a
   * customer the shop can see must also be one it can edit.
   */
  async isCustomerOfShop(
    user: { _id: unknown; provider?: string; providerId?: string },
    shopkeeperId: string,
  ): Promise<boolean> {
    const shopId = String(shopkeeperId || "");
    if (!shopId) return false;

    if (user.provider === "Shopkeeper" && String(user.providerId) === shopId) {
      return true;
    }

    const order = await this.userModel.db
      .collection("orders")
      .findOne(
        {
          userId: { $in: bothIdForms(String(user._id)) },
          shopkeeperId: { $in: bothIdForms(shopId) },
        },
        { projection: { _id: 1 } },
      );
    return !!order;
  }

  async fetchUsersByShopkeeperId(shopkeeperId: string) {
    try {
      const user = await this.userModel.find({
        provider: "Shopkeeper",
        providerId: shopkeeperId,
      });

      if (!user) {
        throw new NotFoundException("user not found");
      }

      return { message: "Users fetched successfully", data: user };
    } catch (error) {
      throw error;
    }
  }

  async createUserByOrganizer(data: CreateUserDto, organizerId: string) {
    try {
      const user = await this.userModel.findOne({
        whatsAppNumber: data.whatsAppNumber,
        email: data?.email,
      });

      if (user) {
        throw new BadRequestException("User Already Exists");
      }

      const created = new this.userModel({
        name: data.firstName + " " + data.lastName,
        email: data.email,
        provider: "Organizer",
        providerId: organizerId,
        whatsAppNumber: data.whatsAppNumber,
        firstName: data.firstName,
        lastName: data.lastName,
      });

      const saved = await created.save();
      return { message: "User created successfully", data: saved };
    } catch (error) {
      throw error;
    }
  }

  async updateUserByOrganizer(
    userId: string,
    data: CreateUserDto,
    organizerId: string,
  ) {
    try {
      // 1. Check if user exists and belongs to this shopkeeper
      const existingUser = await this.userModel.findOne({
        _id: userId,
        provider: "Organizer",
        providerId: organizerId,
      });

      if (!existingUser) {
        throw new BadRequestException("User not found or access denied");
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
      existingUser.firstName = data.firstName;
      existingUser.lastName = data.lastName;
      existingUser.name = `${data.firstName} ${data.lastName}`;
      existingUser.email = data.email;
      existingUser.whatsAppNumber = data.whatsAppNumber;

      const updatedUser = await existingUser.save();

      return {
        message: "User updated successfully",
        data: updatedUser,
      };
    } catch (error) {
      throw error;
    }
  }

  async fetchUsersByOrganizerId(organizerId: string) {
    try {
      const user = await this.userModel.find({
        provider: "Organizer",
        providerId: organizerId,
      });

      if (!user) {
        throw new NotFoundException("user not found");
      }

      return { message: "Users fetched successfully", data: user };
    } catch (error) {
      throw error;
    }
  }

  async fetchUserByWhatsAppNumber(whatsAppNumber: string) {
    try {
      const user = await this.userModel.findOne({
        whatsAppNumber: whatsAppNumber,
      });

      if (!user) {
        throw new NotFoundException("User Not Found");
      }

      return { message: "user Found", data: user };
    } catch (error) {
      throw error;
    }
  }
}

/** An id as a string and, when it is one, as an ObjectId — orders hold
 * either form (see isCustomerOfShop). */
function bothIdForms(id: string): unknown[] {
  return Types.ObjectId.isValid(id) ? [id, new Types.ObjectId(id)] : [id];
}

function sameEmail(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Whether two WhatsApp numbers are the same number, written differently. The
 * CRM form sends it back with its dial code ("+919876543210") while an older
 * record may hold it without one ("98765 43210", "IN9876543210", "0987…").
 * Only decides whether an edit is refused; a number the shop may not change
 * is never written either way.
 */
function samePhone(a: unknown, b: unknown): boolean {
  const digits = (v: unknown) =>
    String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  const da = digits(a);
  const db = digits(b);
  if (da === db) return true;
  if (!da || !db) return false;
  const [short, long] = da.length <= db.length ? [da, db] : [db, da];
  // A national number of 8+ digits behind a country code of up to 3.
  return (
    short.length >= 8 && long.length - short.length <= 3 && long.endsWith(short)
  );
}
