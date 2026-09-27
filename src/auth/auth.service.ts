import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash, HashOptions, verify } from 'argon2';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { isUUID } from 'class-validator';
import { QueryFailedError, Repository } from 'typeorm';
import { Session } from '../sessions/entities/session.entity';
import { User } from '../users/entities/user.entity';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { RegisterDto } from './dto/register.dto';
import { normalizeEmail } from './normalize-email';

const PASSWORD_HASH_OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
};

// Synthetic Argon2id hash for the missing-user path; no real credential is involved.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=1,t=3$xxkEHNajue/0t9A7r6MIRw$oG6c33bfQG20rOLg9Njwqt0LXvERhGf8mXmeL1q9h3A';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_REFRESH_TOKEN = 'Invalid refresh token';

function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function parseRefreshToken(
  token: string,
): { sessionId: string; secret: string } | null {
  if (token.length !== 80) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [sessionId, secret] = parts;
  if (!isUUID(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    return null;
  }

  const decoded = Buffer.from(secret, 'base64url');
  if (decoded.length !== 32 || decoded.toString('base64url') !== secret) {
    return null;
  }

  return { sessionId, secret };
}

function hashesEqual(
  storedHash: string | null,
  presentedHash: string,
): boolean {
  if (!storedHash || !/^[0-9a-f]{64}$/i.test(storedHash)) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(storedHash, 'hex'),
    Buffer.from(presentedHash, 'hex'),
  );
}

function isDuplicateEntry(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError: unknown = error.driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === 'ER_DUP_ENTRY'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterDto): Promise<RegisterResponseDto> {
    const email = normalizeEmail(input.email);
    let passwordHash: string;

    try {
      passwordHash = await hash(input.password, PASSWORD_HASH_OPTIONS);
    } catch {
      throw new InternalServerErrorException('Could not complete registration');
    }

    try {
      const user = await this.users.save({ email, passwordHash });
      return { id: user.id, email: user.email, createdAt: user.createdAt };
    } catch (error: unknown) {
      if (isDuplicateEntry(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException('Could not complete registration');
    }
  }

  async login(input: LoginDto): Promise<LoginResponseDto> {
    const email = normalizeEmail(input.email);
    let user: User | null;

    try {
      user = await this.users
        .createQueryBuilder('user')
        .addSelect('user.passwordHash')
        .where('user.email = :email', { email })
        .getOne();
    } catch {
      throw new InternalServerErrorException('Could not complete login');
    }

    let passwordMatches: boolean;
    try {
      passwordMatches = await verify(
        user?.passwordHash ?? DUMMY_PASSWORD_HASH,
        input.password,
      );
    } catch {
      throw new InternalServerErrorException('Could not complete login');
    }

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      const now = new Date();
      const sessionId = randomUUID();
      const secret = randomBytes(32).toString('base64url');
      // Hash the transported base64url text; refresh validation must do the same.
      const refreshTokenHash = hashRefreshSecret(secret);

      await this.sessions.insert({
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        previousRefreshTokenHash: null,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        revokedAt: null,
      });

      const accessToken = await this.jwtService.signAsync({
        sub: user.id,
        sid: sessionId,
      });
      return { accessToken, refreshToken: `${sessionId}.${secret}` };
    } catch {
      throw new InternalServerErrorException('Could not complete login');
    }
  }

  async refresh(input: RefreshDto): Promise<LoginResponseDto> {
    const parsed = parseRefreshToken(input.refreshToken);
    if (!parsed) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    const presentedHash = hashRefreshSecret(parsed.secret);

    try {
      const result = await this.sessions.manager.transaction(
        async (manager) => {
          const repository = manager.getRepository(Session);
          // Lock the current row so a competing refresh reads the committed rotation.
          const session = await repository
            .createQueryBuilder('session')
            .addSelect('session.refreshTokenHash')
            .addSelect('session.previousRefreshTokenHash')
            .where('session.id = :sessionId', { sessionId: parsed.sessionId })
            .setLock('pessimistic_write')
            .getOne();

          if (
            !session ||
            session.revokedAt !== null ||
            session.expiresAt.getTime() <= Date.now()
          ) {
            return null;
          }

          if (hashesEqual(session.refreshTokenHash, presentedHash)) {
            const now = new Date();
            const newSecret = randomBytes(32).toString('base64url');
            const newHash = hashRefreshSecret(newSecret);
            const accessToken = await this.jwtService.signAsync({
              sub: session.userId,
              sid: session.id,
            });
            const update = await repository.update(session.id, {
              previousRefreshTokenHash: session.refreshTokenHash,
              refreshTokenHash: newHash,
              lastUsedAt: now,
            });
            if (update.affected !== 1) {
              throw new Error('Session rotation failed');
            }

            return {
              accessToken,
              refreshToken: `${session.id}.${newSecret}`,
            };
          }

          if (hashesEqual(session.previousRefreshTokenHash, presentedHash)) {
            const update = await repository.update(session.id, {
              revokedAt: new Date(),
            });
            if (update.affected !== 1) {
              throw new Error('Session revocation failed');
            }
          }

          return null;
        },
      );

      if (!result) {
        throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
      }

      return result;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Could not complete refresh');
    }
  }
}
