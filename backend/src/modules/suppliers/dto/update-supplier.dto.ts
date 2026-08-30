import { PartialType } from "@nestjs/mapped-types";
import { CreateSupplierDto } from "./create-supplier.dto";

/** Shopkeeper-side update of a Supplier identity — every field optional. */
export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
