import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('POST /auth/register', () => {
  let app: INestApplication;
  const register = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { register } }],
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
