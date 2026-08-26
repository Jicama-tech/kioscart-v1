import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ExpensesService, RequestActor } from "./expenses.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { UpdateExpenseDto } from "./dto/update-expense.dto";
import { RejectExpenseDto } from "./dto/reject-expense.dto";

@Controller("expenses")
@UseGuards(AuthGuard("jwt"))
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // Builds the acting identity from the JWT. Operators carry `operatorId`
  // on top of the parent owner's `userId` (see jwt.strategy.ts); everyone
  // else acts as the owner directly (shopkeeper or organizer role).
  private getActor(req: any): RequestActor {
    const roles: string[] = Array.isArray(req.user.roles) ? req.user.roles : [];
    if (req.user.operatorId) {
      const ownerType = roles.includes("organizer") ? "organizer" : "shopkeeper";
      return {
        id: req.user.operatorId,
        role: "operator",
        name: req.user.name,
        ownerId: req.user.userId,
        ownerType,
      };
    }
    const role = roles.includes("organizer") ? "organizer" : "shopkeeper";
    return { id: req.user.userId, role, name: req.user.name };
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("invoice", {
      storage: diskStorage({
        destination: "./uploads/expenses",
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
          cb(null, `invoice-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|pdf)$/) && file.mimetype !== "application/pdf") {
          return cb(new BadRequestException("Only PDF/JPG/PNG invoices are allowed"), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async create(@Req() req: any, @UploadedFile() file: Express.Multer.File, @Body("expense") expenseJson: string) {
    if (!expenseJson) throw new BadRequestException("Expense data missing");
    const dto: CreateExpenseDto = JSON.parse(expenseJson);
    const invoiceUrl = file ? `/uploads/expenses/${file.filename}` : undefined;
    return this.expensesService.create(dto, this.getActor(req), invoiceUrl);
  }

  @Get()
  async findAll(
    @Req() req: any,
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("event") event?: string,
  ) {
    const actor = this.getActor(req);
    const ownerId = actor.role === "operator" ? actor.ownerId! : actor.id;
    const ownerType = actor.role === "operator" ? actor.ownerType! : (actor.role as "organizer" | "shopkeeper");
    return this.expensesService.findForOwner(ownerId, ownerType, { status, category, startDate, endDate, event });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateExpenseDto, @Req() req: any) {
    return this.expensesService.update(id, dto, this.getActor(req));
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: any) {
    return this.expensesService.remove(id, this.getActor(req));
  }

  @Patch(":id/approve")
  async approve(@Param("id") id: string, @Req() req: any) {
    return this.expensesService.approve(id, this.getActor(req));
  }

  @Patch(":id/reject")
  async reject(@Param("id") id: string, @Body() dto: RejectExpenseDto, @Req() req: any) {
    return this.expensesService.reject(id, this.getActor(req), dto.reason);
  }
}
