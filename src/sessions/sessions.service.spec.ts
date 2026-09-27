import {
  FindManyOptions,
  FindOperator,
  FindOptionsWhere,
  IsNull,
  Repository,
} from 'typeorm';
import { Session } from './entities/session.entity';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  const userId = '47cf84d4-159a-45db-a8a2-1f31fc9c576b';
  const currentId = 'e51a935b-df41-45e0-b7b2-a915cb66456b';
  const otherId = 'a338b383-325b-4e8f-99ea-ec55828a3791';

  function createService() {
    const find = jest.fn();
    const update = jest.fn();
    const existsBy = jest.fn();
    const service = new SessionsService({
      find,
      update,
      existsBy,
    } as unknown as Repository<Session>);
    return { service, find, update, existsBy };
  }

  it('queries only active owned sessions in stable order and returns safe fields', async () => {
    const { service, find } = createService();
    const createdAt = new Date('2026-09-27T12:00:00.000Z');
    const lastUsedAt = new Date('2026-09-27T12:05:00.000Z');
    const expiresAt = new Date('2026-10-27T12:00:00.000Z');
    find.mockResolvedValue([
      {
        id: currentId,
        userId,
        createdAt,
        lastUsedAt,
        expiresAt,
        refreshTokenHash: 'hidden-hash',
        previousRefreshTokenHash: 'hidden-previous-hash',
        revokedAt: null,
      },
      {
        id: otherId,
        userId,
        createdAt: new Date('2026-09-26T12:00:00.000Z'),
        lastUsedAt,
        expiresAt,
        refreshTokenHash: 'other-hidden-hash',
        revokedAt: null,
      },
    ]);
    const before = Date.now();

    const response = await service.listActive(userId, currentId);

    const after = Date.now();
    const options = find.mock.calls[0][0] as FindManyOptions<Session>;
    const where = options.where as FindOptionsWhere<Session>;
    expect(where.userId).toBe(userId);
    expect(where.revokedAt).toEqual(IsNull());
    const expiryFilter = where.expiresAt as FindOperator<Date>;
    expect(expiryFilter.type).toBe('moreThan');
    expect(expiryFilter.value.getTime()).toBeGreaterThanOrEqual(before);
    expect(expiryFilter.value.getTime()).toBeLessThanOrEqual(after);
    expect(options.select).toEqual({
      id: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    });
    expect(options.order).toEqual({ createdAt: 'DESC', id: 'DESC' });
    expect(response).toEqual([
      { id: currentId, createdAt, lastUsedAt, expiresAt, current: true },
      {
        id: otherId,
        createdAt: new Date('2026-09-26T12:00:00.000Z'),
        lastUsedAt,
        expiresAt,
        current: false,
      },
    ]);
    expect(response[0]).not.toHaveProperty('userId');
    expect(response[0]).not.toHaveProperty('refreshTokenHash');
    expect(response[0]).not.toHaveProperty('previousRefreshTokenHash');
    expect(response[0]).not.toHaveProperty('revokedAt');
    expect(response[0]).not.toHaveProperty('refreshToken');
  });

  it('marks only the current owned session revoked and stays idempotent', async () => {
    const { service, update, existsBy } = createService();
    update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await expect(
      service.revokeCurrent(userId, currentId),
    ).resolves.toBeUndefined();
    await expect(
      service.revokeCurrent(userId, currentId),
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(
      1,
      { id: currentId, userId, revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      { id: currentId, userId, revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
    expect(existsBy).not.toHaveBeenCalled();
  });

  it('revokes an owned session, including the current one', async () => {
    const { service, update, existsBy } = createService();
    update.mockResolvedValue({ affected: 1 });

    await expect(service.revokeById(userId, otherId)).resolves.toBeUndefined();
    await expect(
      service.revokeById(userId, currentId),
    ).resolves.toBeUndefined();

    expect(update).toHaveBeenNthCalledWith(
      1,
      { id: otherId, userId, revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
    expect(update).toHaveBeenNthCalledWith(
      2,
      { id: currentId, userId, revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
    expect(existsBy).not.toHaveBeenCalled();
  });

  it('treats an owned, already revoked session as success', async () => {
    const { service, update, existsBy } = createService();
    update.mockResolvedValue({ affected: 0 });
    existsBy.mockResolvedValue(true);

    await expect(service.revokeById(userId, otherId)).resolves.toBeUndefined();
    expect(existsBy).toHaveBeenCalledWith({ id: otherId, userId });
  });

  it('does not disclose whether an unowned session exists', async () => {
    const { service, update, existsBy } = createService();
    update.mockResolvedValue({ affected: 0 });
    existsBy.mockResolvedValue(false);
    const expected = {
      status: 404,
      response: { message: 'Session not found' },
    };

    await expect(service.revokeById(userId, otherId)).rejects.toMatchObject(
      expected,
    );
    await expect(service.revokeById(userId, currentId)).rejects.toMatchObject(
      expected,
    );
    expect(update).toHaveBeenCalledWith(
      { id: otherId, userId, revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
    expect(existsBy).toHaveBeenCalledWith({ id: otherId, userId });
    expect(existsBy).toHaveBeenCalledWith({ id: currentId, userId });
  });
});
