import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PlansService } from "./plans.service";
import { PlansController } from "./plans.controller";
import { MongooseModule } from "@nestjs/mongoose/dist";
import { Plan, PlanSchema } from "./entities/plan.entity";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Plan.name, schema: PlanSchema }]),
    // Needed so AdminGuard can inject JwtService to verify admin tokens.
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || "secret",
    }),
  ],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
