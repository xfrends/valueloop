import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { json } from '../../../lib/http/response';
import { unreadNotificationCount } from '../../../lib/notifications/service';

export const GET: APIRoute = async ({ locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Sesi organisasi tidak tersedia.' }, { status: 403 });
  return json({ ok: true, count: await unreadNotificationCount(runtime.env.DB, locals.organization.id, locals.membership.id) });
};
