import type { APIContext } from 'astro';
import type { OrganizationRole } from '../permissions';

export function requireUser(context: APIContext) {
  if (!context.locals.user) {
    throw new Response('Tidak diautentikasi.', { status: 401 });
  }
  return context.locals.user;
}

export function requireOrganization(context: APIContext) {
  if (!context.locals.organization || !context.locals.membership) {
    throw new Response('Organisasi tidak tersedia.', { status: 403 });
  }
  return { organization: context.locals.organization, membership: context.locals.membership };
}

export function requireRole(context: APIContext, allowed: OrganizationRole[]) {
  const { membership } = requireOrganization(context);
  if (!allowed.includes(membership.role)) {
    throw new Response('Anda tidak memiliki izin untuk aksi ini.', { status: 403 });
  }
  return membership;
}
