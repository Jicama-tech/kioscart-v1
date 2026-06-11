import { IsEnum, IsOptional } from "class-validator";
import { SupportStatus } from "../entities/support-ticket.entity";

export class UpdateSupportTicketDto {
  // Admin moves a ticket through its lifecycle: open → in_progress → resolved.
  @IsOptional()
  @IsEnum(["open", "in_progress", "resolved"])
  status?: SupportStatus;
}
