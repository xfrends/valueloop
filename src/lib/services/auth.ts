import { dbFirst, dbRun } from '../db/client';
import { hashPassword, verifyPassword } from '../utils/password';
import { randomId } from '../utils/crypto';
import { createSession, revokeSession } from '../auth/session';
import { ensureSubscription, writeAuditLog } from './shared';
import { slugify } from '../utils/slug';
import { isoNow } from '../utils/date';

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  platform_role: 'none' | 'platform_admin';
  email_verified_at: string | null;
};

export function getEmailDomain(email: string): string {
  const domain = email.trim().toLowerCase().split('@')[1] || '';
  if (!domain) {
    throw new Error('Domain email tidak valid.');
  }
  return domain;
}

export async function findOtherActiveOwnerByEmailDomain(
  db: D1Database,
  email: string,
  excludeUserId?: string
): Promise<{ id: string; email: string } | null> {
  const domain = getEmailDomain(email);
  return dbFirst<{ id: string; email: string }>(
    db,
    `select distinct u.id, u.email
     from organization_members om
     join users u on u.id = om.user_id
     where om.role = 'owner'
       and om.status = 'active'
       and lower(substr(u.email, instr(u.email, '@') + 1)) = ?
       and (? is null or u.id <> ?)
     limit 1`,
    [domain, excludeUserId ?? null, excludeUserId ?? null]
  );
}

export async function assertNoOtherActiveOwnerForEmailDomain(
  db: D1Database,
  email: string,
  excludeUserId?: string
): Promise<void> {
  const existingOwner = await findOtherActiveOwnerByEmailDomain(db, email, excludeUserId);
  if (existingOwner) {
    throw new Error('Domain email ini sudah memiliki owner organisasi. Gunakan undangan member atau hubungi owner domain tersebut.');
  }
}

export async function signupUser(db: D1Database, payload: { fullName: string; email: string; password: string }): Promise<AuthUser> {
  const existing = await dbFirst<{ id: string }>(db, `select id from users where lower(email) = lower(?)`, [payload.email]);
  if (existing) {
    throw new Error('Email sudah terdaftar.');
  }

  const id = randomId();
  const passwordHash = await hashPassword(payload.password);
  await dbRun(
    db,
    `insert into users (id, full_name, email, password_hash, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?)`,
    [id, payload.fullName, payload.email.toLowerCase(), passwordHash, isoNow(), isoNow()]
  );

  return { id, full_name: payload.fullName, email: payload.email.toLowerCase(), platform_role: 'none', email_verified_at: null };
}

export async function loginUser(db: D1Database, payload: { email: string; password: string }): Promise<AuthUser> {
  const user = await dbFirst<AuthUser & { password_hash: string | null }>(
    db,
    `select id, full_name, email, platform_role, email_verified_at, password_hash from users where lower(email) = lower(?) limit 1`,
    [payload.email]
  );

  if (!user?.password_hash) {
    throw new Error('Email atau kata sandi salah.');
  }

  const valid = await verifyPassword(payload.password, user.password_hash);
  if (!valid) {
    throw new Error('Email atau kata sandi salah.');
  }

  if (!user.email_verified_at) {
    throw new Error('Email belum diverifikasi. Masukkan kode OTP yang dikirim ke email Anda.');
  }

  return { id: user.id, full_name: user.full_name, email: user.email, platform_role: user.platform_role, email_verified_at: user.email_verified_at };
}

export async function createAuthSession(db: D1Database, kv: KVNamespace, userId: string) {
  return createSession(db, kv, userId);
}

export async function logoutSession(db: D1Database, kv: KVNamespace, token: string): Promise<void> {
  await revokeSession(db, kv, token);
}

