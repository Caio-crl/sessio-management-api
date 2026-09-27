import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { SessionsService } from '../sessions/sessions.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_THROTTLE } from './auth-throttle.config';

describe('auth endpoint rate limiting', () => {
  let app: INestApplication;
  const register = jest.fn().mockResolvedValue({
    id: '7d889bbb-fd17-42ca-a2eb-1de5804734d2',
    email: 'test@example.com',
    createdAt: new Date('2026-09-27T00:00:00.000Z'),
  });
  const login = jest
    .fn()
    .mockRejectedValue(new UnauthorizedException('Invalid credentials'));
  const refresh = jest.fn().mockResolvedValue({
    accessToken: 'test-only-access',
    refreshToken: 'test-only-refresh',
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([AUTH_THROTTLE])],
      controllers: [AuthController],
      providers: [
        ThrottlerGuard,
        { provide: AuthService, useValue: { register, login, refresh } },
        { provide: SessionsService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app?.close());

  it.each([
    {
      path: '/auth/register',
      body: { email: 'test@example.com', password: 'test-passphrase' },
      allowedStatus: 201,
      handler: register,
    },
    {
      path: '/auth/login',
      body: { email: 'test@example.com', password: 'wrong' },
      allowedStatus: 401,
      handler: login,
    },
    {
      path: '/auth/refresh',
      body: { refreshToken: 'test-only-refresh' },
      allowedStatus: 200,
      handler: refresh,
    },
  ])('limits $path after 20 requests in the minute', async (scenario) => {
    scenario.handler.mockClear();
    for (let count = 0; count < AUTH_THROTTLE.limit; count++) {
      await request(app.getHttpServer())
        .post(scenario.path)
        .send(scenario.body)
        .expect(scenario.allowedStatus);
    }

    const blocked = await request(app.getHttpServer())
      .post(scenario.path)
      .send(scenario.body)
      .expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(scenario.handler).toHaveBeenCalledTimes(AUTH_THROTTLE.limit);
  });
});
