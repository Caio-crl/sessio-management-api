import { verify } from 'argon2';
import { QueryFailedError, Repository } from 'typeorm';
import { Session } from '../sessions/entities/session.entity';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';

describe('AuthService registration', () => {
  const createdAt = new Date('2026-09-27T00:00:00.000Z');
  const password = 'a long passphrase';

  it('normalizes email, hashes the password and returns only safe fields', async () => {
    const save = jest.fn(async (input: Partial<User>) => ({
      ...input,
      id: '47cf84d4-159a-45db-a8a2-1f31fc9c576b',
      createdAt,
    }));
    const service = new AuthService(
      { save } as unknown as Repository<User>,
      {} as Repository<Session>,
    );

    const response = await service.register({
      email: '  User+tag@Example.COM  ',
      password,
    });

    const saved = save.mock.calls[0][0];
    expect(saved.email).toBe('user+tag@example.com');
    expect(saved).not.toHaveProperty('password');
    expect(saved.passwordHash).toMatch(/^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
    expect(await verify(saved.passwordHash as string, password)).toBe(true);
    expect(response).toEqual({
      id: '47cf84d4-159a-45db-a8a2-1f31fc9c576b',
      email: 'user+tag@example.com',
      createdAt,
    });
    expect(response).not.toHaveProperty('password');
    expect(response).not.toHaveProperty('passwordHash');
  });

  it('maps a concurrent unique constraint violation to conflict', async () => {
    const duplicate = Object.assign(new Error('duplicate'), {
      code: 'ER_DUP_ENTRY',
    });
    const save = jest
      .fn()
      .mockRejectedValue(new QueryFailedError('INSERT', [], duplicate));
    const service = new AuthService(
      { save } as unknown as Repository<User>,
      {} as Repository<Session>,
    );

    await expect(
      service.register({ email: 'user@example.com', password }),
    ).rejects.toMatchObject({
      status: 409,
      response: { message: 'Email is already registered' },
    });
  });

  it('hides unexpected database errors', async () => {
    const databaseError = Object.assign(new Error('database error'), {
      code: 'ER_BAD_FIELD_ERROR',
    });
    const save = jest
      .fn()
      .mockRejectedValue(new QueryFailedError('INSERT', [], databaseError));
    const service = new AuthService(
      { save } as unknown as Repository<User>,
      {} as Repository<Session>,
    );

    await expect(
      service.register({ email: 'user@example.com', password }),
    ).rejects.toMatchObject({
      status: 500,
      response: {
        message: 'Could not complete registration',
      },
    });
  });
});
