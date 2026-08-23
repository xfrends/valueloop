import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../lib/cloudflare/bindings';

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env.ORGANIZATION_REALTIME || !locals.user || !locals.organization || !locals.membership) return new Response('Sesi organisasi tidak tersedia.', { status: 403 });
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket diperlukan.', { status: 426 });
  const url = new URL(request.url);
  url.searchParams.set('userId', locals.user.id);
  url.searchParams.set('organizationId', locals.organization.id);
  url.searchParams.set('memberId', locals.membership.id);
  url.searchParams.set('role', locals.membership.role);
  return runtime.env.ORGANIZATION_REALTIME.getByName(locals.organization.id).fetch(new Request(url, request));
};
