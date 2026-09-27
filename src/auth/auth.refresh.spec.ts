import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { EntityManager, Repository } from 'typeorm';
import { Session } from '../sessions/entities/session.entity';
import { SessionsService } from '../sessions/sessions.service';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

describe('AuthService refresh', () => {
  const sessionId = 'e51a935b-df41-45e0-b7b2-a915cb66456b';
  const userId = '47cf84d4-159a-45db-a8a2-1f31fc9c576b';
  const secret = Buffer.alloc(32, 7).toString('base64url');
  const refreshToken = `${sessionId}.${secret}`;
  const hashSecret = (value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex');
  const jwtService = new JwtService({
    secret: 'test-only-access-secret-with-at-least-32-characters',
    signOptions: {
      algorithm: 'HS256',
      expiresIn: 600,
      issuer: 'test-issuer',
      audience: 'test-audience',
    },
  });

  function createService() {
    const createdAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const session = {
      id: sessionId,
      userId,
      refreshTokenHash: hashSecret(secret),
      previousRefreshTokenHash: null as string | null,
      createdAt,
      lastUsedAt: createdAt,
      expiresAt,
      revokedAt: null as Date | null,
    };
    const query = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => session as Session | null),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
      update: jest.fn(async (_id: string, changes: Partial<Session>) => {
        Object.assign(session, changes);
        return { affected: 1 };
      }),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(repository) };
    const transaction = jest.fn(
      async (work: (manager: EntityManager) => Promise<unknown>) =>
        work(manager as unknown as EntityManager),
    );
    const insert = jest.fn();
    const service = new AuthService(
      {} as Repository<User>,
      { manager: { transaction }, insert } as unknown as Repository<Session>,
      jwtService,
    );

    return {
      service,
      session,
      query,
      repository,
      manager,
      transaction,
      insert,
    };
  }

  const invalid = {
    status: 401,
    response: { message: 'Invalid refresh token' },
  };

  it('rotates the current token without extending the session', async () => {
    const {
      service,
      session,
      query,
      repository,
      manager,
      transaction,
      insert,
    } = createService();
    const originalHash = session.refreshTokenHash;
    const originalExpiry = session.expiresAt;
    const originalLastUsed = session.lastUsedAt;
    const before = Date.now();

    const response = await service.refresh({ refreshToken });

    const after = Date.now();
    const [returnedSessionId, newSecret] = response.refreshToken.split('.');
    expect(returnedSessionId).toBe(sessionId);
    expect(newSecret).not.toBe(secret);
    expect(Buffer.from(newSecret, 'base64url')).toHaveLength(32);
    expect(session.refreshTokenHash).toBe(hashSecret(newSecret));
    expect(session.previousRefreshTokenHash).toBe(originalHash);
    expect(session.lastUsedAt).not.toBe(originalLastUsed);
    expect(session.lastUsedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(session.lastUsedAt.getTime()).toBeLessThanOrEqual(after);
    expect(session.expiresAt).toBe(originalExpiry);
    expect(session.expiresAt.getTime()).toBe(
      session.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    expect(session.revokedAt).toBeNull();
    expect(JSON.stringify(session)).not.toContain(newSecret);
    expect(response).toEqual({
      accessToken: expect.any(String),
      refreshToken: `${sessionId}.${newSecret}`,
    });
    const payload = jwtService.verify<Record<string, unknown>>(
      response.accessToken,
      {
        algorithms: ['HS256'],
        issuer: 'test-issuer',
        audience: 'test-audience',
      },
    );
    expect(payload.sub).toBe(userId);
    expect(payload.sid).toBe(sessionId);
    expect(Object.keys(payload).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'sid',
      'sub',
    ]);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.getRepository).toHaveBeenCalledWith(Session);
    expect(query.addSelect).toHaveBeenCalledWith('session.refreshTokenHash');
    expect(query.addSelect).toHaveBeenCalledWith(
      'session.previousRefreshTokenHash',
    );
    expect(query.where).toHaveBeenCalledWith('session.id = :sessionId', {
      sessionId,
    });
    expect(query.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(repository.update).toHaveBeenCalledWith(sessionId, {
      previousRefreshTokenHash: originalHash,
      refreshTokenHash: hashSecret(newSecret),
      lastUsedAt: expect.any(Date),
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('revokes the session when the immediately previous token is reused', async () => {
    const { service, session, repository } = createService();
    const rotated = await service.refresh({ refreshToken });

    await expect(service.refresh({ refreshToken })).rejects.toMatchObject(
      invalid,
    );
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(repository.update).toHaveBeenLastCalledWith(sessionId, {
      revokedAt: expect.any(Date),
    });
    await expect(
      service.refresh({ refreshToken: rotated.refreshToken }),
    ).rejects.toMatchObject(invalid);
  });

  it('rejects an unknown secret without revoking the session', async () => {
    const { service, session, repository } = createService();
    const unknown = Buffer.alloc(32, 9).toString('base64url');

    await expect(
      service.refresh({ refreshToken: `${sessionId}.${unknown}` }),
    ).rejects.toMatchObject(invalid);
    expect(session.revokedAt).toBeNull();
    expect(repository.update).not.toHaveBeenCalled();
    await expect(service.refresh({ refreshToken })).resolves.toHaveProperty(
      'accessToken',
    );
  });

  it('remembers only the immediately previous token', async () => {
    const { service, session, repository } = createService();
    const second = await service.refresh({ refreshToken });
    await service.refresh({ refreshToken: second.refreshToken });

    await expect(service.refresh({ refreshToken })).rejects.toMatchObject(
      invalid,
    );
    expect(session.revokedAt).toBeNull();
    expect(repository.update).toHaveBeenCalledTimes(2);
    await expect(
      service.refresh({ refreshToken: second.refreshToken }),
    ).rejects.toMatchObject(invalid);
    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  it('rejects missing, expired and revoked sessions with the same response', async () => {
    const missing = createService();
    missing.query.getOne.mockResolvedValueOnce(null);
    await expect(
      missing.service.refresh({ refreshToken }),
    ).rejects.toMatchObject(invalid);

    const expired = createService();
    expired.session.expiresAt = new Date(Date.now() - 1);
    await expect(
      expired.service.refresh({ refreshToken }),
    ).rejects.toMatchObject(invalid);

    const revoked = createService();
    revoked.session.revokedAt = new Date();
    await expect(
      revoked.service.refresh({ refreshToken }),
    ).rejects.toMatchObject(invalid);
    expect(missing.repository.update).not.toHaveBeenCalled();
    expect(expired.repository.update).not.toHaveBeenCalled();
    expect(revoked.repository.update).not.toHaveBeenCalled();
  });

  it('rejects refresh after the current session is logged out', async () => {
    const { service, session, repository } = createService();
    const sessionsService = new SessionsService(
      repository as unknown as Repository<Session>,
    );

    await sessionsService.revokeCurrent(userId, sessionId);

    expect(session.revokedAt).toBeInstanceOf(Date);
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject(
      invalid,
    );
  });

  it.each([
    'invalid',
    `${sessionId}.`,
    `${sessionId}.${secret}.extra`,
    `not-a-uuid.${secret}`,
    `${sessionId}.${secret.slice(0, -1)}!`,
    `${sessionId}.${secret.slice(0, -1)}d`,
  ])(
    'rejects a malformed token without opening a transaction',
    async (token) => {
      const { service, transaction } = createService();
      await expect(
        service.refresh({ refreshToken: token }),
      ).rejects.toMatchObject(invalid);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('hides unexpected persistence errors', async () => {
    const { service, repository } = createService();
    repository.update.mockRejectedValueOnce(new Error('database details'));

    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      status: 500,
      response: { message: 'Could not complete refresh' },
    });
  });

  it('does not return tokens when the locked update affects no row', async () => {
    const { service, repository } = createService();
    repository.update.mockResolvedValueOnce({ affected: 0 });

    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      status: 500,
      response: { message: 'Could not complete refresh' },
    });
  });
});
