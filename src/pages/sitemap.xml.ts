import type { APIRoute } from 'astro';
import { getCloudflareRuntime } from '../lib/cloudflare/bindings';
import { listPublishedArticles } from '../lib/services/articles';
import { toIsoDate } from '../lib/utils/iso-date';

// Indexable public pages. Keep in sync with the public routes in middleware.ts.
const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/fitur', priority: '0.8', changefreq: 'monthly' },
  { path: '/preview', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog', priority: '0.7', changefreq: 'weekly' },
  { path: '/panduan', priority: '0.6', changefreq: 'monthly' },
  { path: '/studi-kasus', priority: '0.6', changefreq: 'monthly' },
  { path: '/bantuan', priority: '0.4', changefreq: 'monthly' },
  { path: '/signup', priority: '0.5', changefreq: 'yearly' },
  { path: '/login', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
  { path: '/terms', priority: '0.2', changefreq: 'yearly' },
];

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ url, locals }) => {
  const origin = url.origin;
  const entries = STATIC_PAGES.map((page) => ({
    loc: `${origin}${page.path}`,
    lastmod: null as string | null,
    priority: page.priority,
    changefreq: page.changefreq,
  }));

  const db = getCloudflareRuntime(locals)?.env?.DB;
  if (db) {
    try {
      const articles = await listPublishedArticles(db);
      for (const article of articles) {
        entries.push({
          loc: `${origin}/blog/${encodeURIComponent(article.slug)}`,
          lastmod: toIsoDate(article.updated_at || article.published_at),
          priority: '0.6',
          changefreq: 'monthly',
        });
      }
    } catch {
      // Sitemap still lists the static pages if D1 is unavailable.
    }
  }

  const urls = entries
    .map((entry) =>
      [
        '  <url>',
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : '',
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
