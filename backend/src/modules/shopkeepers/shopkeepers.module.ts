import { Module, forwardRef } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ShopkeepersService } from "./shopkeepers.service";
import { ShopkeepersController } from "./shopkeepers.controller";
import { Shopkeeper, ShopkeeperSchema } from "./schemas/shopkeeper.schema";
import { JwtService } from "@nestjs/jwt";
import { MailModule } from "../roles/mail.module";
import { OtpModule } from "../otp/otp.module";
import { Otp, OtpSchema } from "../otp/entities/otp.entity";
import { OperatorsModule } from "../operators/operators.module";
import {
  Operator,
  OperatorSchema,
} from "../operators/entities/operator.entity";
import { Plan, PlanSchema } from "../plans/entities/plan.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Shopkeeper.name, schema: ShopkeeperSchema },
      { name: Otp.name, schema: OtpSchema },
      { name: Operator.name, schema: OperatorSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
    forwardRef(() => OtpModule),
    forwardRef(() => OperatorsModule), // Wrap here with forwardRef
    forwardRef(() => MailModule), // MailModule too if circular
  ],
  providers: [ShopkeepersService, JwtService],
  controllers: [ShopkeepersController],
  exports: [ShopkeepersService, MongooseModule],
})
export class ShopkeepersModule {}
