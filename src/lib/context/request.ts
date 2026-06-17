import { dbFirst } from '../db/client';
import type { PlatformRole, OrganizationRole } from '../permissions';
import { CURRENT_ORG_COOKIE_NAME, SESSION_COOKIE_NAME } from '../auth/constants';
import { sha256Hex } from '../utils/crypto';
import { isoNow } from '../utils/date';

export type RequestUser = {
  id: string;
  full_name: string;
  email: string;
  platform_role: PlatformRole;
};

export type RequestOrganization = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  default_locale: string;
  status: string;
};

export type RequestMembership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  status: 'active' | 'invited' | 'inactive';
};

export type RequestContext = {
  user: RequestUser | null;
  session: { id: string; token: string; expires_at: string } | null;
  organization: RequestOrganization | null;
  membership: RequestMembership | null;
};

export async function loadRequestContext(db: D1Database, cookies: ReadonlyMap<string, string>): Promise<RequestContext> {
  const token = cookies.get(SESSION_COOKIE_NAME) ?? null;
  const tokenHash = token ? await sha256Hex(token) : null;

  const session = tokenHash
    ? await dbFirst<{ id: string; user_id: string; token_hash: string; expires_at: string; revoked_at: string | null }>(
      db,
      `select id, user_id, token_hash, expires_at, revoked_at
       from auth_sessions
       where token_hash = ? and revoked_at is null and expires_at > ?`,
      [tokenHash, isoNow()]
      )
    : null;

  const user = session
    ? await dbFirst<RequestUser>(db, `select id, full_name, email, platform_role from users where id = ?`, [session.user_id])
    : null;

  if (!user || !session) {
    return { user: null, session: null, organization: null, membership: null };
  }

  const sessionToken = token as string;

  const orgId = cookies.get(CURRENT_ORG_COOKIE_NAME) ?? null;
  const organization = orgId
    ? await dbFirst<RequestOrganization>(
        db,
        `select id, name, slug, timezone, default_locale, status
         from organizations
         where id = ? and status = 'active'`,
        [orgId]
      )
    : null;

  const membership = organization
    ? await dbFirst<RequestMembership>(
        db,
        `select id, organization_id, user_id, role, status
         from organization_members
         where organization_id = ? and user_id = ?`,
        [organization.id, user.id]
      )
    : null;

  if (!organization || !membership || membership.status !== 'active') {
    return { user, session: { id: session.id, token: sessionToken, expires_at: session.expires_at }, organization: null, membership: null };
  }

  return { user, session: { id: session.id, token: sessionToken, expires_at: session.expires_at }, organization, membership };
}
