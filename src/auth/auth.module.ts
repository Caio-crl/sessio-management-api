import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../sessions/entities/session.entity';
import { SessionsModule } from '../sessions/sessions.module';
import { User } from '../users/entities/user.entity';
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_TTL_SECONDS,
  getAccessTokenConfig,
} from './access-token.config';
import { AccessJwtGuard } from './access-jwt.guard';
import { AccessJwtStrategy } from './access-jwt.strategy';
import { AUTH_THROTTLE } from './auth-throttle.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const { secret, issuer, audience } = getAccessTokenConfig();

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session]),
    SessionsModule,
    PassportModule,
    ThrottlerModule.forRoot([AUTH_THROTTLE]),
    JwtModule.register({
      secret,
      signOptions: {
        algorithm: ACCESS_TOKEN_ALGORITHM,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer,
        audience,
      },
      verifyOptions: {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        issuer,
        audience,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessJwtStrategy, AccessJwtGuard, ThrottlerGuard],
})
export class AuthModule {}
