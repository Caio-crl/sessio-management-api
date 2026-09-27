import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { SessionsService } from '../sessions/sessions.service';
import { AccessJwtGuard } from './access-jwt.guard';
import { AccessJwtStrategy } from './access-jwt.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('GET /auth/me', () => {
  const secret = 'test-only-access-secret-with-at-least-32-characters';
  const issuer = 'test-issuer';
  const audience = 'test-audience';
  const userId = '47cf84d4-159a-45db-a8a2-1f31fc9c576b';
  const sessionId = 'e51a935b-df41-45e0-b7b2-a915cb66456b';
  const signer = new JwtService({ secret });
  const claims = { sub: userId, sid: sessionId };
  const signOptions = {
    algorithm: 'HS256' as const,
    expiresIn: 600,
    issuer,
    audience,
  };
  const previousEnv = {
    secret: process.env.JWT_ACCESS_SECRET,
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  };
  let app: INestApplication;
  const revokeCurrent = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    process.env.JWT_ISSUER = issuer;
    process.env.JWT_AUDIENCE = audience;

    // No User or Session repository is registered in this test application.
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
      ],
      controllers: [AuthController],
      providers: [
        AccessJwtGuard,
        AccessJwtStrategy,
        { provide: AuthService, useValue: {} },
        { provide: SessionsService, useValue: { revokeCurrent } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const [name, value] of Object.entries({
      JWT_ACCESS_SECRET: previousEnv.secret,
      JWT_ISSUER: previousEnv.issuer,
      JWT_AUDIENCE: previousEnv.audience,
    })) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('returns userId and sessionId for a valid access JWT', async () => {
    const token = signer.sign(claims, signOptions);

    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(response.body).toEqual({ userId, sessionId });
  });

  it('rejects missing and malformed tokens', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth('not-a-jwt', { type: 'bearer' })
      .expect(401);
  });

  it('logs out only the session identified by the access JWT', async () => {
    revokeCurrent.mockClear();
    const token = signer.sign(claims, signOptions);

    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(token, { type: 'bearer' })
      .send({ sessionId: 'a338b383-325b-4e8f-99ea-ec55828a3791' })
      .expect(204);

    expect(response.text).toBe('');
    expect(revokeCurrent).toHaveBeenCalledTimes(1);
    expect(revokeCurrent).toHaveBeenCalledWith(userId, sessionId);
  });

  it('requires a valid access JWT for logout', async () => {
    revokeCurrent.mockClear();
    await request(app.getHttpServer()).post('/auth/logout').expect(401);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    expect(revokeCurrent).not.toHaveBeenCalled();
  });

  it.each([
    [
      'invalid signature',
      () =>
        new JwtService({ secret: `${secret}-other` }).sign(claims, signOptions),
    ],
    [
      'expired token',
      () => signer.sign(claims, { ...signOptions, expiresIn: -1 }),
    ],
    [
      'wrong issuer',
      () => signer.sign(claims, { ...signOptions, issuer: 'other-issuer' }),
    ],
    [
      'wrong audience',
      () => signer.sign(claims, { ...signOptions, audience: 'other-audience' }),
    ],
    [
      'disallowed algorithm',
      () => signer.sign(claims, { ...signOptions, algorithm: 'HS384' }),
    ],
    ['missing sid', () => signer.sign({ sub: userId }, signOptions)],
    [
      'missing exp',
      () => signer.sign(claims, { algorithm: 'HS256', issuer, audience }),
    ],
  ])('rejects %s', async (_reason, makeToken) => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(makeToken(), { type: 'bearer' })
      .expect(401);
  });
});
