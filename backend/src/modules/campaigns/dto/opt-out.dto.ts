import { IsBoolean } from "class-validator";

/** The CRM's "Marketing messages" switch for one customer. `true` means the
 * customer is NOT to be sent campaigns. */
export class SetOptOutDto {
  @IsBoolean()
  optedOut: boolean;
}
