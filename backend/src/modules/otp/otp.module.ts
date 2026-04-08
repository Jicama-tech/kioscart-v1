import { Module, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OtpService } from "./otp.service";
import { OtpController } from "./otp.controller";
import { MongooseModule } from "@nestjs/mongoose";
import { MailModule } from "../roles/mail.module";
import { Otp, OtpSchema } from "./entities/otp.entity";
import { ShopkeepersModule } from "../shopkeepers/shopkeepers.module";
import { OrganizersModule } from "../organizers/organizers.module";
import { AgentsModule } from "../agents/agents.module";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Otp.name, schema: OtpSchema }]),
    JwtModule.register({}),
    MailModule,
    forwardRef(() => ShopkeepersModule),
    forwardRef(() => OrganizersModule),
    forwardRef(() => AgentsModule),
  ],
  controllers: [OtpController],
  providers: [OtpService],
  exports: [OtpService, MongooseModule],
})
export class OtpModule {}