export async function markEmailVerified(db: D1Database, userId: string): Promise<AuthUser> {
  const verifiedAt = isoNow();
  await dbRun(
    db,
    `update users set email_verified_at = coalesce(email_verified_at, ?), updated_at = ? where id = ?`,
    [verifiedAt, verifiedAt, userId]
  );

  const user = await dbFirst<AuthUser>(
    db,
    `select id, full_name, email, platform_role, email_verified_at from users where id = ? limit 1`,
    [userId]
  );
  if (!user) {
    throw new Error('User tidak ditemukan.');
  }
  return user;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<AuthUser | null> {
  return dbFirst<AuthUser>(
    db,
    `select id, full_name, email, platform_role, email_verified_at from users where lower(email) = lower(?) limit 1`,
    [email]
  );
}

export async function upsertGoogleUser(
  db: D1Database,
  payload: {
    googleSub: string;
    email: string;
    fullName: string;
    avatarUrl?: string | null;
    emailVerified: boolean;
  }
): Promise<AuthUser> {
  if (!payload.emailVerified) {
    throw new Error('Email Google belum terverifikasi.');
  }

  const existingByGoogle = await dbFirst<AuthUser>(
    db,
    `select id, full_name, email, platform_role, email_verified_at from users where google_sub = ? limit 1`,
    [payload.googleSub]
  );

  if (existingByGoogle) {
    await dbRun(
      db,
      `update users
       set full_name = ?, email = ?, avatar_url = ?, email_verified_at = coalesce(email_verified_at, ?), updated_at = ?
       where id = ?`,
      [payload.fullName, payload.email.toLowerCase(), payload.avatarUrl ?? null, isoNow(), isoNow(), existingByGoogle.id]
    );
    return (await findUserByEmail(db, payload.email)) as AuthUser;
  }

  const existingByEmail = await findUserByEmail(db, payload.email);
  if (existingByEmail) {
    await dbRun(
      db,
      `update users
       set google_sub = ?, auth_provider = 'google', full_name = ?, avatar_url = ?, email_verified_at = coalesce(email_verified_at, ?), updated_at = ?
       where id = ?`,
      [payload.googleSub, payload.fullName, payload.avatarUrl ?? null, isoNow(), isoNow(), existingByEmail.id]
    );
    return (await findUserByEmail(db, payload.email)) as AuthUser;
  }

  const id = randomId();
  await dbRun(
    db,
    `insert into users (id, full_name, email, avatar_url, platform_role, email_verified_at, google_sub, auth_provider, created_at, updated_at)
     values (?, ?, ?, ?, 'none', ?, ?, 'google', ?, ?)`,
    [id, payload.fullName, payload.email.toLowerCase(), payload.avatarUrl ?? null, isoNow(), payload.googleSub, isoNow(), isoNow()]
  );

  return (await findUserByEmail(db, payload.email)) as AuthUser;
}

export async function createOrganizationWithOwner(
  db: D1Database,
  payload: {
    name: string;
    slug?: string;
    timezone?: string;
    defaultLocale?: string;
    ownerUserId: string;
    ownerFullName: string;
  }
): Promise<{ organizationId: string; organizationSlug: string }> {
  const owner = await dbFirst<{ id: string; email: string }>(
    db,
    `select id, email from users where id = ? limit 1`,
    [payload.ownerUserId]
  );
  if (!owner) {
    throw new Error('User owner tidak ditemukan.');
  }
  await assertNoOtherActiveOwnerForEmailDomain(db, owner.email, payload.ownerUserId);

  const organizationId = randomId();
  const organizationSlug = payload.slug?.trim() || slugify(payload.name);

  await dbRun(
    db,
    `insert into organizations (id, name, slug, timezone, default_locale, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      organizationId,
      payload.name.trim(),
      organizationSlug,
      payload.timezone || 'Asia/Jakarta',
      payload.defaultLocale || 'id',
      isoNow(),
      isoNow(),
    ]
  );

  await dbRun(
    db,
    `insert into organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
     values (?, ?, ?, 'owner', 'active', ?, ?, ?)`,
    [randomId(), organizationId, payload.ownerUserId, isoNow(), isoNow(), isoNow()]
  );

  await ensureSubscription(db, organizationId);

  await writeAuditLog(db, {
    organizationId,
    actorUserId: payload.ownerUserId,
    actorMemberId: null,
    action: 'organization.created',
    entityType: 'organization',
    entityId: organizationId,
    afterValue: {
      id: organizationId,
      name: payload.name,
      slug: organizationSlug,
      timezone: payload.timezone || 'Asia/Jakarta',
      defaultLocale: payload.defaultLocale || 'id',
    },
  });

  return { organizationId, organizationSlug };
}
