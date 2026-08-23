import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { json } from '../../../lib/http/response';
import { markAllNotificationsRead } from '../../../lib/notifications/service';

export const POST: APIRoute = async ({ locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Sesi organisasi tidak tersedia.' }, { status: 403 });
  await markAllNotificationsRead(runtime.env.DB, locals.organization.id, locals.membership.id);
  return json({ ok: true });
};
