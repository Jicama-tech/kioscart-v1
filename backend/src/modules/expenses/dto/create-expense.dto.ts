import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { EXPENSE_CATEGORIES } from "../schemas/expense.schema";

export class CreateExpenseDto {
  @IsOptional()
  @IsMongoId()
  event?: string;

  @IsEnum(EXPENSE_CATEGORIES)
  category: string;

  @IsString()
  @IsNotEmpty()
  partyName: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  expenseDate: string;
}
