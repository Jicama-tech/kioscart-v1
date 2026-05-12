import { IsBoolean, IsNotEmpty, IsString, Matches } from "class-validator";

export class SaveDirectKeysDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^rzp_(test|live)_[A-Za-z0-9]+$/, {
    message: "keyId must start with rzp_test_ or rzp_live_",
  })
  keyId: string;

  @IsString()
  @IsNotEmpty()
  keySecret: string;
}

export class ToggleDirectDto {
  @IsBoolean()
  enabled: boolean;
}
