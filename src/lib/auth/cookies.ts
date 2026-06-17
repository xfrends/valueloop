import { SESSION_COOKIE_NAME, CURRENT_ORG_COOKIE_NAME, GOOGLE_OAUTH_STATE_COOKIE_NAME } from './constants';

export function buildCookie(name: string, value: string, expiresAt?: string): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (expiresAt) {
    parts.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  }
  if (import.meta.env.PROD) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function sessionCookie(token: string, expiresAt: string): string {
  return buildCookie(SESSION_COOKIE_NAME, token, expiresAt);
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function currentOrgCookie(orgId: string): string {
  return buildCookie(CURRENT_ORG_COOKIE_NAME, orgId);
}

export function clearCurrentOrgCookie(): string {
  return `${CURRENT_ORG_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`;
}

export function googleOAuthStateCookie(state: string, expiresAt: string): string {
  return buildCookie(GOOGLE_OAUTH_STATE_COOKIE_NAME, state, expiresAt);
}

export function clearGoogleOAuthStateCookie(): string {
  return `${GOOGLE_OAUTH_STATE_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
