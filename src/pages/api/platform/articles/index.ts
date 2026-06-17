import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { json } from '../../../../lib/http/response';
import { createArticle } from '../../../../lib/services/articles';
import { articleSchema } from '../../../../lib/validations';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }
  if (locals.user?.platform_role !== 'platform_admin') {
    return new Response('Anda tidak memiliki izin platform admin.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody(request)
    : {
        title: await readFormDataValue(request, 'title'),
        slug: await readFormDataValue(request, 'slug'),
        excerpt: await readFormDataValue(request, 'excerpt'),
        contentHtml: await readFormDataValue(request, 'contentHtml'),
        category: await readFormDataValue(request, 'category'),
        status: await readFormDataValue(request, 'status'),
        authorName: await readFormDataValue(request, 'authorName'),
        thumbnailR2Key: await readFormDataValue(request, 'thumbnailR2Key'),
        thumbnailAlt: await readFormDataValue(request, 'thumbnailAlt'),
        niche: await readFormDataValue(request, 'niche'),
        targetMarket: await readFormDataValue(request, 'targetMarket'),
        seoTitle: await readFormDataValue(request, 'seoTitle'),
        seoDescription: await readFormDataValue(request, 'seoDescription'),
        readingMinutes: await readFormDataValue(request, 'readingMinutes'),
      };

  const parsed = articleSchema.parse(input);
  const article = await createArticle(runtime.env.DB, {
    title: parsed.title,
    slug: parsed.slug,
    excerpt: parsed.excerpt,
    contentHtml: parsed.contentHtml,
    category: parsed.category,
    status: parsed.status,
    authorName: parsed.authorName,
    thumbnailR2Key: parsed.thumbnailR2Key || null,
    thumbnailAlt: parsed.thumbnailAlt || null,
    niche: parsed.niche || null,
    targetMarket: parsed.targetMarket || null,
    seoTitle: parsed.seoTitle || null,
    seoDescription: parsed.seoDescription || null,
    readingMinutes: parsed.readingMinutes,
    actorUserId: locals.user.id,
  });

  if (contentType.includes('application/json')) {
    return json({ ok: true, article }, { status: 201 });
  }

  return new Response(null, { status: 302, headers: { Location: '/platform/articles' } });
};
