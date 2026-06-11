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
      passReqToCallback: true,
    });
  }

  // Forward the frontend's ?origin=<domain> through Google as the OAuth
  // `state` param so the redirect handler can send the token back to the same
  // domain (custom domains included), mirroring the buyer strategy.
  authenticate(req: any, options: any) {
    const origin = req.query?.origin || "";
    super.authenticate(req, { ...options, state: origin });
  }

  async validate(
    req: any,
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
