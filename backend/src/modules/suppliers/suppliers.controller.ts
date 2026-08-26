import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import * as fs from "fs";

const UPLOAD_DIR = "./uploads/suppliers";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierRequestDto } from "./dto/create-supplier-request.dto";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { SupplierRespondDto } from "./dto/supplier-respond.dto";
import { UpsertSupplierConfigDto } from "./dto/upsert-supplier-config.dto";
import { UpdateSupplierStatusDto } from "./dto/update-supplier-status.dto";
import { RecordSupplierPaymentDto } from "./dto/record-supplier-payment.dto";
import { AddSupplierNoteDto } from "./dto/add-supplier-note.dto";

function generateFileName(_req: any, file: any, cb: any) {
  const ext = path.extname(file.originalname);
  cb(null, `${uuidv4()}${ext}`);
}

// Quotation docs + payment proofs — images or PDF.
const proofFilter = (_req: any, file: any, cb: any) => {
  if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp|pdf)$/)) {
    cb(new Error("Only image or PDF files are allowed!"), false);
  } else {
    cb(null, true);
  }
};

const supplierUpload = (field: string) =>
  FileInterceptor(field, {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
      },
      filename: generateFileName,
    }),
    fileFilter: proofFilter,
    limits: { fileSize: 10 * 1024 * 1024 },
  });

/**
 * Ported from eventsh-v1's SuppliersController (organizer/event-scoped) and
 * re-keyed to shopkeeper/product — routes, guards and multipart handling are
 * kept identical in shape.
 */
