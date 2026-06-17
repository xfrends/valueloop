import { dbAll, dbFirst, dbRun } from '../db/client';
import { randomId } from '../utils/crypto';
import { isoNow } from '../utils/date';
import { slugify } from '../utils/slug';

export type ArticleStatus = 'draft' | 'published' | 'archived';

export type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content_html: string;
  category: string;
  status: ArticleStatus;
  author_name: string;
  thumbnail_r2_key: string | null;
  thumbnail_alt: string | null;
  niche: string | null;
  target_market: string | null;
  seo_title: string | null;
  seo_description: string | null;
  reading_minutes: number;
  published_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ArticleInput = {
  title: string;
  slug?: string;
  excerpt: string;
  contentHtml: string;
  category: string;
  status: ArticleStatus;
  authorName?: string;
  thumbnailR2Key?: string | null;
  thumbnailAlt?: string | null;
  niche?: string | null;
  targetMarket?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  readingMinutes?: number;
  actorUserId?: string | null;
};

export async function listPublishedArticles(db: D1Database): Promise<ArticleRow[]> {
  await ensureDefaultArticle(db);
  return dbAll<ArticleRow>(
    db,
    `select * from articles
     where status = 'published'
     order by coalesce(published_at, created_at) desc`
  );
}

export async function listAllArticles(db: D1Database): Promise<ArticleRow[]> {
  await ensureDefaultArticle(db);
  return dbAll<ArticleRow>(
    db,
    `select * from articles order by updated_at desc`
  );
}

export async function getArticleBySlug(db: D1Database, slug: string, includeDraft = false): Promise<ArticleRow | null> {
  await ensureDefaultArticle(db);
  return dbFirst<ArticleRow>(
    db,
    `select * from articles where slug = ? ${includeDraft ? '' : "and status = 'published'"} limit 1`,
    [slug]
  );
}

async function ensureDefaultArticle(db: D1Database): Promise<void> {
  const existing = await dbFirst<{ count: number }>(db, `select count(*) as count from articles`);
  if (Number(existing?.count ?? 0) > 0) {
    return;
  }

  await dbRun(
    db,
    `insert or ignore into articles (
       id, title, slug, excerpt, content_html, category, status, author_name,
       thumbnail_alt, niche, target_market, seo_title, seo_description, reading_minutes, published_at
     ) values (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, current_timestamp)`,
    [
      'article-core-values-live',
      'Pentingnya Core Value Perusahaan yang Hidup, Bukan Sekadar Slogan',
      'pentingnya-core-value-perusahaan',
      'Bagaimana mengubah core value dari tulisan di dinding menjadi kebiasaan sehari-hari yang memacu produktivitas dan loyalitas tim.',
      '<p>Banyak perusahaan menghabiskan waktu berbulan-bulan dan biaya besar untuk merumuskan core value. Namun, apa yang terjadi setelah dokumen itu selesai? Seringkali, core value hanya berakhir sebagai pajangan dinding di lobi kantor atau dokumen PDF yang terlupakan saat onboarding.</p><h2>Mengapa Core Value Sering Gagal Menjadi Budaya?</h2><p>Masalah utama dari core value tradisional adalah ketiadaan mekanisme untuk mengintegrasikannya ke dalam pekerjaan sehari-hari. Karyawan mungkin hafal dengan singkatan nilai perusahaan, tetapi jika mereka tidak tahu bagaimana menerapkannya saat menghadapi keluhan pelanggan, berdebat dengan rekan kerja, atau mengambil keputusan sulit, maka core value tersebut gagal berfungsi.</p><p>Core value tidak bisa ditanamkan hanya dengan sosialisasi tahunan atau poster yang indah. Budaya dibentuk oleh kebiasaan dan perilaku yang diulang setiap hari.</p><h2>Ubah Slogan Menjadi Praktik Nyata</h2><p>Untuk menghidupkan core value, perusahaan harus beralih dari pendekatan pasif ke pendekatan aktif: dari doktrin menjadi cerita, dari evaluasi tahunan menjadi refleksi harian, dan dari top-down menjadi peer-to-peer.</p><h2>Bagaimana ValueLoop Membantu?</h2><p>ValueLoop membantu organisasi mengubah core value menjadi challenge, pertanyaan reflektif, jawaban member, scoring manual, leaderboard, history, dan insights yang dapat diulang secara konsisten.</p>',
      'Budaya Kerja',
      'Admin ValueLoop',
      'Ilustrasi tim sedang menghidupkan core value perusahaan dalam rutinitas kerja',
      'Budaya kerja dan core values',
      'Founder, HR, People Ops, dan leader di perusahaan kecil-menengah',
      'Pentingnya Core Value Perusahaan yang Hidup | Blog ValueLoop',
      'Pelajari mengapa core value perusahaan sering gagal dan bagaimana mengubahnya menjadi rutinitas harian yang membentuk budaya kerja sejati.',
      5,
    ]
  );
}

