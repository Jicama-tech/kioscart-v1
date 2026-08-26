import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Supplier, SupplierDocument } from "./schemas/supplier.schema";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";

@Injectable()
export class SuppliersService {
  constructor(@InjectModel("Supplier") private readonly supplierModel: Model<SupplierDocument>) {}

  create(dto: CreateSupplierDto, shopkeeperId: string) {
    return new this.supplierModel({ ...dto, shopkeeperId }).save();
  }

  findAll(shopkeeperId: string) {
    return this.supplierModel.find({ shopkeeperId, isSoftDeleted: { $ne: true } }).sort({ name: 1 }).exec();
  }

  async findOne(id: string) {
    const supplier = await this.supplierModel.findById(id).exec();
    if (!supplier || supplier.isSoftDeleted) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.findOne(id);
    Object.assign(supplier, dto);
    return supplier.save();
  }

  async remove(id: string) {
    const supplier = await this.findOne(id);
    supplier.isSoftDeleted = true;
    supplier.softDeletedAt = new Date();
    await supplier.save();
    return { success: true };
  }

  async findByProduct(productId: string, shopkeeperId: string) {
    return this.supplierModel
      .find({ shopkeeperId, "products.productId": productId, isSoftDeleted: { $ne: true } })
      .exec();
  }
}
