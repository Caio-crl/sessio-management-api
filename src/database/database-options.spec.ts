import { getDatabaseOptions } from './database-options';

describe('database options', () => {
  const names = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '3306';
    process.env.DB_USER = 'unused';
    process.env.DB_PASSWORD = 'unused';
    process.env.DB_NAME = 'unused';
  });

  afterAll(() => {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it('keeps schema synchronization disabled', () => {
    expect(getDatabaseOptions()).toMatchObject({
      type: 'mysql',
      port: 3306,
      synchronize: false,
    });
  });

  it('rejects missing credentials and invalid ports', () => {
    delete process.env.DB_PASSWORD;
    expect(getDatabaseOptions).toThrow('DB_PASSWORD is required');

    process.env.DB_PASSWORD = 'unused';
    process.env.DB_PORT = '0';
    expect(getDatabaseOptions).toThrow(
      'DB_PORT must be an integer between 1 and 65535',
    );
  });
});
