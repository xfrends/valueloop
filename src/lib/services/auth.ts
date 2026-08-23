import { dbFirst, dbRun } from '../db/client';
import { hashPassword, verifyPassword } from '../utils/password';
import { randomId } from '../utils/crypto';
import { createSession, revokeSession } from '../auth/session';
import { ensureSubscription, generateOrganizationSlug, writeAuditLog } from './shared';
import { isoNow } from '../utils/date';

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  platform_role: 'none' | 'platform_admin';
  email_verified_at: string | null;
};

export type UserProfile = AuthUser & {
  auth_provider: 'password' | 'google';
  has_password: boolean;
};

export class AuthLoginError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_credentials' | 'email_unverified'
  ) {
    super(message);
    this.name = 'AuthLoginError';
  }
}

export async function signupUser(db: D1Database, payload: { fullName: string; email: string; password: string }): Promise<AuthUser> {
  const existing = await dbFirst<{ id: string; is_placeholder: number }>(db, `select id, is_placeholder from users where lower(email) = lower(?)`, [payload.email]);
  if (existing?.is_placeholder === 1) {
    const passwordHash = await hashPassword(payload.password);
    await dbRun(
      db,
      `update users set full_name = ?, password_hash = ?, is_placeholder = 0, email_verified_at = null, updated_at = ? where id = ?`,
      [payload.fullName, passwordHash, isoNow(), existing.id]
    );
    return { id: existing.id, full_name: payload.fullName, email: payload.email.toLowerCase(), platform_role: 'none', email_verified_at: null };
  }
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
    throw new AuthLoginError('Email atau kata sandi salah.', 'invalid_credentials');
  }

  const valid = await verifyPassword(payload.password, user.password_hash);
  if (!valid) {
    throw new AuthLoginError('Email atau kata sandi salah.', 'invalid_credentials');
  }

  if (!user.email_verified_at) {
    throw new AuthLoginError(
      'Email belum diverifikasi. Verifikasi email Anda dengan kode OTP sebelum masuk.',
      'email_unverified'
    );
  }

  return { id: user.id, full_name: user.full_name, email: user.email, platform_role: user.platform_role, email_verified_at: user.email_verified_at };
}

export async function createAuthSession(db: D1Database, kv: KVNamespace, userId: string, ttlSeconds?: number) {
  return createSession(db, kv, userId, ttlSeconds);
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

export async function getUserProfile(db: D1Database, userId: string): Promise<UserProfile | null> {
  const user = await dbFirst<Omit<UserProfile, 'has_password'> & { password_hash: string | null }>(
    db,
    `select id, full_name, email, platform_role, email_verified_at, auth_provider, password_hash
     from users where id = ? limit 1`,
    [userId]
  );
  if (!user) {
    return null;
  }
  const { password_hash: passwordHash, ...profile } = user;
  return { ...profile, has_password: Boolean(passwordHash) };
}

export async function updateUserProfile(
  db: D1Database,
  payload: { userId: string; fullName: string; email: string; currentPassword?: string }
): Promise<{ profile: UserProfile; emailChanged: boolean }> {
  const current = await dbFirst<{ email: string; email_verified_at: string | null; password_hash: string | null }>(
    db,
    `select email, email_verified_at, password_hash from users where id = ? limit 1`,
    [payload.userId]
  );
  if (!current) {
    throw new Error('Pengguna tidak ditemukan.');
  }

  const nextEmail = payload.email.trim().toLowerCase();
  const emailChanged = nextEmail !== current.email.toLowerCase();
  if (emailChanged) {
    if (current.password_hash && !(await verifyPassword(payload.currentPassword || '', current.password_hash))) {
      throw new Error('Kata sandi saat ini salah.');
    }
    const duplicate = await dbFirst<{ id: string }>(
      db,
      `select id from users where lower(email) = lower(?) and id <> ? limit 1`,
      [nextEmail, payload.userId]
    );
    if (duplicate) {
      throw new Error('Email sudah digunakan oleh pengguna lain.');
    }
  }

  await dbRun(
    db,
    `update users
     set full_name = ?, email = ?, email_verified_at = ?, updated_at = ?
     where id = ?`,
    [payload.fullName.trim(), nextEmail, emailChanged ? null : current.email_verified_at, isoNow(), payload.userId]
  );

  const profile = await getUserProfile(db, payload.userId);
  if (!profile) {
    throw new Error('Pengguna tidak ditemukan.');
  }
  return { profile, emailChanged };
}

export async function changeUserPassword(
  db: D1Database,
  payload: { userId: string; currentSessionId: string; currentPassword?: string; newPassword: string }
): Promise<void> {
  const current = await dbFirst<{ password_hash: string | null }>(
    db,
    `select password_hash from users where id = ? limit 1`,
    [payload.userId]
  );
  if (!current) {
    throw new Error('Pengguna tidak ditemukan.');
  }
  if (current.password_hash && !(await verifyPassword(payload.currentPassword || '', current.password_hash))) {
    throw new Error('Kata sandi saat ini salah.');
  }
  if (current.password_hash && await verifyPassword(payload.newPassword, current.password_hash)) {
    throw new Error('Kata sandi baru harus berbeda dari kata sandi saat ini.');
  }

  const passwordHash = await hashPassword(payload.newPassword);
  const now = isoNow();
  await dbRun(db, `update users set password_hash = ?, updated_at = ? where id = ?`, [passwordHash, now, payload.userId]);
  await dbRun(
    db,
    `update auth_sessions set revoked_at = ? where user_id = ? and id <> ? and revoked_at is null`,
    [now, payload.userId, payload.currentSessionId]
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
       set google_sub = ?, auth_provider = 'google', is_placeholder = 0, full_name = ?, avatar_url = ?, email_verified_at = coalesce(email_verified_at, ?), updated_at = ?
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
  const owner = await dbFirst<{ id: string }>(
    db,
    `select id from users where id = ? limit 1`,
    [payload.ownerUserId]
  );
  if (!owner) {
    throw new Error('User owner tidak ditemukan.');
  }

  const organizationId = randomId();
  const organizationSlug = await generateOrganizationSlug(db, {
    name: payload.name,
    ownerUserId: payload.ownerUserId,
  });

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
