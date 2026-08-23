import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { json } from '../../../lib/http/response';
import { listNotifications } from '../../../lib/notifications/service';

export const GET: APIRoute = async ({ url, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.DB || !locals.organization || !locals.membership) return json({ ok: false, message: 'Sesi organisasi tidak tersedia.' }, { status: 403 });
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 50);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
  const unread = url.searchParams.get('unread') === 'true';
  const notifications = await listNotifications(runtime.env.DB, locals.organization.id, locals.membership.id, { unread, limit, offset });
  return json({ ok: true, notifications: notifications.map(n => ({ ...n, payload: JSON.parse(n.payload || '{}') })) });
};
