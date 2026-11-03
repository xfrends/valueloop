import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestD1 } from './helpers/d1';
import { createTestD1 } from './helpers/d1';
import { createOwnedOrganization } from './helpers/seed';
import { listPlanCatalog } from '../src/lib/services/shared';
import { getOrganizationAiProviderConfig, upsertOrganizationAiSettings } from '../src/lib/services/ai-settings';

const SESSION_SECRET = 'test-session-secret';

describe('plan challenge limits and organization AI tokens', () => {
  let testD1: TestD1;

  beforeEach(async () => {
    testD1 = await createTestD1();
  });

  afterEach(async () => {
    await testD1?.dispose();
  });

  it('sizes the monthly challenge quota as max members × 30 days', async () => {
    const plans = await listPlanCatalog(testD1.db);
    for (const plan of plans) {
      expect(plan.limits.maxChallengesPerMonth).toBe(plan.limits.maxMembers * 30);
    }
    expect(plans.find((plan) => plan.code === 'free')?.limits.maxChallengesPerMonth).toBe(750);
  });

  it('only resolves AI config from the organization settings, never a platform key', async () => {
    const { organization, owner, membershipId } = await createOwnedOrganization(testD1.db, {
      ownerName: 'Owner AI',
      ownerEmail: 'owner-ai@example.com',
      organizationName: 'Org AI',
      organizationSlug: 'org-ai',
    });
    const organizationId = organization.organizationId;

    // No settings saved: AI features must stay off even if the platform has its own key in env.
    expect(await getOrganizationAiProviderConfig(testD1.db, organizationId, SESSION_SECRET)).toBeNull();

    await upsertOrganizationAiSettings(testD1.db, {
      organizationId,
      actorUserId: owner.id,
      actorMemberId: membershipId,
      provider: 'openai',
      protocol: 'openai_compatible',
      model: 'gpt-test',
      apiToken: 'sk-org-own-token',
      isEnabled: false,
      sessionSecret: SESSION_SECRET,
    });
    // Saved but disabled: still off.
    expect(await getOrganizationAiProviderConfig(testD1.db, organizationId, SESSION_SECRET)).toBeNull();

    await upsertOrganizationAiSettings(testD1.db, {
      organizationId,
      actorUserId: owner.id,
      actorMemberId: membershipId,
      provider: 'openai',
      protocol: 'openai_compatible',
      model: 'gpt-test',
      isEnabled: true,
      sessionSecret: SESSION_SECRET,
    });
    const config = await getOrganizationAiProviderConfig(testD1.db, organizationId, SESSION_SECRET);
    expect(config?.apiKey).toBe('sk-org-own-token');
    expect(config?.model).toBe('gpt-test');
  });
});
