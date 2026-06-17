import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { createOAuthState } from '../../../../lib/auth/email-verification';
import { googleOAuthStateCookie } from '../../../../lib/auth/cookies';

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  const clientId = runtime?.env?.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return new Response('Google OAuth belum dikonfigurasi.', { status: 500 });
  }

  const appUrl = runtime.env.PUBLIC_APP_URL || new URL(request.url).origin;
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`;
  const state = createOAuthState();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  const headers = new Headers({ Location: url.toString() });
  headers.append('Set-Cookie', googleOAuthStateCookie(state, expiresAt));
  return new Response(null, { status: 302, headers });
};
