import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { User, UserSchema } from "./schemas/user.schema";
import { JwtModule } from "@nestjs/jwt";
import { OtpModule } from "../otp/otp.module";
import { GoogleAuthService } from "./google.auth.service";
import {
  Operator,
  OperatorSchema,
} from "../operators/entities/operator.entity";
import { TabsGuard } from "../../common/tabs/tabs.guard";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // TabsGuard re-reads the operator on every request to the CRM routes.
      { name: Operator.name, schema: OperatorSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || "secretKey",
      signOptions: { expiresIn: "24h" },
    }),
    OtpModule, // Import OtpModule to use OtpService
  ],
  providers: [UsersService, GoogleAuthService, TabsGuard],
  controllers: [UsersController],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
