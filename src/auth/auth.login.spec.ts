import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash } from 'argon2';
import { Repository } from 'typeorm';
import { Session } from '../sessions/entities/session.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

describe('AuthService login', () => {
  const password = 'correct horse battery staple';
  const jwtService = new JwtService({
    secret: 'test-only-access-secret-with-at-least-32-characters',
    signOptions: {
      algorithm: 'HS256',
      expiresIn: 600,
      issuer: 'test-issuer',
      audience: 'test-audience',
    },
  });
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await hash(password, {
      type: argon2id,
      memoryCost: 64 * 1024,
      timeCost: 3,
      parallelism: 1,
    });
  });

  function createService(userExists: boolean) {
    const user = userExists
      ? ({
          id: '47cf84d4-159a-45db-a8a2-1f31fc9c576b',
          email: 'user+tag@example.com',
          passwordHash,
        } as User)
      : null;
    const getOne = jest.fn().mockResolvedValue(user);
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne,
    };
    const createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);
    const insert = jest.fn().mockResolvedValue({});
    const service = new AuthService(
      { createQueryBuilder } as unknown as Repository<User>,
      { insert } as unknown as Repository<Session>,
      jwtService,
    );

    return { service, createQueryBuilder, queryBuilder, insert };
  }

  it('selects the password hash and creates a new, fully initialized session', async () => {
    const { service, createQueryBuilder, queryBuilder, insert } =
      createService(true);
    const before = Date.now();

    const first = await service.login({
      email: '  User+tag@Example.COM  ',
      password,
    });

    const after = Date.now();
    expect(createQueryBuilder).toHaveBeenCalledWith('user');
    expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
    expect(queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
      email: 'user+tag@example.com',
    });
    expect(insert).toHaveBeenCalledTimes(1);

    const session = insert.mock.calls[0][0] as Partial<Session>;
    const [sessionId, secret] = first.refreshToken.split('.');
    expect(first.refreshToken).toBe(`${sessionId}.${secret}`);
    const payload = jwtService.verify<Record<string, unknown>>(
      first.accessToken,
      {
        algorithms: ['HS256'],
        issuer: 'test-issuer',
        audience: 'test-audience',
      },
    );
    expect(payload.sub).toBe('47cf84d4-159a-45db-a8a2-1f31fc9c576b');
    expect(payload.sid).toBe(sessionId);
    expect(payload.iss).toBe('test-issuer');
    expect(payload.aud).toBe('test-audience');
    expect(payload.exp).toBe((payload.iat as number) + 600);
    expect(Object.keys(payload).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'sid',
      'sub',
    ]);
    expect(sessionId).toBe(session.id);
    expect(sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(secret, 'base64url')).toHaveLength(32);
    expect(session.refreshTokenHash).toBe(
      createHash('sha256').update(secret, 'utf8').digest('hex'),
    );
    expect(session.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session).not.toHaveProperty('secret');
    expect(session).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(session)).not.toContain(secret);
    expect(session.userId).toBe('47cf84d4-159a-45db-a8a2-1f31fc9c576b');
    expect(session.previousRefreshTokenHash).toBeNull();
    expect(session.revokedAt).toBeNull();
    expect(session.createdAt).toEqual(session.lastUsedAt);
    expect(session.createdAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(session.createdAt?.getTime()).toBeLessThanOrEqual(after);
    expect(session.expiresAt?.getTime()).toBe(
      (session.createdAt as Date).getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const second = await service.login({
      email: 'user+tag@example.com',
      password,
    });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(insert.mock.calls[1][0].id).not.toBe(session.id);
  });

  it('returns the same generic 401 for a wrong password and a missing user', async () => {
    const existing = createService(true);
    const missing = createService(false);
    const credentials = { email: 'user+tag@example.com', password: 'wrong' };
    const expected = {
      status: 401,
      response: { message: 'Invalid credentials' },
    };

    await expect(existing.service.login(credentials)).rejects.toMatchObject(
      expected,
    );
    await expect(missing.service.login(credentials)).rejects.toMatchObject(
      expected,
    );
    expect(existing.insert).not.toHaveBeenCalled();
    expect(missing.insert).not.toHaveBeenCalled();
  });

  it('returns a generic 500 without a token if session persistence fails', async () => {
    const { service, insert } = createService(true);
    insert.mockRejectedValueOnce(new Error('database details'));

    await expect(
      service.login({ email: 'user+tag@example.com', password }),
    ).rejects.toMatchObject({
      status: 500,
      response: { message: 'Could not complete login' },
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
