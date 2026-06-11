import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class CreateAppFeedbackDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @IsEmail()
  emailId: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  description: string;
}
