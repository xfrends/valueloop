import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { clearCurrentOrgCookie, clearGoogleOAuthStateCookie, currentOrgCookie, sessionCookie } from '../../../../lib/auth/cookies';
import { GOOGLE_OAUTH_STATE_COOKIE_NAME } from '../../../../lib/auth/constants';
import { parseCookieHeader } from '../../../../lib/http/cookies';
import { createAuthSession, upsertGoogleUser } from '../../../../lib/services/auth';
import { listUserOrganizations } from '../../../../lib/services/organization';

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
};

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB || !runtime.env.KV) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }

  const clientId = runtime.env.GOOGLE_CLIENT_ID;
  const clientSecret = runtime.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response('Google OAuth belum dikonfigurasi.', { status: 500 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  const expectedState = cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME);

  if (!code || !state || !expectedState || state !== expectedState) {
    const headers = new Headers({ Location: '/login?error=Google%20OAuth%20tidak%20valid.' });
    headers.append('Set-Cookie', clearGoogleOAuthStateCookie());
    return new Response(null, { status: 302, headers });
  }

  const appUrl = runtime.env.PUBLIC_APP_URL || url.origin;
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const token = await tokenResponse.json<GoogleTokenResponse>();

  if (!tokenResponse.ok || !token.access_token) {
    const headers = new Headers({ Location: '/login?error=Gagal%20masuk%20dengan%20Google.' });
    headers.append('Set-Cookie', clearGoogleOAuthStateCookie());
    return new Response(null, { status: 302, headers });
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!profileResponse.ok) {
    const headers = new Headers({ Location: '/login?error=Gagal%20membaca%20profil%20Google.' });
    headers.append('Set-Cookie', clearGoogleOAuthStateCookie());
    return new Response(null, { status: 302, headers });
  }

  const profile = await profileResponse.json<GoogleUserInfo>();
  const user = await upsertGoogleUser(runtime.env.DB, {
    googleSub: profile.sub,
    email: profile.email,
    fullName: profile.name || profile.email,
    avatarUrl: profile.picture || null,
    emailVerified: Boolean(profile.email_verified),
  });
  const session = await createAuthSession(runtime.env.DB, runtime.env.KV, user.id);
  const orgs = await listUserOrganizations(runtime.env.DB, user.id);
  const target = '/dashboard';

  const headers = new Headers({ Location: target });
  headers.append('Set-Cookie', clearGoogleOAuthStateCookie());
  headers.append('Set-Cookie', sessionCookie(session.token, session.expiresAt));
  if (orgs[0]) {
    headers.append('Set-Cookie', currentOrgCookie(orgs[0].id));
  } else {
    headers.append('Set-Cookie', clearCurrentOrgCookie());
  }

  return new Response(null, { status: 302, headers });
};
