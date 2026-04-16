import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { CreateAdminDto } from "./dto/create-admin.dto";
import { InjectModel } from "@nestjs/mongoose/dist";
import { Admin } from "./entities/admin.entity";
import { Model } from "mongoose";
import { JwtService } from "@nestjs/jwt";
import { LocalDto } from "../auth/dto/local.dto";
import * as bcrypt from "bcrypt";
import { NotFoundError } from "rxjs/dist/types";
import { LoginDto } from "./dto/login.dto";
import { Organizer } from "../organizers/schemas/organizer.schema";
import { Shopkeeper } from "../shopkeepers/schemas/shopkeeper.schema";
import { User } from "../users/schemas/user.schema";
import { Event } from "../events/schemas/event.schema";
import { MailService } from "../roles/mail.service";

// import { UpdateAdminDto } from './dto/update-admin.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Admin.name) private adminModel: Model<Admin>,
    @InjectModel(Organizer.name) private organizerModel: Model<Organizer>,
    @InjectModel(Shopkeeper.name) private shopkeeperModel: Model<Shopkeeper>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel("Product") private productModel: Model<any>,
    @InjectModel("Order") private orderModel: Model<any>,
    @InjectModel("Operator") private operatorModel: Model<any>,
    @InjectModel("Agent") private agentModel: Model<any>,
    @InjectModel("Plan") private planModel: Model<any>,
    @InjectModel("Coupon") private couponModel: Model<any>,
    @InjectModel("PlatformPayment") private platformPaymentModel: Model<any>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService
  ) {}

  async create(createAdminDto: CreateAdminDto) {
    try {
      // 1. Check if email already exists
      const existingAdmin = await this.adminModel.findOne({
        email: createAdminDto.email,
      });
      if (existingAdmin) {
        throw new Error("Admin Already Exists");
      }

      // 2. Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(
        createAdminDto.password,
        saltRounds
      );

      // 3. Fetch creator name for the email message
      let creatorName = "System";

      // 4. Create new admin object
      const adminToCreate = {
        ...createAdminDto,
        password: hashedPassword,
      };

      // 5. Save new admin
      const adminData = await this.adminModel.create(adminToCreate);

      // 6. Send email with credentials to the new admin
      await this.mailService.sendNewAdminCredentials({
        name: createAdminDto.name,
        email: createAdminDto.email,
        password: createAdminDto.password, // plain password so they can log in before resetting
        createdBy: creatorName,
      });

      // 7. Return success message
      return {
        message: "Admin Created Successfully",
        adminData: { id: adminData._id, email: adminData.email },
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async approveApplicant(id: string, role: "Organizer" | "Shopkeeper") {
    let applicant: any;
    if (role === "Organizer") {
      applicant = await this.organizerModel.findById(id);
    } else if (role === "Shopkeeper") {
      applicant = await this.shopkeeperModel.findById(id);
    }
    if (!applicant) throw new NotFoundException(`${role} not found`);

    applicant.approved = true;
    applicant.rejected = false;
    applicant.statusUpdatedAt = new Date();
    await applicant.save();

    // If shopkeeper is referred by an agent, add the agent as an operator of this store
    if (role === "Shopkeeper" && applicant.provider === "Agent" && applicant.providerId) {
      try {
        const agent: any = await this.agentModel.findById(applicant.providerId).lean();
        if (agent) {
          // Check if agent is already an operator for this shop
          const existingOp = await this.operatorModel.findOne({
            whatsAppNumber: agent.whatsAppNumber,
            shopkeeperId: applicant._id.toString(),
          });
          if (!existingOp) {
            await new this.operatorModel({
              name: agent.name,
              whatsAppNumber: agent.whatsAppNumber,
              email: agent.email || "",
              shopkeeperId: applicant._id.toString(),
              accessTabs: ["dashboard", "orders", "products", "crm", "kiosk"],
            }).save();
          }
        }
      } catch (err) {
        console.error("Failed to add agent as operator:", err);
      }
    }

    await this.mailService.sendStatusUpdate({
      name: applicant.name,
      email: applicant.email,
      role,
      status: "Approved",
    });

    return { message: `${role} approved successfully` };
  }

  // Reject logic
  async rejectApplicant(id: string, role: "Organizer" | "Shopkeeper") {
    let applicant: any;
    if (role === "Organizer") {
      applicant = await this.organizerModel.findById(id);
    } else if (role === "Shopkeeper") {
      applicant = await this.shopkeeperModel.findById(id);
    }
    if (!applicant) throw new NotFoundException(`${role} not found`);

    applicant.approved = false;
    applicant.rejected = true;
    applicant.statusUpdatedAt = new Date(); // <-- log time
    await applicant.save();

    await this.mailService.sendStatusUpdate({
      name: applicant.name,
      email: applicant.email,
      role,
      status: "Rejected",
    });

    return { message: `${role} rejected successfully` };
  }

  async getDashboardData() {
    try {
      // Stats
      const totalUsers = await this.userModel.countDocuments();
      const totalShopkeepers = await this.shopkeeperModel.countDocuments();
      const activeShopkeepers = await this.shopkeeperModel.countDocuments({
        approved: true,
      });
      const totalProducts = await this.productModel.countDocuments();

      // Order aggregate (count + revenue)
      const orderAgg = await this.orderModel.aggregate([
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
          },
        },
      ]);
      const totalOrders = orderAgg[0]?.totalOrders || 0;
      const totalRevenue = orderAgg[0]?.totalRevenue || 0;

      // New shopkeepers this month
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );
      const thisMonthShopkeepers = await this.shopkeeperModel.countDocuments({
        createdAt: { $gte: startOfMonth },
      });

      // Active subscriptions count
      const activeSubscriptions = await this.shopkeeperModel.countDocuments({
        subscribed: true,
        planExpiryDate: { $gte: new Date() },
      });

      // Pending approvals (shopkeepers only now — organizers removed from dashboard)
      const shopkeepers = await this.shopkeeperModel.find({ approved: false });
      const totalPending = shopkeepers.length;

      // Define time window for recent activity (last 7 days)
      const twentyFourHoursAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentAddedAdmins = await this.adminModel
        .find({ createdAt: { $gte: twentyFourHoursAgo } })
        .sort({ createdAt: -1 })
        .lean();

      const recentStatusUpdatesShopkeepers = await this.shopkeeperModel
        .find({ updatedAt: { $gte: twentyFourHoursAgo } })
        .sort({ updatedAt: -1 })
        .lean();

      // Recent user registrations in last 7 days
      const recentUsers = await this.userModel
        .find({ createdAt: { $gte: twentyFourHoursAgo } })
        .sort({ createdAt: -1 })
        .lean();

      // Format recent activities into unified array with status and type
      const recentActivity = [
        ...recentAddedAdmins.map((a) => ({
          id: a._id,
          type: "admin",
          name: a.name || a.email, // fallback to email if no name
          action: "added as admin",
          time: a.createdAt,
          status: "Admin Added",
        })),
        ...recentStatusUpdatesShopkeepers.map((s) => ({
          id: s._id,
          type: "shopkeeper",
          name: s.name,
          action: s.approved
            ? "approved for shopkeeper role"
            : "rejected for shopkeeper role",
          time: s.updatedAt,
          status: s.approved ? "Approved" : "Rejected",
        })),
        ...recentUsers.map((u) => ({
          id: u._id,
          type: "user",
          name: u.name,
          action: "registered",
          time: u.createdAt,
          status: "Active",
        })),
      ];

      // Sort combined recentActivity by date descending
      recentActivity.sort(
        (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
      );

      // Enrich pending shopkeepers with agent referral info
      const agentIds = [...new Set(
        shopkeepers
          .filter((s: any) => s.provider === "Agent" && s.providerId)
          .map((s: any) => s.providerId),
      )];
      const agents = agentIds.length > 0
        ? await this.agentModel.find({ _id: { $in: agentIds } }).select("name referralCode").lean()
        : [];
      const agentMap = new Map(agents.map((a: any) => [a._id.toString(), { name: a.name, referralCode: a.referralCode }]));

      const enrichedShopkeepers = shopkeepers.map((s: any) => {
        const plain = s.toObject ? s.toObject() : s;
        return {
          ...plain,
          referredBy: plain.provider === "Agent" && plain.providerId
            ? agentMap.get(plain.providerId) || null
            : null,
        };
      });

      return {
        message: "Admin dashboard data fetched successfully",
        stats: {
          totalUsers,
          totalShopkeepers,
          activeShopkeepers,
          totalProducts,
          totalOrders,
          totalRevenue,
          activeSubscriptions,
          pendingApprovals: totalPending,
          thisMonthShopkeepers,
        },
        pendingApprovals: {
          shopkeepers: enrichedShopkeepers,
        },
        recentActivity,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async login(dto: LoginDto) {
    try {
      const admin = await this.adminModel.findOne({
        email: dto.email,
      });

      if (!admin) {
        // 1. Compare the provided password with the hashed password
        throw new NotFoundException("Admin Not Found");
      }

      const isValidPassword = await bcrypt.compare(
        dto.password,
        admin.password
      );

      if (!isValidPassword) {
        // 2. If the passwords don't match, throw an error
        throw new UnauthorizedException("Invalid Password");
      }
      // 3. If the passwords match, return a JWT token
      const payload = {
        sub: admin._id,
        email: admin.email,
        name: admin.name,
        roles: admin.role || [],
      };
      const token = this.jwtService.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: "1h",
      });

      return { message: "login Successfull", data: token };
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  findAll() {
    return `This action returns all admin`;
  }

  findOne(id: number) {
    return `This action returns a #${id} admin`;
  }

  // update(id: number, updateAdminDto: UpdateAdminDto) {
  //   return `This action updates a #${id} admin`;
  // }

  remove(id: number) {
    return `This action removes a #${id} admin`;
  }

  async getShopkeepersOverview() {
    const shopkeepers = await this.shopkeeperModel.find().sort({ createdAt: -1 }).lean();

    const shopkeeperIds = shopkeepers.map((s: any) => s._id.toString());

    // Get product counts per shopkeeper
    const productCounts = await this.productModel.aggregate([
      { $match: { shopkeeperId: { $in: shopkeeperIds } } },
      { $group: { _id: "$shopkeeperId", count: { $sum: 1 } } },
    ]);
    const productMap = new Map(productCounts.map((p: any) => [p._id, p.count]));

    // Get order stats per shopkeeper
    const orderStats = await this.orderModel.aggregate([
      { $match: { shopkeeperId: { $in: shopkeeperIds } } },
      {
        $group: {
          _id: "$shopkeeperId",
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
        },
      },
    ]);
    const orderMap = new Map(
      orderStats.map((o: any) => [o._id, { orders: o.totalOrders, revenue: o.totalRevenue, completed: o.completedOrders }]),
    );

    // Get operators per shopkeeper
    const operators = await this.operatorModel.find({ shopkeeperId: { $in: shopkeeperIds } }).lean();
    const operatorMap = new Map<string, any[]>();
    operators.forEach((op: any) => {
      const key = op.shopkeeperId?.toString();
      if (!operatorMap.has(key)) operatorMap.set(key, []);
      operatorMap.get(key)!.push({ name: op.name, email: op.email, whatsAppNumber: op.whatsAppNumber });
    });

    // Get agent names for referred shopkeepers
    const agentIds = [...new Set(shopkeepers.filter((s: any) => s.provider === "Agent" && s.providerId).map((s: any) => s.providerId))];
    const agents = agentIds.length > 0
      ? await this.agentModel.find({ _id: { $in: agentIds } }).select("name referralCode").lean()
      : [];
    const agentMap = new Map(agents.map((a: any) => [a._id.toString(), { name: a.name, referralCode: a.referralCode }]));

    // Get plan info for subscribed shopkeepers
    const planIds = [...new Set(shopkeepers.filter((s: any) => s.planId).map((s: any) => s.planId.toString()))];
    const plans = planIds.length > 0
      ? await this.planModel.find({ _id: { $in: planIds } }).select("planName price validityInDays").lean()
      : [];
    const planMap = new Map(plans.map((p: any) => [p._id.toString(), p]));

    const result = shopkeepers.map((s: any) => {
      const sid = s._id.toString();
      const stats = orderMap.get(sid) || { orders: 0, revenue: 0, completed: 0 };
      const plan: any = s.planId ? planMap.get(s.planId.toString()) : null;
      const now = Date.now();
      const expiry = s.planExpiryDate ? new Date(s.planExpiryDate).getTime() : null;
      const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))) : null;
      const isExpired = expiry ? now > expiry : false;

      return {
        _id: s._id,
        name: s.name,
        shopName: s.shopName,
        email: s.email,
        businessEmail: s.businessEmail,
        phone: s.phone,
        whatsappNumber: s.whatsappNumber,
        address: s.address,
        country: s.country,
        businessCategory: s.businessCategory,
        approved: s.approved,
        rejected: s.rejected,
        hasDocVerification: s.hasDocVerification,
        GSTNumber: s.GSTNumber,
        UENNumber: s.UENNumber,
        createdAt: s.createdAt,
        productsCount: productMap.get(sid) || 0,
        totalOrders: stats.orders,
        totalRevenue: stats.revenue,
        completedOrders: stats.completed,
        operators: operatorMap.get(sid) || [],
        referredBy: s.provider === "Agent" && s.providerId
          ? agentMap.get(s.providerId) || null
          : null,
        provider: s.provider,
        subscription: {
          subscribed: s.subscribed || false,
          planName: plan?.planName || null,
          planPrice: plan?.price ?? null,
          validityInDays: plan?.validityInDays ?? null,
          planStartDate: s.planStartDate || null,
          planExpiryDate: s.planExpiryDate || null,
          pricePaid: s.pricePaid || null,
          daysLeft,
          isExpired,
        },
      };
    });

    return { shopkeepers: result, total: result.length };
  }

  async getUsersOverview() {
    const users = await this.userModel.find().sort({ createdAt: -1 }).lean();

    const userIds = users.map((u: any) => u._id.toString());

    // Get order stats per user
    const orderStats = await this.orderModel.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: { $toString: "$userId" },
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
          lastOrderDate: { $max: "$createdAt" },
          shopkeepers: { $addToSet: "$shopkeeperId" },
        },
      },
    ]);
    const orderMap = new Map(
      orderStats.map((o: any) => [o._id, {
        orders: o.totalOrders,
        spent: o.totalSpent,
        lastOrder: o.lastOrderDate,
        uniqueShops: o.shopkeepers?.length || 0,
      }]),
    );

    const result = users.map((u: any) => {
      const uid = u._id.toString();
      const stats = orderMap.get(uid) || { orders: 0, spent: 0, lastOrder: null, uniqueShops: 0 };
      return {
        _id: u._id,
        name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Unknown",
        email: u.email || "",
        whatsAppNumber: u.whatsAppNumber || "",
        provider: u.provider || "direct",
        roles: u.roles || ["user"],
        createdAt: u.createdAt,
        totalOrders: stats.orders,
        totalSpent: stats.spent,
        lastOrderDate: stats.lastOrder,
        uniqueShops: stats.uniqueShops,
      };
    });

    const totalSpent = result.reduce((sum, u) => sum + u.totalSpent, 0);
    const totalOrders = result.reduce((sum, u) => sum + u.totalOrders, 0);
    const activeUsers = result.filter((u) => u.totalOrders > 0).length;

    return {
      users: result,
      total: result.length,
      activeUsers,
      totalOrders,
      totalSpent,
    };
  }

  async cleanupSoftDeleted() {
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);

    const [products, orders, coupons, operators] = await Promise.all([
      this.productModel.deleteMany({
        isSoftDeleted: true,
        softDeletedAt: { $lt: sixMonthsAgo },
      }),
      this.orderModel.deleteMany({
        isSoftDeleted: true,
        softDeletedAt: { $lt: sixMonthsAgo },
      }),
      this.couponModel.deleteMany({
        isDeleted: true,
        softDeletedAt: { $lt: sixMonthsAgo },
      }),
      this.operatorModel.deleteMany({
        isSoftDeleted: true,
        softDeletedAt: { $lt: sixMonthsAgo },
      }),
    ]);

    return {
      message: "Cleanup complete",
      deleted: {
        products: products.deletedCount,
        orders: orders.deletedCount,
        coupons: coupons.deletedCount,
        operators: operators.deletedCount,
      },
    };
  }

  async getPlatformPayment() {
    let doc: any = await this.platformPaymentModel.findOne().lean();
    if (!doc) {
      const created: any = await this.platformPaymentModel.create({});
      doc = created.toObject();
    }
    return doc;
  }

  async updatePlatformPayment(body: any, qrPublicUrl?: string | null) {
    const existing = await this.platformPaymentModel.findOne();
    const update: any = { ...body };
    if (qrPublicUrl) update.qrCodeURL = qrPublicUrl;

    if (!existing) {
      const created: any = await this.platformPaymentModel.create(update);
      return created.toObject();
    }
    const updated = await this.platformPaymentModel.findByIdAndUpdate(
      existing._id,
      update,
      { new: true },
    ).lean();
    return updated;
  }
}
