import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback } from "passport-google-oauth20";

/**
 * Google login for the public supplier quotation form (ported from
 * eventsh-v1's "google-member" flow). Verifies the supplier's Gmail without
 * creating any account — the backend redirect just hands the verified
 * email/name back to the popup, which the frontend then uses to look up or
 * create the Supplier identity via the ordinary /suppliers endpoints.
 */
@Injectable()
export class GoogleSupplierStrategy extends PassportStrategy(
  Strategy,
  "google-supplier",
) {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL:
        process.env.GOOGLE_SUPPLIER_REDIRECT_URI ||
        `${process.env.BACKEND_URL || "http://localhost:3000"}/auth/google-supplier/redirect`,
      scope: ["email", "profile"],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const user = {
      email: profile.emails?.[0]?.value,
      name: profile.displayName,
      picture: profile.photos?.[0]?.value || "",
    };
    done(null, user);
  }
}