@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  // ---------- PUBLIC ----------

  // Supplier opens the shared link → sees the shopkeeper's requirements.
  @Get("form/:productId")
  async getForm(@Param("productId") productId: string) {
    const data = await this.suppliersService.getFormByProduct(productId);
    return { success: true, message: "Supplier form loaded", data };
  }

  // Supplier signs in with Google on the form → look up their saved profile
  // (by email or business email) under this product's shopkeeper, for
  // prefill. PUBLIC — the email is already Google-verified by the OAuth
  // popup.
  @Get("product/:productId/supplier-by-email/:email")
  async supplierByEmail(
    @Param("productId") productId: string,
    @Param("email") email: string,
  ) {
    const data = await this.suppliersService.findSupplierForProductByEmail(
      productId,
      email,
    );
    return { success: true, message: "Supplier lookup", data };
  }

  // Supplier revisit: their existing quotation + status timeline for this
  // product (or null). PUBLIC — email is Google-verified by the OAuth popup.
  @Get("product/:productId/my-request/:email")
  async myRequest(
    @Param("productId") productId: string,
    @Param("email") email: string,
  ) {
    const data = await this.suppliersService.getMyRequestForProduct(
      productId,
      email,
    );
    return { success: true, message: "Supplier request timeline", data };
  }

  // Supplier's negotiation reply (Approve / Negotiate / Reject) from their
  // timeline. PUBLIC — email is Google-verified by the OAuth popup.
  @Post("product/:productId/my-request/:email/respond")
  async supplierRespond(
    @Param("productId") productId: string,
    @Param("email") email: string,
    @Body() dto: SupplierRespondDto,
  ) {
    const data = await this.suppliersService.supplierRespond(
      productId,
      email,
      dto,
    );
    return { success: true, message: "Response recorded", data };
  }

  // Supplier confirms the shopkeeper's payment + uploads their invoice/bill.
  // PUBLIC — email is Google-verified. Multipart (optional `invoice` file).
  @Post("product/:productId/my-request/:email/confirm-payment")
  @UseInterceptors(supplierUpload("invoice"))
  async supplierConfirmPayment(
    @Param("productId") productId: string,
    @Param("email") email: string,
    @Body() body: { note?: string },
    @UploadedFile() file?: any,
  ) {
    const invoice = file
      ? `/uploads/suppliers/${(file as any).filename}`
      : undefined;
    const data = await this.suppliersService.supplierConfirmPayment(
      productId,
      email,
      invoice,
      body?.note,
    );
    return { success: true, message: "Payment confirmed", data };
  }

  // Supplier submits their quotation + account details (multipart, optional
  // quotation attachment). PUBLIC — gated by the form being enabled.
  @Post("register")
  @UseInterceptors(supplierUpload("quotationAttachment"))
  async register(
    @Body() dto: CreateSupplierRequestDto,
    @UploadedFile() file?: any,
  ) {
    const attachment = file
      ? `/uploads/suppliers/${(file as any).filename}`
      : undefined;
    const data = await this.suppliersService.submitRequest(dto, attachment);
    return {
      success: true,
      message: "Quotation submitted. The shopkeeper will review it.",
      data,
    };
  }

  // ---------- SHOPKEEPER: supplier CRM (identity list) ----------

  @Post("create-by-shopkeeper/:shopkeeperId")
  @UseGuards(JwtAuthGuard)
  createByShopkeeper(
    @Param("shopkeeperId") shopkeeperId: string,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.suppliersService.createForShopkeeper(shopkeeperId, dto);
  }

  @Patch("update-by-shopkeeper/:shopkeeperId/:supplierId")
  @UseGuards(JwtAuthGuard)
  updateByShopkeeper(
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("supplierId") supplierId: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliersService.updateForShopkeeper(
      shopkeeperId,
      supplierId,
      dto,
    );
  }

  @Delete("delete-by-shopkeeper/:shopkeeperId/:supplierId")
  @UseGuards(JwtAuthGuard)
  async deleteForShopkeeper(
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("supplierId") supplierId: string,
  ) {
    const { message } = await this.suppliersService.deleteForShopkeeper(
      shopkeeperId,
      supplierId,
    );
    return { success: true, message };
  }

  // Which products this supplier has been engaged for (eye icon in the CRM).
  @Get("history/:shopkeeperId/:supplierId")
  @UseGuards(JwtAuthGuard)
  async supplierProductHistory(
    @Param("shopkeeperId") shopkeeperId: string,
    @Param("supplierId") supplierId: string,
  ) {
    const data = await this.suppliersService.supplierProductHistory(
      shopkeeperId,
      supplierId,
    );
    return { success: true, message: "Supplier history fetched", data };
  }

  @Get("list-by-shopkeeper/:shopkeeperId")
  @UseGuards(JwtAuthGuard)
  listSuppliersByShopkeeper(@Param("shopkeeperId") shopkeeperId: string) {
    return this.suppliersService.listForShopkeeper(shopkeeperId);
  }

  // ---------- SHOPKEEPER: per-product config + link ----------

  // Requirements derived from what actually sold recently, so the
  // shopkeeper doesn't retype what the system already knows.
  @Get("product/:productId/requirement-suggestions")
  @UseGuards(JwtAuthGuard)
  async requirementSuggestions(@Param("productId") productId: string) {
    const data = await this.suppliersService.requirementSuggestions(productId);
    return { success: true, message: "Suggestions built", data };
  }

  // Which requirements are covered, by whom, and what's still to source.
  @Get("product/:productId/fulfilment")
  @UseGuards(JwtAuthGuard)
  async requirementFulfilment(@Param("productId") productId: string) {
    const data = await this.suppliersService.requirementFulfilment(productId);
    return { success: true, message: "Fulfilment built", data };
  }

  @Get("product/:productId/config")
  @UseGuards(JwtAuthGuard)
  async getConfig(@Param("productId") productId: string) {
    const data = await this.suppliersService.getConfig(productId);
    return { success: true, message: "Config loaded", data };
  }

  @Patch("product/:productId/config")
  @UseGuards(JwtAuthGuard)
  async upsertConfig(
    @Param("productId") productId: string,
    @Body() dto: UpsertSupplierConfigDto,
  ) {
    const data = await this.suppliersService.upsertConfig(productId, dto);
    return { success: true, message: "Config saved", data };
  }

  @Patch("product/:productId/enabled")
  @UseGuards(JwtAuthGuard)
  async setEnabled(
    @Param("productId") productId: string,
    @Body() body: { enabled: boolean },
  ) {
    const data = await this.suppliersService.setEnabled(
      productId,
      !!body?.enabled,
    );
    return { success: true, message: "Supplier form updated", data };
  }

  // ---------- SHOPKEEPER: quotations ----------

  @Get("product/:productId")
  @UseGuards(JwtAuthGuard)
  async listByProduct(@Param("productId") productId: string) {
    const data = await this.suppliersService.listByProduct(productId);
    return { success: true, message: "Supplier quotations fetched", data };
  }

  @Get("shopkeeper/:shopkeeperId")
  @UseGuards(JwtAuthGuard)
  async listByShopkeeper(@Param("shopkeeperId") shopkeeperId: string) {
    const data = await this.suppliersService.listByShopkeeper(shopkeeperId);
    return { success: true, message: "Supplier quotations fetched", data };
  }

  @Get("request/:id")
  @UseGuards(JwtAuthGuard)
  async getOne(@Param("id") id: string) {
    const data = await this.suppliersService.getOne(id);
    return { success: true, message: "Supplier request fetched", data };
  }

  // Goods received at / returned from the shop. Separate from payment.
  @Patch("request/:id/check")
  @UseGuards(JwtAuthGuard)
  async checkItems(
    @Param("id") id: string,
    @Body()
    body: {
      direction?: "in" | "out";
      entries?: Array<{ requirementLabel: string; quantity: number }>;
      by?: string;
      note?: string;
    },
  ) {
    const data = await this.suppliersService.checkItems(
      id,
      body?.direction === "out" ? "out" : "in",
      body?.entries || [],
      body?.by,
      body?.note,
    );
    return { success: true, message: "Items updated", data };
  }

  @Patch("request/:id/status")
  @UseGuards(JwtAuthGuard)
  async updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateSupplierStatusDto,
  ) {
    const data = await this.suppliersService.updateStatus(id, dto);
    return { success: true, message: "Status updated", data };
  }

  @Post("request/:id/record-payment")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(supplierUpload("proofScreenshot"))
  async recordPayment(
    @Param("id") id: string,
    @Body() dto: RecordSupplierPaymentDto,
    @UploadedFile() file?: any,
  ) {
    const proof = file
      ? `/uploads/suppliers/${(file as any).filename}`
      : undefined;
    const data = await this.suppliersService.recordPayment(id, dto, proof);
    return { success: true, message: "Payment recorded", data };
  }

  @Post("request/:id/notes")
  @UseGuards(JwtAuthGuard)
  async addNote(@Param("id") id: string, @Body() dto: AddSupplierNoteDto) {
    const data = await this.suppliersService.addNote(id, dto);
    return { success: true, message: "Note added", data };
  }
}
