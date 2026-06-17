import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../lib/cloudflare/bindings';
import { json } from '../../../lib/http/response';
import { getArticleBySlug } from '../../../lib/services/articles';

export const GET: APIRoute = async ({ params, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return json({ ok: false, article: null }, { status: 500 });
  }

  const article = await getArticleBySlug(runtime.env.DB, params.slug || '');
  if (!article) {
    return json({ ok: false, article: null }, { status: 404 });
  }

  return json({ ok: true, article });
};
