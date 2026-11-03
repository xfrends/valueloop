import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';

// Serves R2 objects. Supports HTTP Range requests (206) so video can stream and seek;
// Safari refuses to play media from servers that ignore Range.
export const GET: APIRoute = async ({ params, locals, request }) => {
  const runtime = getCloudflareRuntime(locals);
  const key = params.key || '';
  if (!runtime?.env?.R2 || !key) {
    return new Response('Asset tidak ditemukan.', { status: 404 });
  }

  const wantsRange = request.headers.has('range');
  const object = await runtime.env.R2.get(key, {
    range: wantsRange ? request.headers : undefined,
    onlyIf: request.headers,
  });
  if (!object) {
    return new Response('Asset tidak ditemukan.', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', headers.get('cache-control') || 'public, max-age=31536000, immutable');

  // onlyIf matched an If-None-Match / If-Modified-Since precondition: no body is returned.
  if (!('body' in object)) {
    return new Response(null, { status: 304, headers });
  }

  const range = wantsRange ? object.range : undefined;
  if (range) {
    let offset = 0;
    let length = object.size;
    if ('suffix' in range && typeof range.suffix === 'number') {
      length = Math.min(range.suffix, object.size);
      offset = object.size - length;
    } else {
      offset = 'offset' in range && typeof range.offset === 'number' ? range.offset : 0;
      length = 'length' in range && typeof range.length === 'number' ? range.length : object.size - offset;
    }
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
};
