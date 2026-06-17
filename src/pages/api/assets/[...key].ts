import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';

export const GET: APIRoute = async ({ params, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  const key = params.key || '';
  if (!runtime?.env?.R2 || !key) {
    return new Response('Asset tidak ditemukan.', { status: 404 });
  }

  const object = await runtime.env.R2.get(key);
  if (!object) {
    return new Response('Asset tidak ditemukan.', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
};
