import { beforeEach, describe, expect, it, vi } from 'vitest';
import { switchOrganizationMembership } from '../src/lib/services/organization';

vi.mock('../src/lib/cloudflare/bindings', () => ({
  getCloudflareRuntime: () => ({ env: { DB: {} } }),
}));

vi.mock('../src/lib/services/organization', () => ({
  switchOrganizationMembership: vi.fn(),
}));

import { POST } from '../src/pages/api/organizations/switch';

const locals = {
  runtime: {},
  organization: { id: 'org-1' },
  membership: { id: 'member-1', role: 'member' },
  user: { id: 'user-1' },
};

// Same request the workspace switcher form in AppLayout sends.
function switchRequest(organizationId: string) {
  return new Request('http://localhost:4321/api/organizations/switch', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ organizationId }),
  });
}

describe('organization switch route', () => {
  beforeEach(() => {
    vi.mocked(switchOrganizationMembership).mockReset();
  });

  it('sets the workspace cookie and redirects to the dashboard for a member', async () => {
    vi.mocked(switchOrganizationMembership).mockResolvedValueOnce({ organizationId: 'org-2', role: 'member' });

    const response = await POST({ request: switchRequest('org-2'), locals } as never);
    expect(switchOrganizationMembership).toHaveBeenCalledWith({}, { organizationId: 'org-2', userId: 'user-1' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(response.headers.get('set-cookie')).toContain('valueloop_org=org-2');
  });

  it('refuses a workspace the user is not an active member of', async () => {
    vi.mocked(switchOrganizationMembership).mockResolvedValueOnce(null);

    const response = await POST({ request: switchRequest('org-foreign'), locals } as never);
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
