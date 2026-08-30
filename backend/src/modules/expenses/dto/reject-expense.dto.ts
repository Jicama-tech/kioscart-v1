import { IsNotEmpty, IsString } from "class-validator";

export class RejectExpenseDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
