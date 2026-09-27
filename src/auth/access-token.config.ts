export const ACCESS_TOKEN_ALGORITHM = 'HS256';
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

export function getAccessTokenConfig(): {
  secret: string;
  issuer: string;
  audience: string;
} {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes');
  }

  const issuer = process.env.JWT_ISSUER?.trim();
  const audience = process.env.JWT_AUDIENCE?.trim();
  if (!issuer) {
    throw new Error('JWT_ISSUER is required');
  }
  if (!audience) {
    throw new Error('JWT_AUDIENCE is required');
  }

  return { secret, issuer, audience };
}
