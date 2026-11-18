import { jwtSecret } from '../jwt-secret';
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService } from "../auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret(),
    });
  }

  /** iat is forwarded so tokens issued before the last password change are rejected. */
  async validate(payload: any) {
    return this.authService.validateJwtUser(payload.sub, payload.iat);
  }
}
