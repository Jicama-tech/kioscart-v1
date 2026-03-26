import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";

@Injectable()
export class GoogleShopkeeperStrategy extends PassportStrategy(
  Strategy,
  "google-shopkeeper" // ← DIFFERENT NAME!
) {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL:
        process.env.GOOGLE_SHOPKEEPER_REDIRECT_URI ||
        `${process.env.BACKEND_URL || "http://localhost:3000"}/auth/google-shopkeeper/redirect`,
      scope: ["email", "profile"],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback
  ): Promise<any> {
    const user = {
      oauthProvider: "google",
      oauthId: profile.id,
      email: profile.emails?.[0]?.value,
      name: profile.displayName,
      password: "oauth-" + profile.id,
    };
    done(null, user);
  }
}
