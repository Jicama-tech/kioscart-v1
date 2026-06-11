import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { SupportCategory } from "../entities/support-ticket.entity";

export class CreateSupportTicketDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsEnum(["bug", "feature_request", "general", "billing", "other"])
  category?: SupportCategory;

  // Frontend sends the body text under `description`; it maps to `comment`.
  @IsString()
  @IsNotEmpty()
  description: string;
}
