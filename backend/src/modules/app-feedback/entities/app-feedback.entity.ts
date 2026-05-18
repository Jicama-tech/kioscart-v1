import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type AppFeedbackDocument = AppFeedback & Document;

@Schema({ timestamps: true, collection: "appfeedbacks" })
export class AppFeedback {
  // Multi-tenant partition key. Always set server-side to APP_NAME — never
  // accepted from client input — so feedback for one app cannot leak across
  // others sharing this database.
  @Prop({ required: true, index: true })
  appName: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  emailId: string;

  @Prop({ required: true })
  description: string;

  // Public path under /uploads/app-feedback/<filename>.
  @Prop({ required: true })
  image: string;

  // Super-admin toggles this to publish a card into the landing-page carousel.
  // Submissions default to false so nothing reaches visitors un-reviewed.
  @Prop({ default: false, index: true })
  showOnMainPage: boolean;

  @Prop({
    enum: ["new", "approved", "archived"],
    default: "new",
  })
  status: string;
}

export const AppFeedbackSchema = SchemaFactory.createForClass(AppFeedback);

// Both indexed queries the app actually runs:
//   public carousel:  { appName, showOnMainPage } sort createdAt desc
//   admin table:      { appName } sort createdAt desc
AppFeedbackSchema.index({ appName: 1, showOnMainPage: 1, createdAt: -1 });
AppFeedbackSchema.index({ appName: 1, createdAt: -1 });
