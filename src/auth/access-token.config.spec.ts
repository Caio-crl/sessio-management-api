import { getAccessTokenConfig } from './access-token.config';

describe('access token configuration', () => {
  const names = ['JWT_ACCESS_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE'];
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET =
      'test-only-access-secret-with-at-least-32-characters';
    process.env.JWT_ISSUER = 'test-issuer';
    process.env.JWT_AUDIENCE = 'test-audience';
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

  it('reads the required values from the environment', () => {
    expect(getAccessTokenConfig()).toMatchObject({
      issuer: 'test-issuer',
      audience: 'test-audience',
    });
  });

  it('rejects a missing or short secret', () => {
    delete process.env.JWT_ACCESS_SECRET;
    expect(getAccessTokenConfig).toThrow('JWT_ACCESS_SECRET');

    process.env.JWT_ACCESS_SECRET = 'short';
    expect(getAccessTokenConfig).toThrow('JWT_ACCESS_SECRET');
  });

  it('rejects missing issuer or audience', () => {
    delete process.env.JWT_ISSUER;
    expect(getAccessTokenConfig).toThrow('JWT_ISSUER');

    process.env.JWT_ISSUER = 'test-issuer';
    delete process.env.JWT_AUDIENCE;
    expect(getAccessTokenConfig).toThrow('JWT_AUDIENCE');
  });
});
