import { forwardRef, Module } from "@nestjs/common";
import { OperatorsService } from "./operators.service";
import { OperatorsController } from "./operators.controller";
import { MongooseModule } from "@nestjs/mongoose/dist";
import { Operator, OperatorSchema } from "./entities/operator.entity";
import { ShopkeepersModule } from "../shopkeepers/shopkeepers.module";
import { OrganizersModule } from "../organizers/organizers.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Operator.name, schema: OperatorSchema },
    ]),
    forwardRef(() => ShopkeepersModule),
    OrganizersModule,
  ],
  controllers: [OperatorsController],
  providers: [OperatorsService, MongooseModule],
})
export class OperatorsModule {}
