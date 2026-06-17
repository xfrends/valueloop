create table articles (
  id text primary key,
  title text not null,
  slug text not null unique,
  excerpt text not null,
  content_html text not null,
  category text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  author_name text not null default 'Admin ValueLoop',
  thumbnail_r2_key text,
  thumbnail_alt text,
  niche text,
  target_market text,
  seo_title text,
  seo_description text,
  reading_minutes integer not null default 5,
  published_at text,
  created_by_user_id text references users(id) on delete set null,
  updated_by_user_id text references users(id) on delete set null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);

create index idx_articles_status_published on articles(status, published_at);
create index idx_articles_category on articles(category);

insert or ignore into articles (
  id,
  title,
  slug,
  excerpt,
  content_html,
  category,
  status,
  author_name,
  thumbnail_alt,
  niche,
  target_market,
  seo_title,
  seo_description,
  reading_minutes,
  published_at
) values (
  'article-core-values-live',
  'Pentingnya Core Value Perusahaan yang Hidup, Bukan Sekadar Slogan',
  'pentingnya-core-value-perusahaan',
  'Bagaimana mengubah core value dari tulisan di dinding menjadi kebiasaan sehari-hari yang memacu produktivitas dan loyalitas tim.',
  '<p>Banyak perusahaan menghabiskan waktu berbulan-bulan dan biaya besar untuk merumuskan core value. Namun, apa yang terjadi setelah dokumen itu selesai? Seringkali, core value hanya berakhir sebagai pajangan dinding di lobi kantor atau dokumen PDF yang terlupakan saat onboarding.</p><h2>Mengapa Core Value Sering Gagal Menjadi Budaya?</h2><p>Masalah utama dari core value tradisional adalah ketiadaan mekanisme untuk mengintegrasikannya ke dalam pekerjaan sehari-hari. Karyawan mungkin hafal dengan singkatan nilai perusahaan, tetapi jika mereka tidak tahu bagaimana menerapkannya saat menghadapi keluhan pelanggan, berdebat dengan rekan kerja, atau mengambil keputusan sulit, maka core value tersebut gagal berfungsi.</p><p>Core value tidak bisa ditanamkan hanya dengan sosialisasi tahunan atau poster yang indah. Budaya dibentuk oleh kebiasaan dan perilaku yang diulang setiap hari.</p><h2>Ubah Slogan Menjadi Praktik Nyata</h2><p>Untuk menghidupkan core value, perusahaan harus beralih dari pendekatan pasif ke pendekatan aktif: dari doktrin menjadi cerita, dari evaluasi tahunan menjadi refleksi harian, dan dari top-down menjadi peer-to-peer.</p><h2>Bagaimana ValueLoop Membantu?</h2><p>ValueLoop membantu organisasi mengubah core value menjadi challenge, pertanyaan reflektif, jawaban member, scoring manual, leaderboard, history, dan insights yang dapat diulang secara konsisten.</p>',
  'Budaya Kerja',
  'published',
  'Admin ValueLoop',
  'Ilustrasi tim sedang menghidupkan core value perusahaan dalam rutinitas kerja',
  'Budaya kerja dan core values',
  'Founder, HR, People Ops, dan leader di perusahaan kecil-menengah',
  'Pentingnya Core Value Perusahaan yang Hidup | Blog ValueLoop',
  'Pelajari mengapa core value perusahaan sering gagal dan bagaimana mengubahnya menjadi rutinitas harian yang membentuk budaya kerja sejati.',
  5,
  current_timestamp
);
