import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../../../../lib/cloudflare/bindings';
import { readFormDataValue, readJsonBody } from '../../../../lib/http/forms';
import { json } from '../../../../lib/http/response';
import { generateArticleWithAi } from '../../../../lib/services/article-ai';
import { articleAiGenerateSchema } from '../../../../lib/validations';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = getCloudflareRuntime(locals);
  if (!runtime?.env?.DB || !runtime.env.R2) {
    return new Response('Konfigurasi runtime tidak tersedia.', { status: 500 });
  }
  if (locals.user?.platform_role !== 'platform_admin') {
    return new Response('Anda tidak memiliki izin platform admin.', { status: 403 });
  }

  const contentType = request.headers.get('content-type') || '';
  const input = contentType.includes('application/json')
    ? await readJsonBody(request)
    : {
        niche: await readFormDataValue(request, 'niche'),
        targetMarket: await readFormDataValue(request, 'targetMarket'),
        mainKeyword: await readFormDataValue(request, 'mainKeyword'),
        topic: await readFormDataValue(request, 'topic'),
        tone: await readFormDataValue(request, 'tone'),
        status: await readFormDataValue(request, 'status'),
      };

  const parsed = articleAiGenerateSchema.parse(input);
  const article = await generateArticleWithAi(
    runtime.env.DB,
    runtime.env.R2,
    {
      apiKey: runtime.env.OPENAI_API_KEY,
      textModel: runtime.env.OPENAI_TEXT_MODEL,
      imageModel: runtime.env.OPENAI_IMAGE_MODEL,
    },
    {
      niche: parsed.niche,
      targetMarket: parsed.targetMarket,
      mainKeyword: parsed.mainKeyword,
      topic: parsed.topic,
      tone: parsed.tone,
      status: parsed.status,
      actorUserId: locals.user.id,
    }
  );

  if (contentType.includes('application/json')) {
    return json({ ok: true, article }, { status: 201 });
  }

  return new Response(null, { status: 302, headers: { Location: '/platform/articles' } });
};
