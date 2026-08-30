import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, ExtractJwt } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret",
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      name: payload.name,
      email: payload.email,
      roles: payload.roles,
      // Present only on operator-minted tokens (see auth.controller
      // mintShopkeeperToken) — userId/sub above is the parent owner's id.
      operatorId: payload.operatorId,
      accessTabs: payload.accessTabs,
    };
  }
}
