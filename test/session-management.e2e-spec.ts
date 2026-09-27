import { createHash, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { Session } from '../src/sessions/entities/session.entity';
import { User } from '../src/users/entities/user.entity';

type LoginTokens = { accessToken: string; refreshToken: string };
type ColumnInfo = {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
};
type IndexInfo = {
  TABLE_NAME: string;
  INDEX_NAME: string;
  COLUMN_NAME: string;
  NON_UNIQUE: string;
};

describe('Session Management API with local MySQL', () => {
  const password = 'E2E-only-passphrase-123';
  const email = 'e2e@example.com';
  let app: INestApplication;
  let dataSource: DataSource;
  let users: Repository<User>;
  let sessions: Repository<Session>;

  async function register(address = email): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: address, password })
      .expect(201);
    return (response.body as { id: string }).id;
  }

  async function login(address = email): Promise<LoginTokens> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: address, password })
      .expect(200);
    return response.body as LoginTokens;
  }

  function refresh(token: string) {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: token });
  }

  async function storedSession(id: string): Promise<Session | null> {
    return sessions
      .createQueryBuilder('session')
      .addSelect('session.refreshTokenHash')
      .addSelect('session.previousRefreshTokenHash')
      .where('session.id = :id', { id })
      .getOne();
  }

  function sessionId(token: string): string {
    return token.split('.')[0];
  }

  function secretHash(token: string): string {
    return createHash('sha256')
      .update(token.split('.')[1], 'utf8')
      .digest('hex');
  }

  async function clearTestData(): Promise<void> {
    await dataSource.query('DELETE FROM sessions');
    await dataSource.query('DELETE FROM users');
  }

  beforeAll(async () => {
    if (
      !['127.0.0.1', 'localhost'].includes(process.env.DB_HOST ?? '') ||
      process.env.DB_NAME !== 'session_management_e2e'
    ) {
      throw new Error(
        'E2E requires a local MySQL host and DB_NAME=session_management_e2e',
      );
    }

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
    dataSource = app.get(DataSource);
    users = dataSource.getRepository(User);
    sessions = dataSource.getRepository(Session);
    expect(dataSource.options.synchronize).toBe(false);
  });

  beforeEach(clearTestData);
  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await clearTestData();
    }
    await app?.close();
  });

  it('has the migrated columns, primary keys, indexes and restrictive foreign key', async () => {
    const columns = (await dataSource.query(
      "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users', 'sessions')",
    )) as ColumnInfo[];
    const column = (table: string, name: string) =>
      columns.find(
        (entry) => entry.TABLE_NAME === table && entry.COLUMN_NAME === name,
      );

    expect(column('users', 'id')).toMatchObject({
      COLUMN_TYPE: 'varchar(36)',
      IS_NULLABLE: 'NO',
    });
    expect(column('users', 'email')).toMatchObject({
      COLUMN_TYPE: 'varchar(254)',
      IS_NULLABLE: 'NO',
    });
    expect(column('users', 'password_hash')).toMatchObject({
      COLUMN_TYPE: 'varchar(255)',
      IS_NULLABLE: 'NO',
    });
    expect(column('sessions', 'id')).toMatchObject({
      COLUMN_TYPE: 'varchar(36)',
      IS_NULLABLE: 'NO',
    });
    expect(column('sessions', 'user_id')).toMatchObject({
      COLUMN_TYPE: 'varchar(36)',
      IS_NULLABLE: 'NO',
    });
    expect(column('sessions', 'refresh_token_hash')).toMatchObject({
      COLUMN_TYPE: 'char(64)',
      IS_NULLABLE: 'NO',
    });
    expect(column('sessions', 'previous_refresh_token_hash')).toMatchObject({
      COLUMN_TYPE: 'char(64)',
      IS_NULLABLE: 'YES',
    });
    expect(column('sessions', 'revoked_at')?.IS_NULLABLE).toBe('YES');
    for (const name of [
      'created_at',
      'last_used_at',
      'expires_at',
      'revoked_at',
    ]) {
      expect(column('sessions', name)?.COLUMN_TYPE).toBe('datetime(6)');
      expect(column('sessions', name)?.IS_NULLABLE).toBe(
        name === 'revoked_at' ? 'YES' : 'NO',
      );
    }
    expect(column('users', 'created_at')?.COLUMN_TYPE).toBe('datetime(6)');
    expect(column('users', 'created_at')?.IS_NULLABLE).toBe('NO');
    expect(column('users', 'updated_at')?.COLUMN_TYPE).toBe('datetime(6)');
    expect(column('users', 'updated_at')?.IS_NULLABLE).toBe('NO');

    const indexes = (await dataSource.query(
      "SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users', 'sessions')",
    )) as IndexInfo[];
    for (const [table, name, field, nonUnique] of [
      ['users', 'PRIMARY', 'id', 0],
      ['users', 'UQ_users_email', 'email', 0],
      ['sessions', 'PRIMARY', 'id', 0],
      ['sessions', 'IDX_sessions_user_id', 'user_id', 1],
    ] as const) {
      expect(indexes).toContainEqual({
        TABLE_NAME: table,
        INDEX_NAME: name,
        COLUMN_NAME: field,
        NON_UNIQUE: String(nonUnique),
      });
    }

    const foreignKeys = (await dataSource.query(
      "SELECT k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = 'sessions' AND k.CONSTRAINT_NAME = 'FK_sessions_user_id'",
    )) as Array<{
      COLUMN_NAME: string;
      REFERENCED_TABLE_NAME: string;
      REFERENCED_COLUMN_NAME: string;
      DELETE_RULE: string;
    }>;
    expect(foreignKeys).toEqual([
      {
        COLUMN_NAME: 'user_id',
        REFERENCED_TABLE_NAME: 'users',
        REFERENCED_COLUMN_NAME: 'id',
        DELETE_RULE: 'RESTRICT',
      },
    ]);
  });

  it('registers a normalized email and maps the real unique violation to 409', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: '  E2E@Example.com  ', password })
      .expect(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      email,
      createdAt: expect.any(String),
    });
    expect(Object.keys(response.body)).toEqual(['id', 'email', 'createdAt']);

    const user = await users.findOneByOrFail({
      id: response.body.id as string,
    });
    expect(user.email).toBe(email);
    expect('passwordHash' in user).toBe(false);
    const withHash = await users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: user.id })
      .getOneOrFail();
    expect(withHash.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(withHash.passwordHash === password).toBe(false);

    const duplicate = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email.toUpperCase(), password })
      .expect(409);
    expect(duplicate.body.message).toBe('Email is already registered');
    expect(await users.countBy({ email })).toBe(1);
  });

  it('logs in with real credentials, creates independent sessions and accepts the access JWT', async () => {
    const userId = await register();
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'incorrect' })
      .expect(401);
    const first = await login(email.toUpperCase());
    const second = await login();
    expect(Object.keys(first).sort()).toEqual(['accessToken', 'refreshToken']);
    expect(typeof first.accessToken).toBe('string');
    expect(typeof first.refreshToken).toBe('string');
    expect(
      sessionId(first.refreshToken) === sessionId(second.refreshToken),
    ).toBe(false);
    expect(await sessions.countBy({ userId })).toBe(2);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .auth(second.accessToken, { type: 'bearer' })
      .expect(200);
    expect(me.body).toEqual({
      userId,
      sessionId: sessionId(second.refreshToken),
    });
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rotates the real stored hash while preserving the session and absolute expiry', async () => {
    const userId = await register();
    const initial = await login();
    const id = sessionId(initial.refreshToken);
    const before = await storedSession(id);
    expect(before).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 15));

    const response = await refresh(initial.refreshToken).expect(200);
    const next = response.body as LoginTokens;
    const after = await storedSession(id);
    expect(after).not.toBeNull();
    expect(sessionId(next.refreshToken)).toBe(id);
    expect(next.refreshToken === initial.refreshToken).toBe(false);
    expect(after!.refreshTokenHash).toBe(secretHash(next.refreshToken));
    expect(after!.previousRefreshTokenHash).toBe(before!.refreshTokenHash);
    expect(after!.refreshTokenHash === before!.refreshTokenHash).toBe(false);
    expect(after!.lastUsedAt.getTime()).toBeGreaterThan(
      before!.lastUsedAt.getTime(),
    );
    expect(after!.expiresAt.getTime()).toBe(before!.expiresAt.getTime());
    expect(await sessions.countBy({ userId })).toBe(1);
    expect(Object.keys(next).sort()).toEqual(['accessToken', 'refreshToken']);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(next.accessToken, { type: 'bearer' })
      .expect(200);
  });

  it('commits reuse revocation before returning 401', async () => {
    await register();
    const initial = await login();
    const rotated = await refresh(initial.refreshToken).expect(200);
    const next = rotated.body as LoginTokens;
    await refresh(initial.refreshToken).expect(401);
    const stored = await storedSession(sessionId(initial.refreshToken));
    expect(stored?.revokedAt).toBeInstanceOf(Date);
    await refresh(next.refreshToken).expect(401);
  });

  it('serializes two real concurrent refresh requests for the same token', async () => {
    await register();
    const initial = await login();
    const [first, second] = await Promise.all([
      refresh(initial.refreshToken),
      refresh(initial.refreshToken),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 401]);
    const stored = await storedSession(sessionId(initial.refreshToken));
    expect(stored?.previousRefreshTokenHash).toBe(
      secretHash(initial.refreshToken),
    );
    expect(stored?.revokedAt).toBeInstanceOf(Date);
    const winner = (first.status === 200 ? first : second).body as LoginTokens;
    await refresh(winner.refreshToken).expect(401);
  });

  it('logs out only the current session, persists revocation and remains idempotent', async () => {
    const userId = await register();
    const first = await login();
    const second = await login();
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(204);
    const revoked = await storedSession(sessionId(first.refreshToken));
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
    await refresh(first.refreshToken).expect(401);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(first.accessToken, { type: 'bearer' })
      .expect(204);
    expect(await sessions.countBy({ userId })).toBe(2);
    expect(
      (await storedSession(sessionId(second.refreshToken)))?.revokedAt,
    ).toBe(null);
  });

  it('lists only active owned sessions in order and marks the current one', async () => {
    await register();
    const first = await login();
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await login();
    await new Promise((resolve) => setTimeout(resolve, 15));
    const third = await login();
    await register('another@example.com');
    await login('another@example.com');
    const token = third.accessToken;
    const list = await request(app.getHttpServer())
      .get('/sessions')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(list.body.map((item: { id: string }) => item.id)).toEqual([
      sessionId(third.refreshToken),
      sessionId(second.refreshToken),
      sessionId(first.refreshToken),
    ]);
    expect(list.body.map((item: { current: boolean }) => item.current)).toEqual(
      [true, false, false],
    );
    for (const item of list.body as Array<Record<string, unknown>>) {
      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'current',
        'expiresAt',
        'id',
        'lastUsedAt',
      ]);
    }

    await request(app.getHttpServer())
      .delete(`/sessions/${sessionId(second.refreshToken)}`)
      .auth(token, { type: 'bearer' })
      .expect(204);
    const remaining = await request(app.getHttpServer())
      .get('/sessions')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(remaining.body.map((item: { id: string }) => item.id)).toEqual([
      sessionId(third.refreshToken),
      sessionId(first.refreshToken),
    ]);
    await refresh(second.refreshToken).expect(401);

    await sessions.update(sessionId(first.refreshToken), {
      expiresAt: new Date(Date.now() - 1000),
    });
    const active = await request(app.getHttpServer())
      .get('/sessions')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(active.body.map((item: { id: string }) => item.id)).toEqual([
      sessionId(third.refreshToken),
    ]);
  });

  it('hides foreign session ownership and never revokes another user session', async () => {
    await register('owner@example.com');
    await register('other@example.com');
    const owner = await login('owner@example.com');
    const other = await login('other@example.com');
    const foreignId = sessionId(other.refreshToken);
    const foreign = await request(app.getHttpServer())
      .delete(`/sessions/${foreignId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(404);
    const missing = await request(app.getHttpServer())
      .delete(`/sessions/${randomUUID()}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(404);
    expect(foreign.body).toEqual(missing.body);
    expect((await storedSession(foreignId))?.revokedAt).toBeNull();
    await request(app.getHttpServer())
      .delete('/sessions/invalid-uuid')
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .delete(`/sessions/${sessionId(owner.refreshToken)}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(204);
    await refresh(owner.refreshToken).expect(401);
  });

  it('prevents direct user deletion while a session exists', async () => {
    const userId = await register();
    await login();
    await expect(users.delete(userId)).rejects.toMatchObject({
      driverError: { code: 'ER_ROW_IS_REFERENCED_2' },
    });
    expect(await users.exist({ where: { id: userId } })).toBe(true);
  });
});