export async function getArticleById(db: D1Database, id: string): Promise<ArticleRow | null> {
  return dbFirst<ArticleRow>(db, `select * from articles where id = ? limit 1`, [id]);
}

async function uniqueArticleSlug(db: D1Database, title: string, requestedSlug?: string, ignoreId?: string): Promise<string> {
  const base = slugify(requestedSlug || title) || `artikel-${Date.now()}`;
  let slug = base;
  let counter = 2;
  for (;;) {
    const existing = await dbFirst<{ id: string }>(
      db,
      `select id from articles where slug = ? ${ignoreId ? 'and id != ?' : ''} limit 1`,
      ignoreId ? [slug, ignoreId] : [slug]
    );
    if (!existing) {
      return slug;
    }
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function createArticle(db: D1Database, input: ArticleInput): Promise<ArticleRow> {
  const id = randomId();
  const now = isoNow();
  const slug = await uniqueArticleSlug(db, input.title, input.slug);
  const publishedAt = input.status === 'published' ? now : null;

  await dbRun(
    db,
    `insert into articles (
       id, title, slug, excerpt, content_html, category, status, author_name,
       thumbnail_r2_key, thumbnail_alt, niche, target_market, seo_title, seo_description,
       reading_minutes, published_at, created_by_user_id, updated_by_user_id, created_at, updated_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.title.trim(),
      slug,
      input.excerpt.trim(),
      input.contentHtml.trim(),
      input.category.trim(),
      input.status,
      input.authorName?.trim() || 'Admin ValueLoop',
      input.thumbnailR2Key ?? null,
      input.thumbnailAlt?.trim() || null,
      input.niche?.trim() || null,
      input.targetMarket?.trim() || null,
      input.seoTitle?.trim() || input.title.trim(),
      input.seoDescription?.trim() || input.excerpt.trim(),
      input.readingMinutes ?? estimateReadingMinutes(input.contentHtml),
      publishedAt,
      input.actorUserId ?? null,
      input.actorUserId ?? null,
      now,
      now,
    ]
  );

  return (await getArticleById(db, id)) as ArticleRow;
}

export async function updateArticle(db: D1Database, id: string, input: ArticleInput): Promise<ArticleRow> {
  const before = await getArticleById(db, id);
  if (!before) {
    throw new Error('Artikel tidak ditemukan.');
  }

  const now = isoNow();
  const slug = await uniqueArticleSlug(db, input.title, input.slug, id);
  const publishedAt = input.status === 'published'
    ? before.published_at || now
    : null;

  await dbRun(
    db,
    `update articles
     set title = ?,
         slug = ?,
         excerpt = ?,
         content_html = ?,
         category = ?,
         status = ?,
         author_name = ?,
         thumbnail_r2_key = ?,
         thumbnail_alt = ?,
         niche = ?,
         target_market = ?,
         seo_title = ?,
         seo_description = ?,
         reading_minutes = ?,
         published_at = ?,
         updated_by_user_id = ?,
         updated_at = ?
     where id = ?`,
    [
      input.title.trim(),
      slug,
      input.excerpt.trim(),
      input.contentHtml.trim(),
      input.category.trim(),
      input.status,
      input.authorName?.trim() || 'Admin ValueLoop',
      input.thumbnailR2Key ?? before.thumbnail_r2_key,
      input.thumbnailAlt?.trim() || null,
      input.niche?.trim() || null,
      input.targetMarket?.trim() || null,
      input.seoTitle?.trim() || input.title.trim(),
      input.seoDescription?.trim() || input.excerpt.trim(),
      input.readingMinutes ?? estimateReadingMinutes(input.contentHtml),
      publishedAt,
      input.actorUserId ?? null,
      now,
      id,
    ]
  );

  return (await getArticleById(db, id)) as ArticleRow;
}

export async function deleteArticle(db: D1Database, id: string): Promise<void> {
  await dbRun(db, `delete from articles where id = ?`, [id]);
}

export function estimateReadingMinutes(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}
