import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { isUUID } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  ACCESS_TOKEN_ALGORITHM,
  getAccessTokenConfig,
} from './access-token.config';

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
}

@Injectable()
export class AccessJwtStrategy extends PassportStrategy(
  Strategy,
  'access-jwt',
) {
  constructor() {
    const { secret, issuer, audience } = getAccessTokenConfig();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret,
      issuer,
      audience,
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      ignoreExpiration: false,
    });
  }

  validate(payload: Record<string, unknown>): AuthenticatedUser {
    if (
      typeof payload?.sub !== 'string' ||
      !isUUID(payload.sub) ||
      typeof payload.sid !== 'string' ||
      !isUUID(payload.sid) ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp)
    ) {
      throw new UnauthorizedException();
    }

    return { userId: payload.sub, sessionId: payload.sid };
  }
}
