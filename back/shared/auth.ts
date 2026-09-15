import { AuthInfo, TokenInfo } from '../data/system';
import jwt from 'jsonwebtoken';

export function isDefaultAuthInfo(authInfo: AuthInfo): boolean {
  return authInfo.initialized === false;
}

/**
 * Validates if a token exists in the authentication info.
 * Requires an authenticated platform session with token metadata.
 *
 * @param authInfo - The authentication information
 * @param headerToken - The token to validate
 * @param platform - The platform (desktop, mobile)
 * @returns true if the token is valid, false otherwise
 */
export function isValidToken(
  authInfo: AuthInfo | null | undefined,
  headerToken: string,
  platform: string,
  secret: string,
): boolean {
  if (!authInfo || !headerToken) {
    return false;
  }

  try {
    const claims = jwt.verify(headerToken, secret, { algorithms: ['HS384'] });
    if (typeof claims === 'string' || typeof claims.exp !== 'number') {
      return false;
    }
  } catch {
    return false;
  }

  const platformTokens = authInfo.tokens?.[platform];
  if (Array.isArray(platformTokens)) {
    return platformTokens.some(
      (t: TokenInfo) =>
        t &&
        t.value === headerToken &&
        (t.expiration === undefined || t.expiration > Date.now() / 1000),
    );
  }

  // Malformed or obsolete session shapes fail closed.
  return false;
}
