import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { AppFeedbackController } from "./app-feedback.controller";
import { AppFeedbackService } from "./app-feedback.service";
import {
  AppFeedback,
  AppFeedbackSchema,
} from "./entities/app-feedback.entity";
import {
  SupportTicket,
  SupportTicketSchema,
} from "./entities/support-ticket.entity";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppFeedback.name, schema: AppFeedbackSchema },
      { name: SupportTicket.name, schema: SupportTicketSchema },
    ]),
    AuthModule,
  ],
  controllers: [AppFeedbackController],
  providers: [AppFeedbackService],
})
export class AppFeedbackModule {}
