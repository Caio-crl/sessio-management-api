import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { SessionsService } from '../sessions/sessions.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('POST /auth/register', () => {
  let app: INestApplication;
  const register = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { register } },
        { provide: SessionsService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  beforeEach(() => register.mockReset());

  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with the safe registration response', async () => {
    register.mockResolvedValue({
      id: '47cf84d4-159a-45db-a8a2-1f31fc9c576b',
      email: 'user@example.com',
      createdAt: new Date('2026-09-27T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: ' user@example.com ', password: 'long passphrase' })
      .expect(201);

    expect(response.body).toEqual({
      id: '47cf84d4-159a-45db-a8a2-1f31fc9c576b',
      email: 'user@example.com',
      createdAt: '2026-09-27T00:00:00.000Z',
    });
    expect(register).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'long passphrase',
    });
  });

  it.each([
    { email: 'invalid', password: 'long passphrase' },
    { email: 'user@example.com', password: 'short' },
    { email: 'user@example.com', password: 'x'.repeat(129) },
    {
      email: 'user@example.com',
      password: 'long passphrase',
      unexpected: 'field',
    },
  ])('rejects invalid registration data', async (body) => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(400);

    expect(register).not.toHaveBeenCalled();
  });
});

describe('POST /auth/login', () => {
  let app: INestApplication;
  const login = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: SessionsService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  beforeEach(() => login.mockReset());

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the access and refresh tokens', async () => {
    login.mockResolvedValue({
      accessToken: 'signed-access-token',
      refreshToken: 'session-id.random-secret',
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ' USER@Example.com ', password: 'p' })
      .expect(200);

    expect(response.body).toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 'session-id.random-secret',
    });
    expect(login).toHaveBeenCalledWith({
      email: 'USER@Example.com',
      password: 'p',
    });
  });

  it.each([
    { email: 'invalid', password: 'password' },
    { email: 'user@example.com', password: '' },
    { email: 'user@example.com', password: 'x'.repeat(129) },
    { email: 'user@example.com', password: 'password', extra: 'field' },
  ])('rejects invalid login data', async (body) => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(400);

    expect(login).not.toHaveBeenCalled();
  });
});

describe('POST /auth/refresh', () => {
  let app: INestApplication;
  const refresh = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { refresh } },
        { provide: SessionsService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => refresh.mockReset());

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the rotated tokens', async () => {
    refresh.mockResolvedValue({
      accessToken: 'signed-access-token',
      refreshToken: 'session-id.new-secret',
    });

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'session-id.old-secret' })
      .expect(200);

    expect(response.body).toEqual({
      accessToken: 'signed-access-token',
      refreshToken: 'session-id.new-secret',
    });
    expect(refresh).toHaveBeenCalledWith({
      refreshToken: 'session-id.old-secret',
    });
  });

  it.each([
    {},
    { refreshToken: 123 },
    { refreshToken: '' },
    {
      refreshToken: 'token',
      extra: 'field',
    },
  ])('rejects an invalid request body', async (body) => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send(body)
      .expect(400);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not accept a refresh token from the query string', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .query({ refreshToken: 'session-id.secret' })
      .send({})
      .expect(400);
    expect(refresh).not.toHaveBeenCalled();
  });
});
