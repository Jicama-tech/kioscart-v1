import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";

@Controller("suppliers")
@UseGuards(AuthGuard("jwt"))
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  create(@Body() dto: CreateSupplierDto, @Req() req: any) {
    return this.suppliersService.create(dto, req.user.userId);
  }

  @Get()
  findAll(@Req() req: any, @Query("productId") productId?: string) {
    if (productId) {
      return this.suppliersService.findByProduct(productId, req.user.userId);
    }
    return this.suppliersService.findAll(req.user.userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.suppliersService.remove(id);
  }
}
