import { INestApplication, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AccessJwtGuard } from '../auth/access-jwt.guard';
import { AccessJwtStrategy } from '../auth/access-jwt.strategy';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

describe('SessionsController', () => {
  const secret = 'test-only-access-secret-with-at-least-32-characters';
  const userId = '47cf84d4-159a-45db-a8a2-1f31fc9c576b';
  const sessionId = 'e51a935b-df41-45e0-b7b2-a915cb66456b';
  const otherId = 'a338b383-325b-4e8f-99ea-ec55828a3791';
  const signer = new JwtService({ secret });
  const previousEnv = {
    secret: process.env.JWT_ACCESS_SECRET,
    issuer: process.env.JWT_ISSUER,
    audience: process.env.JWT_AUDIENCE,
  };
  const listActive = jest.fn();
  const revokeById = jest.fn();
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    process.env.JWT_ISSUER = 'test-issuer';
    process.env.JWT_AUDIENCE = 'test-audience';
    token = signer.sign(
      { sub: userId, sid: sessionId },
      {
        algorithm: 'HS256',
        expiresIn: 600,
        issuer: 'test-issuer',
        audience: 'test-audience',
      },
    );

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [SessionsController],
      providers: [
        AccessJwtGuard,
        AccessJwtStrategy,
        { provide: SessionsService, useValue: { listActive, revokeById } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    listActive.mockReset();
    revokeById.mockReset();
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

  it('lists only the DTO fields returned for the authenticated identity', async () => {
    listActive.mockResolvedValue([
      {
        id: sessionId,
        createdAt: new Date('2026-09-27T12:00:00.000Z'),
        lastUsedAt: new Date('2026-09-27T12:05:00.000Z'),
        expiresAt: new Date('2026-10-27T12:00:00.000Z'),
        current: true,
      },
    ]);

    const response = await request(app.getHttpServer())
      .get('/sessions')
      .auth(token, { type: 'bearer' })
      .expect(200);

    expect(response.body).toEqual([
      {
        id: sessionId,
        createdAt: '2026-09-27T12:00:00.000Z',
        lastUsedAt: '2026-09-27T12:05:00.000Z',
        expiresAt: '2026-10-27T12:00:00.000Z',
        current: true,
      },
    ]);
    expect(listActive).toHaveBeenCalledWith(userId, sessionId);
  });

  it('requires a valid token for session listing and revocation', async () => {
    await request(app.getHttpServer()).get('/sessions').expect(401);
    await request(app.getHttpServer())
      .delete(`/sessions/${otherId}`)
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    expect(listActive).not.toHaveBeenCalled();
    expect(revokeById).not.toHaveBeenCalled();
  });

  it('revokes a chosen owned session, including the current session', async () => {
    revokeById.mockResolvedValue(undefined);
    await request(app.getHttpServer())
      .delete(`/sessions/${otherId}`)
      .auth(token, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/sessions/${sessionId}`)
      .auth(token, { type: 'bearer' })
      .expect(204);
    expect(revokeById).toHaveBeenNthCalledWith(1, userId, otherId);
    expect(revokeById).toHaveBeenNthCalledWith(2, userId, sessionId);
  });

  it('rejects an invalid UUID before querying sessions', async () => {
    await request(app.getHttpServer())
      .delete('/sessions/not-a-uuid')
      .auth(token, { type: 'bearer' })
      .expect(400);
    expect(revokeById).not.toHaveBeenCalled();
  });

  it('returns the same 404 for missing and unowned session IDs', async () => {
    revokeById.mockRejectedValue(new NotFoundException('Session not found'));
    const first = await request(app.getHttpServer())
      .delete(`/sessions/${otherId}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
    const second = await request(app.getHttpServer())
      .delete(`/sessions/${sessionId}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
    expect(first.body).toEqual(second.body);
  });
});
