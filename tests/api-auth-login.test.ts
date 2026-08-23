import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_TTL_ONE_DAY_SECONDS, SESSION_TTL_SECONDS } from '../src/lib/auth/constants';
import { createAuthSession, loginUser } from '../src/lib/services/auth';

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('../src/lib/cloudflare/bindings', () => ({
  getCloudflareRuntime: () => ({
    env: {
      DB: {},
      KV: {},
    },
  }),
}));

vi.mock('../src/lib/services/bootstrap', () => ({
  hasAnyUsers: vi.fn(async () => true),
}));

vi.mock('../src/lib/services/auth', () => ({
  loginUser: vi.fn(async () => ({
    id: 'user-1',
    full_name: 'Frendi',
    email: 'frendi@example.com',
    platform_role: 'none',
    email_verified_at: '2026-06-21T00:00:00.000Z',
  })),
  createAuthSession: vi.fn(async (_db, _kv, _userId, ttlSeconds = 60 * 60 * 24 * 30) => ({
    token: 'token-1',
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  })),
}));

vi.mock('../src/lib/services/organization', () => ({
  listUserOrganizations: vi.fn(async () => []),
}));

import { POST } from '../src/pages/api/auth/login';

describe('login route', () => {
  beforeEach(() => {
    consoleErrorSpy.mockClear();
    vi.mocked(createAuthSession).mockClear();
    vi.mocked(loginUser).mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it('returns inline validation errors when fields are missing', async () => {
    const request = new Request('http://localhost:4321/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: '',
        password: '',
      }),
    });

    const response = await POST({ request, locals: { runtime: {} } } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('/login?error=');
    expect(response.headers.get('location')).toContain('fieldErrors=');
    expect(response.headers.get('location')).toContain('email=');
  });

  it('redirects to dashboard when login succeeds and user has no organization', async () => {
    const request = new Request('http://localhost:4321/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: 'frendi@example.com',
        password: 'frendi123!',
      }),
    });

    const response = await POST({ request, locals: { runtime: {} } } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(response.headers.get('set-cookie')).toContain('valueloop_session=');
    expect(response.headers.get('set-cookie')).toContain('valueloop_org=;');
    expect(vi.mocked(createAuthSession)).toHaveBeenCalledWith({}, {}, 'user-1', SESSION_TTL_ONE_DAY_SECONDS);
  });

  it('creates a one-month session when remember me is checked', async () => {
    const request = new Request('http://localhost:4321/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        email: 'frendi@example.com',
        password: 'frendi123!',
        rememberMe: 'on',
      }),
    });

    const response = await POST({ request, locals: { runtime: {} } } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(vi.mocked(createAuthSession)).toHaveBeenLastCalledWith({}, {}, 'user-1', SESSION_TTL_SECONDS);
  });

  it('returns a credential alert without revealing which credential is wrong', async () => {
    const error = Object.assign(new Error('Email atau kata sandi salah.'), { code: 'invalid_credentials' });
    vi.mocked(loginUser).mockRejectedValueOnce(error);
    const request = new Request('http://localhost:4321/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'frendi@example.com', password: 'salah' }),
    });

    const response = await POST({ request, locals: { runtime: {} } } as never);
    const location = response.headers.get('location') || '';

    expect(response.status).toBe(302);
    expect(location).toContain('alert=credentials');
    expect(location).toContain('fieldErrors=');
  });

  it('returns an email verification alert with the submitted email', async () => {
    const error = Object.assign(new Error('Email belum diverifikasi.'), { code: 'email_unverified' });
    vi.mocked(loginUser).mockRejectedValueOnce(error);
    const request = new Request('http://localhost:4321/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'root@example.com', password: 'password-aman' }),
    });

    const response = await POST({ request, locals: { runtime: {} } } as never);
    const location = response.headers.get('location') || '';

    expect(response.status).toBe(302);
    expect(location).toContain('alert=email_unverified');
    expect(location).toContain('email=root%40example.com');
    expect(location).not.toContain('fieldErrors=');
  });
});
