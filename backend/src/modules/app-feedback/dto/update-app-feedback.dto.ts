import { IsBoolean, IsEnum, IsOptional } from "class-validator";

export class UpdateAppFeedbackDto {
  @IsOptional()
  @IsBoolean()
  showOnMainPage?: boolean;

  @IsOptional()
  @IsEnum(["new", "approved", "archived"])
  status?: string;
}
