import { createArticle, type ArticleRow } from './articles';

type GeneratedArticle = {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  contentHtml: string;
  seoTitle: string;
  seoDescription: string;
  thumbnailPrompt: string;
  thumbnailAlt: string;
  readingMinutes: number;
};

export type GenerateArticleInput = {
  niche: string;
  targetMarket: string;
  mainKeyword: string;
  topic?: string;
  tone?: string;
  status?: 'draft' | 'published';
  actorUserId?: string | null;
};

type OpenAIConfig = {
  apiKey?: string;
  textModel?: string;
  imageModel?: string;
};

function extractResponseText(payload: any): string {
  if (typeof payload.output_text === 'string') {
    return payload.output_text;
  }

  const chunks: string[] = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('\n').trim();
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function generateArticleDraft(config: OpenAIConfig, input: GenerateArticleInput): Promise<GeneratedArticle> {
  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY belum dikonfigurasi.');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.textModel || 'gpt-5.2',
      input: [
        {
          role: 'system',
          content:
            'Anda adalah SEO content strategist B2B SaaS berbahasa Indonesia. Tulis artikel long-form yang praktis, mendalam, tidak berlebihan, dan relevan untuk ValueLoop. Output harus valid JSON sesuai schema.',
        },
        {
          role: 'user',
          content: [
            `Niche: ${input.niche}`,
            `Target market: ${input.targetMarket}`,
            `Keyword utama: ${input.mainKeyword}`,
            `Topik opsional: ${input.topic || '-'}`,
            `Tone: ${input.tone || 'profesional, jelas, actionable'}`,
            'Buat artikel SEO long-form 1600-2200 kata dalam HTML sederhana.',
            'Keyword utama WAJIB muncul minimal 5 kali secara natural di artikel: minimal 1 kali di title, 1 kali di excerpt, 1 kali di paragraf pembuka contentHtml, 1 kali di salah satu h2, dan minimal 1 kali lagi di body. Jangan keyword stuffing; tetap enak dibaca.',
            'Struktur artikel harus lengkap: pembuka yang menjawab search intent, 5-8 section h2, beberapa h3 bila perlu, bullet list praktis, contoh penerapan, kesalahan umum, langkah implementasi, dan penutup soft CTA ke ValueLoop.',
            'seoTitle harus mengandung keyword utama dan maksimal 65 karakter bila memungkinkan. seoDescription harus mengandung keyword utama dan maksimal 160 karakter bila memungkinkan.',
            'Gunakan hanya tag p, h2, h3, ul, ol, li, strong. Jangan gunakan h1, script, style, table, iframe, atau link eksternal.',
            'Thumbnail harus berupa prompt visual profesional untuk blog B2B SaaS, tanpa teks di dalam gambar.',
          ].join('\n'),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'valueloop_article',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'title',
              'slug',
              'excerpt',
              'category',
              'contentHtml',
              'seoTitle',
              'seoDescription',
              'thumbnailPrompt',
              'thumbnailAlt',
              'readingMinutes',
            ],
            properties: {
              title: { type: 'string' },
              slug: { type: 'string' },
              excerpt: { type: 'string' },
              category: { type: 'string' },
              contentHtml: { type: 'string' },
              seoTitle: { type: 'string' },
              seoDescription: { type: 'string' },
              thumbnailPrompt: { type: 'string' },
              thumbnailAlt: { type: 'string' },
              readingMinutes: { type: 'integer' },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error('Gagal membuat draft artikel dengan AI.');
  }

  const payload = await response.json();
  return JSON.parse(extractResponseText(payload)) as GeneratedArticle;
}

async function generateThumbnail(config: OpenAIConfig, prompt: string): Promise<Uint8Array> {
  if (!config.apiKey) {
    throw new Error('OPENAI_API_KEY belum dikonfigurasi.');
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.imageModel || 'gpt-image-1',
      prompt,
      size: '1536x1024',
    }),
  });

  if (!response.ok) {
    throw new Error('Gagal membuat thumbnail artikel.');
  }

  const payload = await response.json<any>();
  const image = payload.data?.[0];
  if (image?.b64_json) {
    return base64ToBytes(image.b64_json);
  }
  if (image?.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) {
      throw new Error('Gagal mengunduh thumbnail artikel.');
    }
    return new Uint8Array(await imageResponse.arrayBuffer());
  }

  throw new Error('Respons thumbnail AI tidak valid.');
}

export async function generateArticleWithAi(
  db: D1Database,
  r2: R2Bucket,
  config: OpenAIConfig,
  input: GenerateArticleInput
): Promise<ArticleRow> {
  const draft = await generateArticleDraft(config, input);
  const thumbnailBytes = await generateThumbnail(config, draft.thumbnailPrompt);
  const articleId = crypto.randomUUID();
  const thumbnailKey = `articles/${articleId}/thumbnail.png`;

  await r2.put(thumbnailKey, thumbnailBytes, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  return createArticle(db, {
    title: draft.title,
    slug: draft.slug,
    excerpt: draft.excerpt,
    contentHtml: draft.contentHtml,
    category: draft.category,
    status: input.status || 'draft',
    authorName: 'Admin ValueLoop',
    thumbnailR2Key: thumbnailKey,
    thumbnailAlt: draft.thumbnailAlt,
    niche: `${input.niche} | Keyword: ${input.mainKeyword}`,
    targetMarket: input.targetMarket,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    readingMinutes: draft.readingMinutes,
    actorUserId: input.actorUserId ?? null,
  });
}
