import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { AppFeedbackController } from "./app-feedback.controller";
import { AppFeedbackService } from "./app-feedback.service";
import {
  AppFeedback,
  AppFeedbackSchema,
} from "./entities/app-feedback.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppFeedback.name, schema: AppFeedbackSchema },
    ]),
    AuthModule,
  ],
  controllers: [AppFeedbackController],
  providers: [AppFeedbackService],
})
export class AppFeedbackModule {}
