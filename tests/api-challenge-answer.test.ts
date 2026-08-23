import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitAnswer } from '../src/lib/services/challenge';

vi.mock('../src/lib/cloudflare/bindings', () => ({
  getCloudflareRuntime: () => ({ env: { DB: {} } }),
}));

vi.mock('../src/lib/services/challenge', () => ({
  submitAnswer: vi.fn(),
}));

import { POST } from '../src/pages/api/challenge/[id]/answer';

const locals = {
  runtime: {},
  organization: { id: 'org-1' },
  membership: { id: 'member-1', role: 'admin' },
  user: { id: 'user-1' },
};

describe('challenge answer route', () => {
  beforeEach(() => {
    vi.mocked(submitAnswer).mockReset();
  });

  it('redirects with an alert instead of throwing when the challenge was already answered', async () => {
    vi.mocked(submitAnswer).mockRejectedValueOnce(
      new Error('Jawaban hanya bisa dikirim untuk challenge yang masih terbuka.')
    );
    const request = new Request('http://localhost:4321/api/challenge/session-1/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ answerText: 'Jawaban yang sudah pernah dikirim.' }),
    });

    const response = await POST({ request, params: { id: 'session-1' }, locals } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('/challenge?error=');
    expect(response.headers.get('location')).toContain('masih%20terbuka');
  });

  it('returns field validation without calling the service for a short answer', async () => {
    const request = new Request('http://localhost:4321/api/challenge/session-1/answer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answerText: 'x' }),
    });

    const response = await POST({ request, params: { id: 'session-1' }, locals } as never);
    const body = await response.json() as { message: string; fieldErrors: Record<string, string> };
    expect(response.status).toBe(400);
    expect(body.message).toBe('Jawaban minimal 3 karakter.');
    expect(body.fieldErrors.answerText).toBe('Jawaban minimal 3 karakter.');
    expect(submitAnswer).not.toHaveBeenCalled();
  });
});
