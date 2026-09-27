import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { argon2id, hash, HashOptions, verify } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { Session } from '../sessions/entities/session.entity';
import { User } from '../users/entities/user.entity';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
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
      const refreshTokenHash = createHash('sha256')
        .update(secret, 'utf8')
        .digest('hex');

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

      return { refreshToken: `${sessionId}.${secret}` };
    } catch {
      throw new InternalServerErrorException('Could not complete login');
    }
  }
}
