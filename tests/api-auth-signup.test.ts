import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('../src/lib/cloudflare/bindings', () => ({
  getCloudflareRuntime: () => ({
    env: {
      DB: {},
      KV: {},
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USERNAME: 'user',
      SMTP_PASSWORD: 'pass',
      SMTP_FROM: 'noreply@example.com',
      SMTP_SECURE: 'starttls',
    },
  }),
}));

vi.mock('../src/lib/services/bootstrap', () => ({
  hasAnyUsers: vi.fn(async () => true),
}));

vi.mock('../src/lib/services/auth', () => ({
  signupUser: vi.fn(async (_db: unknown, payload: { fullName: string; email: string }) => ({
    id: 'user-1',
    full_name: payload.fullName,
    email: payload.email.toLowerCase(),
    platform_role: 'none',
    email_verified_at: null,
  })),
}));

vi.mock('../src/lib/auth/email-verification', () => ({
  createEmailVerificationOtp: vi.fn(async () => {
    throw new Error('SMTP down');
  }),
}));

import { POST } from '../src/pages/api/auth/signup';

describe('signup route', () => {
  beforeEach(() => {
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it('continues to verify-email when OTP delivery fails and logs the error', async () => {
    const request = new Request('http://localhost:4321/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        fullName: 'Frendi Triarista',
        email: 'frendi@example.com',
        password: 'frendi123!',
        termsAccepted: 'on',
      }),
    });

    const response = await POST({ request, locals: { runtime: {} } } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('/verify-email');
    expect(response.headers.get('location')).toContain('email=frendi%40example.com');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[ValueLoop] Gagal mengirim OTP verifikasi email',
      expect.objectContaining({
        userId: 'user-1',
        email: 'frendi@example.com',
        error: 'SMTP down',
      })
    );
  });
});

