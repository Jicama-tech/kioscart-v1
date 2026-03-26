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
    applicant.statusUpdatedAt = new Date(); // <-- log time
    await applicant.save();

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
      const totalEvents = await this.eventModel.countDocuments();
      const activeOrganizers = await this.organizerModel.countDocuments({
        approved: true,
      });
      const activeShopkeepers = await this.shopkeeperModel.countDocuments({
        approved: true,
      });

      // Events in the current month
      const startOfMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      );
      const thisMonthEvents = await this.eventModel.countDocuments({
        createdAt: { $gte: startOfMonth },
      });

      // Pending approvals
      const organizers = await this.organizerModel.find({ approved: false });
      const shopkeepers = await this.shopkeeperModel.find({ approved: false });
      const totalPending = organizers.length + shopkeepers.length;

      // Define time window for recent activity (e.g. last 24 hours)
      const twentyFourHoursAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentStatusUpdatesOrganizers = await this.organizerModel
        .find({ updatedAt: { $gte: twentyFourHoursAgo } })
        .sort({ updatedAt: -1 })
        .lean();

      const recentAddedAdmins = await this.adminModel
        .find({ createdAt: { $gte: twentyFourHoursAgo } })
        .sort({ createdAt: -1 })
        .lean();

      const recentStatusUpdatesShopkeepers = await this.shopkeeperModel
        .find({ updatedAt: { $gte: twentyFourHoursAgo } })
        .sort({ updatedAt: -1 })
        .lean();

      // Recent organizers who applied in last 24h (pending)
      const recentOrganizerApplications = await this.organizerModel
        .find({ approved: false, createdAt: { $gte: twentyFourHoursAgo } })
        .sort({ createdAt: -1 })
        .lean();

      // Recent shopkeepers who applied in last 24h (pending)
      const recentShopkeeperApplications = await this.shopkeeperModel
        .find({ approved: false, createdAt: { $gte: twentyFourHoursAgo } })
        .sort({ createdAt: -1 })
        .lean();

      // Recent events created in last 24h
      const recentEvents = await this.eventModel
        .find({ createdAt: { $gte: twentyFourHoursAgo } })
        .sort({ createdAt: -1 })
        .lean();

      // Recent user registrations in last 24h
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
        ...recentStatusUpdatesOrganizers.map((o) => ({
          id: o._id,
          type: "organizer",
          name: o.name,
          action: o.approved
            ? "approved for organizer role"
            : "rejected for organizer role",
          time: o.updatedAt,
          status: o.approved ? "Approved" : "Rejected",
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
        ...recentEvents.map((e) => ({
          id: e._id,
          type: "event",
          name: e.title,
          action: "event created",
          time: e.createdAt,
          status: "Live",
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

      return {
        message: "Admin dashboard data fetched successfully",
        stats: {
          totalUsers,
          totalEvents,
          activeOrganizers,
          activeShopkeepers,
          pendingApprovals: totalPending,
          thisMonthEvents,
        },
        pendingApprovals: {
          organizers,
          shopkeepers,
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
}
