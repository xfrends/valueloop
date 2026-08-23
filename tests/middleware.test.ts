import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRequestContext = vi.hoisted(() => vi.fn());
const parseCookieHeader = vi.hoisted(() => vi.fn(() => new Map<string, string>()));
const getCloudflareRuntime = vi.hoisted(() => vi.fn((source: { locals?: { runtime?: unknown } }) => source.locals?.runtime));

vi.mock('astro:middleware', () => ({
  defineMiddleware: (handler: unknown) => handler,
}));

vi.mock('../src/lib/context/request', () => ({
  loadRequestContext,
}));

vi.mock('../src/lib/http/cookies', () => ({
  parseCookieHeader,
}));

vi.mock('../src/lib/cloudflare/bindings', () => ({
  getCloudflareRuntime,
}));

import { onRequest } from '../src/middleware';

function buildContext(pathname: string, loadedContext: Record<string, unknown>) {
  const request = new Request(`http://localhost:4321${pathname}`);
  return {
    request,
    locals: {
      runtime: { env: { DB: {} } },
      ...loadedContext,
    },
    redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
  } as never;
}

describe('middleware auth guards', () => {
  beforeEach(() => {
    loadRequestContext.mockReset();
    parseCookieHeader.mockReset();
    parseCookieHeader.mockReturnValue(new Map());
    getCloudflareRuntime.mockClear();
  });

  it('redirects authenticated users with organization away from onboarding', async () => {
    loadRequestContext.mockResolvedValue({
      user: { id: 'u1', full_name: 'User', email: 'user@test.com', platform_role: 'none' },
      session: { id: 's1', token: 'token', expires_at: '2026-07-21T00:00:00.000Z' },
      organization: { id: 'org-1', name: 'Org', slug: 'org', timezone: 'Asia/Jakarta', default_locale: 'id', status: 'active' },
      membership: { id: 'm1', organization_id: 'org-1', user_id: 'u1', role: 'member', status: 'active' },
    });

    const response = await onRequest(buildContext('/onboarding', {}), async () => new Response('ok'));
    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('/dashboard');
  });

  it('redirects non-admin users away from platform routes', async () => {
    loadRequestContext.mockResolvedValue({
      user: { id: 'u1', full_name: 'User', email: 'user@test.com', platform_role: 'none' },
      session: { id: 's1', token: 'token', expires_at: '2026-07-21T00:00:00.000Z' },
      organization: { id: 'org-1', name: 'Org', slug: 'org', timezone: 'Asia/Jakarta', default_locale: 'id', status: 'active' },
      membership: { id: 'm1', organization_id: 'org-1', user_id: 'u1', role: 'member', status: 'active' },
    });

    const response = await onRequest(buildContext('/platform/articles', {}), async () => new Response('ok'));
    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('/dashboard');
  });

  it('allows platform admin to access platform routes', async () => {
    loadRequestContext.mockResolvedValue({
      user: { id: 'u1', full_name: 'Admin', email: 'admin@test.com', platform_role: 'platform_admin' },
      session: { id: 's1', token: 'token', expires_at: '2026-07-21T00:00:00.000Z' },
      organization: { id: 'org-1', name: 'Org', slug: 'org', timezone: 'Asia/Jakarta', default_locale: 'id', status: 'active' },
      membership: { id: 'm1', organization_id: 'org-1', user_id: 'u1', role: 'owner', status: 'active' },
    });

    const response = await onRequest(
      buildContext('/platform/articles', {}),
      async () => new Response('ok')
    );
    expect(await response?.text()).toBe('ok');
  });

  it('allows authenticated users without organization to visit dashboard', async () => {
    loadRequestContext.mockResolvedValue({
      user: { id: 'u1', full_name: 'User', email: 'user@test.com', platform_role: 'none' },
      session: { id: 's1', token: 'token', expires_at: '2026-07-21T00:00:00.000Z' },
      organization: null,
      membership: null,
    });

    const response = await onRequest(buildContext('/dashboard', {}), async () => new Response('ok'));
    expect(await response?.text()).toBe('ok');
  });

  it('redirects authenticated users without organization from protected routes to dashboard', async () => {
    loadRequestContext.mockResolvedValue({
      user: { id: 'u1', full_name: 'User', email: 'user@test.com', platform_role: 'none' },
      session: { id: 's1', token: 'token', expires_at: '2026-07-21T00:00:00.000Z' },
      organization: null,
      membership: null,
    });

    const response = await onRequest(buildContext('/settings', {}), async () => new Response('ok'));
    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('/dashboard');
  });

  it('explains an invalid or expired session when a stale session cookie exists', async () => {
    parseCookieHeader.mockReturnValue(new Map([['valueloop_session', 'stale-token']]));
    loadRequestContext.mockResolvedValue({
      user: null,
      session: null,
      organization: null,
      membership: null,
    });

    const response = await onRequest(buildContext('/dashboard', {}), async () => new Response('ok'));

    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toContain('/login?alert=session');
    expect(response?.headers.get('location')).toContain('Sesi%20Anda');
  });
});
