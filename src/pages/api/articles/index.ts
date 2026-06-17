import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { json } from '../../../lib/http/response';
import { listPublishedArticles } from '../../../lib/services/articles';

export const GET: APIRoute = async ({ locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return json({ ok: false, articles: [] }, { status: 500 });
  }

  const articles = await listPublishedArticles(runtime.env.DB);
  return json({ ok: true, articles });
};
