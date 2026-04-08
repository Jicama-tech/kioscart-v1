import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { Agent, AgentDocument } from "./schemas/agent.schema";
import { CreateAgentDto } from "./dto/create-agent.dto";
import { UpdateAgentDto } from "./dto/update-agent.dto";

@Injectable()
export class AgentsService {
  constructor(
    @InjectModel(Agent.name) private agentModel: Model<AgentDocument>,
    @InjectModel("Shopkeeper") private shopkeeperModel: Model<any>,
    @InjectModel("Order") private orderModel: Model<any>,
  ) {}

  private generateReferralCode(name: string): string {
    const prefix = name
      .replace(/[^a-zA-Z]/g, "")
      .substring(0, 4)
      .toUpperCase();
    const suffix = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}${suffix}`;
  }

  async create(dto: CreateAgentDto): Promise<Agent> {
    // Check duplicate WhatsApp or email
    const existing = await this.agentModel.findOne({
      $or: [{ whatsAppNumber: dto.whatsAppNumber }, { email: dto.email }],
    });
    if (existing) {
      throw new BadRequestException(
        "Agent with this WhatsApp number or email already exists",
      );
    }

    // Generate unique referral code
    let referralCode = dto.referralCode || this.generateReferralCode(dto.name);
    let attempts = 0;
    while (await this.agentModel.exists({ referralCode })) {
      referralCode = this.generateReferralCode(dto.name);
      attempts++;
      if (attempts > 10) throw new BadRequestException("Failed to generate unique referral code");
    }

    const agent = new this.agentModel({ ...dto, referralCode });
    return agent.save();
  }

  async findAll(): Promise<Agent[]> {
    return this.agentModel.find().sort({ createdAt: -1 }).lean();
  }

  async findActive(): Promise<Pick<Agent, "name" | "referralCode">[]> {
    return this.agentModel
      .find({ isActive: true })
      .select("name referralCode")
      .lean();
  }

  async findById(id: string): Promise<Agent> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid agent ID");
    }
    const agent = await this.agentModel.findById(id).lean();
    if (!agent) throw new NotFoundException("Agent not found");
    return agent;
  }

  async findByWhatsAppNumber(whatsAppNumber: string): Promise<AgentDocument | null> {
    const digits = whatsAppNumber.replace(/\D/g, "");
    return this.agentModel.findOne({
      whatsAppNumber: { $regex: digits + "$" },
      isActive: true,
    });
  }

  async findByReferralCode(code: string): Promise<Agent | null> {
    return this.agentModel.findOne({ referralCode: code, isActive: true }).lean();
  }

  async update(id: string, dto: UpdateAgentDto): Promise<Agent> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid agent ID");
    }
    const agent = await this.agentModel.findByIdAndUpdate(id, dto, { new: true }).lean();
    if (!agent) throw new NotFoundException("Agent not found");
    return agent;
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException("Invalid agent ID");
    }
    await this.agentModel.findByIdAndUpdate(id, { isActive: false });
    return { message: "Agent deactivated" };
  }

  async getAnalytics(agentId: string) {
    if (!Types.ObjectId.isValid(agentId)) {
      throw new BadRequestException("Invalid agent ID");
    }

    const agent = await this.agentModel.findById(agentId).lean();
    if (!agent) throw new NotFoundException("Agent not found");

    // Find all shopkeepers referred by this agent
    const shopkeepers = await this.shopkeeperModel
      .find({ provider: "Agent", providerId: agentId })
      .select("name shopName email approved createdAt")
      .lean();

    const shopkeeperIds = shopkeepers.map((s: any) => s._id.toString());

    // Aggregate orders for referred shopkeepers
    const orderStats = await this.orderModel.aggregate([
      { $match: { shopkeeperId: { $in: shopkeeperIds }, status: "completed" } },
      {
        $group: {
          _id: "$shopkeeperId",
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    const orderMap = new Map(
      orderStats.map((o: any) => [o._id, { orders: o.totalOrders, revenue: o.totalRevenue }]),
    );

    const shopkeepersList = shopkeepers.map((s: any) => {
      const stats = orderMap.get(s._id.toString()) || { orders: 0, revenue: 0 };
      return {
        _id: s._id,
        name: s.name,
        shopName: s.shopName,
        email: s.email,
        approved: s.approved,
        registeredAt: s.createdAt,
        ordersCount: stats.orders,
        revenue: stats.revenue,
      };
    });

    const totalRevenue = shopkeepersList.reduce((sum, s) => sum + s.revenue, 0);
    const totalOrders = shopkeepersList.reduce((sum, s) => sum + s.ordersCount, 0);

    return {
      agent: {
        name: agent.name,
        referralCode: agent.referralCode,
        salesTarget: agent.salesTarget,
      },
      referredCount: shopkeepers.length,
      activeCount: shopkeepers.filter((s: any) => s.approved).length,
      pendingCount: shopkeepers.filter((s: any) => !s.approved).length,
      totalOrders,
      totalRevenue,
      salesTargetProgress: agent.salesTarget > 0
        ? Math.round((totalRevenue / agent.salesTarget) * 100)
        : 0,
      shopkeepers: shopkeepersList,
    };
  }
}
