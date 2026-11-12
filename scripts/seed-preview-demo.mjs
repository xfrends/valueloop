#!/usr/bin/env node
// Seed workspace demo ("Arunika Studio") ke D1 LOKAL untuk bahan screenshot halaman /preview.
// Semua nama, jawaban, dan angka adalah data contoh. Aman dijalankan ulang: data demo lama dihapus dulu.
//
//   node scripts/seed-preview-demo.mjs            -> seed + cetak token sesi
//   node scripts/seed-preview-demo.mjs --remove   -> hapus data demo
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const d1Dir = join(rootDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const dbFile = readdirSync(d1Dir).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (!dbFile) throw new Error('D1 lokal belum ada. Jalankan `npm run db:migrate:local` dulu.');
const dbPath = join(d1Dir, dbFile);

export const DEMO_ORG_ID = 'demo-org';
export const DEMO_SESSION_TOKEN = 'valueloop-preview-demo-session';
const TZ = 'Asia/Jakarta';

const q = (value) => (value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`);
const sql = [];
const insert = (table, row) => sql.push(`insert into ${table} (${Object.keys(row).join(', ')}) values (${Object.values(row).map((v) => (typeof v === 'number' ? v : q(v))).join(', ')});`);

// PRNG deterministik supaya hasil seed (dan screenshot) stabil antar-run.
let seed = 20240318;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (list) => list[Math.floor(rand() * list.length)];

const orgDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const today = orgDate(new Date());
const dayOffset = (offset) => { const d = new Date(`${today}T03:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d; };

const cleanup = `
pragma foreign_keys = on;
delete from challenge_sessions where organization_id = '${DEMO_ORG_ID}';
delete from organizations where id = '${DEMO_ORG_ID}';
delete from users where id like 'demo-user-%';
`;

if (process.argv.includes('--remove')) {
  execFileSync('sqlite3', ['-cmd', '.timeout 10000', dbPath], { input: cleanup });
  console.log('Data demo dihapus.');
  process.exit(0);
}

const createdAt = dayOffset(-75).toISOString();

insert('organizations', { id: DEMO_ORG_ID, name: 'Arunika Studio', slug: 'arunika-studio-demo', timezone: TZ, default_locale: 'id', status: 'active', created_at: createdAt, updated_at: createdAt });
insert('organization_settings', { organization_id: DEMO_ORG_ID, updated_at: createdAt });
sql.push(`insert into subscriptions (id, organization_id, plan_id, status, created_at, updated_at) select 'demo-sub', '${DEMO_ORG_ID}', id, 'active', ${q(createdAt)}, ${q(createdAt)} from plans where code = 'free' limit 1;`);

// [nama, role, tim]
const people = [
  ['Rian Pratama', 'owner', 'Product'],
  ['Sari Wulandari', 'admin', 'Product'],
  ['Dimas Nugroho', 'facilitator', 'Operations'],
  ['Nadia Kusuma', 'member', 'Design'],
  ['Bima Santoso', 'member', 'Engineering'],
  ['Laras Anindita', 'member', 'Design'],
  ['Yoga Permana', 'member', 'Engineering'],
  ['Citra Maharani', 'member', 'Customer Success'],
  ['Fajar Hidayat', 'member', 'Engineering'],
  ['Intan Paramitha', 'member', 'Customer Success'],
  ['Galih Saputra', 'member', 'Operations'],
  ['Maya Lestari', 'member', 'Product'],
];
const teams = {
  Product: 'Riset, roadmap, dan prioritas produk.',
  Design: 'Pengalaman pengguna dan identitas visual.',
  Engineering: 'Membangun dan menjaga kualitas platform.',
  'Customer Success': 'Onboarding dan pendampingan klien.',
  Operations: 'Keuangan, people, dan operasional harian.',
};
Object.entries(teams).forEach(([name, description], i) => insert('teams', { id: `demo-team-${i + 1}`, organization_id: DEMO_ORG_ID, name, description, created_at: createdAt, updated_at: createdAt }));
const teamId = (name) => `demo-team-${Object.keys(teams).indexOf(name) + 1}`;

const members = people.map(([fullName, role, team], i) => {
  const userId = `demo-user-${i + 1}`;
  const memberId = `demo-member-${i + 1}`;
  const email = `${fullName.split(' ')[0].toLowerCase()}@arunika.example`;
  insert('users', { id: userId, full_name: fullName, email, email_verified_at: createdAt, created_at: createdAt, updated_at: createdAt });
  insert('organization_members', { id: memberId, organization_id: DEMO_ORG_ID, user_id: userId, role, status: 'active', joined_at: createdAt, accepted_at: createdAt, created_at: createdAt, updated_at: createdAt });
  insert('team_members', { id: `demo-tm-${i + 1}`, organization_id: DEMO_ORG_ID, team_id: teamId(team), organization_member_id: memberId, created_at: createdAt });
  return { memberId, fullName, role };
});

// skill: rata-rata skor per value, dipakai agar insights punya value "kuat" dan "perlu perhatian".
const values = [
  { name: 'Customer Obsession', color: '#4F46E5', skill: 8.4, short: 'Mulai dari kebutuhan pelanggan, lalu bekerja mundur.',
    behaviors: ['Menanyakan konteks pelanggan sebelum menawarkan solusi', 'Menutup setiap keluhan dengan kabar balik'], anti: ['Menganggap tiket selesai tanpa konfirmasi pelanggan'],
    questions: [
      ['Ceritakan satu keputusan minggu ini yang Anda ubah setelah mendengar langsung dari pelanggan.', 'medium'],
      ['Kapan terakhir kali Anda menolak permintaan internal demi kepentingan pelanggan? Apa pertimbangannya?', 'hard'],
      ['Apa satu hal kecil yang Anda lakukan hari ini supaya pelanggan merasa didengar?', 'easy'],
    ],
    answers: [
      'Kemarin saya ikut sesi onboarding klien baru dan baru sadar istilah di menu laporan membingungkan mereka. Saya ubah prioritas sprint: label diperbaiki dulu sebelum fitur ekspor, lalu saya kabari klien tersebut begitu rilis.',
      'Seorang klien mengeluh invoice-nya terlambat terkirim. Saya telepon langsung, minta maaf, lalu menelusuri penyebabnya bersama tim engineering. Sekarang ada pengingat otomatis H-1 supaya tidak terulang.',
      'Saya membaca ulang sepuluh tiket terakhir dan menemukan pola pertanyaan yang sama soal reset kata sandi. Saya tulis panduan singkat dan menaruh tautannya di halaman login.',
    ] },
  { name: 'Ownership', color: '#10B981', skill: 8.9, short: 'Tuntaskan sampai selesai, bukan sampai diserahkan.',
    behaviors: ['Mengabari lebih awal saat ada risiko meleset', 'Menindaklanjuti pekerjaan sampai berdampak'], anti: ['Menunggu disuruh', 'Melempar masalah tanpa usulan'],
    questions: [
      ['Ceritakan masalah yang bukan tanggung jawab Anda, tetapi tetap Anda selesaikan.', 'medium'],
      ['Kapan Anda mengakui kesalahan lebih dulu sebelum orang lain menemukannya?', 'hard'],
      ['Pekerjaan apa yang Anda tindak lanjuti sampai benar-benar dipakai orang?', 'easy'],
    ],
    answers: [
      'Saat rilis Kamis, saya melihat skrip migrasi tim lain gagal di staging. Itu bukan modul saya, tapi saya perbaiki, tulis catatannya, dan memastikan pemiliknya tahu sebelum jam rilis.',
      'Saya salah mengirim penawaran dengan harga lama. Begitu sadar, saya langsung menghubungi klien, mengirim revisi, dan menambahkan pengecekan harga di checklist tim supaya tidak terulang.',
      'Dashboard yang saya buat bulan lalu ternyata jarang dibuka. Saya tanya tiga pengguna, memangkas grafik yang tidak dipakai, dan sekarang dipakai tiap rapat Senin.',
    ] },
  { name: 'Collaboration', color: '#F59E0B', skill: 6.6, short: 'Menang bersama lebih penting daripada benar sendirian.',
    behaviors: ['Melibatkan tim lain sejak perencanaan', 'Memberi umpan balik yang jelas dan sopan'], anti: ['Bekerja di silo', 'Menyimpan informasi penting'],
    questions: [
      ['Ceritakan saat Anda meminta bantuan tim lain lebih awal dari biasanya. Apa hasilnya?', 'easy'],
      ['Bagaimana Anda menangani perbedaan pendapat terakhir dengan rekan satu tim?', 'medium'],
      ['Informasi apa yang Anda bagikan minggu ini agar pekerjaan tim lain lebih mudah?', 'easy'],
    ],
    answers: [
      'Saya biasanya meminta review desain di akhir. Minggu ini saya ajak engineering sejak sketsa pertama, dan dua batasan teknis ketahuan sebelum saya menggambar terlalu jauh.',
      'Saya dan Bima berbeda pendapat soal urutan rilis. Kami tulis risiko masing-masing di satu dokumen, lalu sepakat merilis bertahap. Belum sempurna, tapi tidak ada yang merasa dipaksa.',
      'Saya membagikan catatan panggilan klien ke kanal tim produk. Jujur baru sekali saya lakukan, dan seharusnya ini jadi kebiasaan mingguan.',
    ] },
  { name: 'Integrity', color: '#0EA5E9', skill: 8.1, short: 'Jujur pada data, janji, dan satu sama lain.',
    behaviors: ['Menyampaikan kabar buruk apa adanya', 'Menepati komitmen atau mengabari sebelum meleset'], anti: ['Mempercantik angka laporan'],
    questions: [
      ['Kapan Anda menyampaikan kabar yang tidak enak didengar secara terbuka?', 'medium'],
      ['Ceritakan janji kecil yang Anda tepati minggu ini meski merepotkan.', 'easy'],
      ['Pernahkah Anda menolak mempercantik angka atau laporan? Ceritakan.', 'hard'],
    ],
    answers: [
      'Target kuartal kami kemungkinan meleset 15%. Saya sampaikan angkanya apa adanya di rapat pimpinan berikut tiga penyebab utamanya, bukan menunggu akhir kuartal.',
      'Saya berjanji mengirim rekap ke klien sebelum pukul lima. Rapat molor, jadi saya minta izin keluar sepuluh menit untuk mengirimnya tepat waktu.',
      'Saat menyusun laporan retensi, ada permintaan memakai definisi pengguna aktif yang lebih longgar. Saya tetap pakai definisi lama dan menambahkan catatan pembanding agar konsisten.',
    ] },
  { name: 'Continuous Learning', color: '#EC4899', skill: 7.5, short: 'Belajar sedikit setiap hari, lalu bagikan.',
    behaviors: ['Mencoba hal baru dalam skala kecil', 'Menulis pelajaran dari setiap proyek'], anti: ['Mengulang kesalahan yang sama'],
    questions: [
      ['Apa hal baru yang Anda pelajari minggu ini dan sudah Anda terapkan?', 'easy'],
      ['Ceritakan kegagalan terakhir Anda dan apa yang Anda ubah setelahnya.', 'medium'],
      ['Pengetahuan apa yang Anda bagikan ke tim bulan ini?', 'easy'],
    ],
    answers: [
      'Saya belajar menulis query window function dari Yoga. Laporan mingguan yang tadinya saya susun manual 40 menit sekarang selesai dalam sekali jalan.',
      'Presentasi saya ke klien bulan lalu terlalu teknis dan mereka kehilangan arah. Sekarang saya selalu membuka dengan satu halaman ringkasan dampak, baru masuk ke detail.',
      'Saya membuat sesi berbagi 20 menit tentang cara membaca heatmap. Enam orang hadir, dan dua di antaranya langsung memakainya untuk halaman checkout.',
    ] },
];

const notes = {
  high: ['Contoh spesifik, ada dampak yang terukur, dan tindak lanjutnya jelas.', 'Jawaban konkret dan langsung mencerminkan perilaku yang diharapkan.', 'Sangat relevan. Inisiatifnya bisa jadi contoh untuk tim lain.'],
  mid: ['Arah sudah tepat. Akan lebih kuat bila disertai dampak yang terukur.', 'Contohnya jelas, tetapi tindak lanjutnya belum terlihat.', 'Baik. Coba ceritakan apa yang akan dilakukan berbeda lain kali.'],
  low: ['Masih umum. Perlu contoh kejadian nyata, bukan niat.', 'Belum terlihat perilaku yang bisa diamati. Coba pakai satu kejadian spesifik.'],
};

values.forEach((value, vi) => {
  value.id = `demo-value-${vi + 1}`;
  insert('core_values', { id: value.id, organization_id: DEMO_ORG_ID, name: value.name, short_description: value.short, description: value.short, expected_behaviors: JSON.stringify(value.behaviors), anti_patterns: JSON.stringify(value.anti), color: value.color, icon_name: 'star', sort_order: vi + 1, created_at: createdAt, updated_at: createdAt });
  value.questions = value.questions.map(([text, difficulty], qi) => {
    const id = `demo-question-${vi + 1}-${qi + 1}`;
    insert('questions', { id, organization_id: DEMO_ORG_ID, core_value_id: value.id, question_text: text, difficulty, suggested_rubric_note: 'Cari contoh kejadian nyata, tindakan yang diambil, dan dampaknya.', created_by_member_id: members[0].memberId, created_at: createdAt, updated_at: createdAt });
    return { id, text };
  });
});

// Satu challenge per hari kerja selama ±8 minggu. Dua member terakhir sengaja jarang terpilih
// dan Collaboration lebih sering dilewati, supaya insights menampilkan hal yang perlu perhatian.
const evaluators = members.filter((m) => ['owner', 'admin', 'facilitator'].includes(m.role));
const memberBias = [0.3, 0.9, 0.5, 0.4, 0.1, 0.2, -0.2, 0.0, -0.4, 0.1, -0.6, -0.1];
let sessionCount = 0;
for (let offset = -56; offset <= -1; offset += 1) {
  const date = dayOffset(offset);
  if ([0, 6].includes(date.getUTCDay())) continue;
  if (rand() < 0.07) continue; // sesekali tidak ada sesi
  const roundNo = Math.floor(sessionCount / 10) + 1;
  const memberIndex = sessionCount % 10 === 9 && rand() < 0.5 ? 10 + Math.floor(rand() * 2) : (sessionCount * 7 + Math.floor(rand() * 3)) % 10;
  const member = members[memberIndex];
  const value = values[(sessionCount + (rand() < 0.25 ? 1 : 0)) % values.length];
  const qi = Math.floor(rand() * value.questions.length);
  const trend = (offset + 56) / 56 * 0.9; // skor perlahan membaik
  const score = Math.max(3, Math.min(10, Math.round(value.skill - 0.6 + trend + memberBias[memberIndex] + (rand() - 0.5) * 2.4)));
  const evaluator = pick(evaluators.filter((e) => e.memberId !== member.memberId));
  const started = new Date(date.getTime() - 60 * 60 * 1000 + Math.floor(rand() * 40) * 60 * 1000); // ±09.00-09.40 WIB
  const answered = new Date(started.getTime() + (6 + Math.floor(rand() * 9)) * 60 * 1000);
  const scored = new Date(answered.getTime() + (3 + Math.floor(rand() * 6)) * 60 * 1000);
  insert('challenge_sessions', {
    id: `demo-session-${String(sessionCount + 1).padStart(3, '0')}`, organization_id: DEMO_ORG_ID, session_date: orgDate(date), sequence_no: 1, round_no: roundNo,
    selected_member_id: member.memberId, core_value_id: value.id, question_id: value.questions[qi].id,
    answer_text: value.answers[qi], answered_at: answered.toISOString(), score, evaluator_member_id: evaluator.memberId,
    evaluator_note: pick(score >= 8 ? notes.high : score >= 6 ? notes.mid : notes.low), status: 'scored',
    created_by_member_id: evaluator.memberId, created_at: started.toISOString(), updated_at: scored.toISOString(),
  });
  sessionCount += 1;
}

// Challenge hari ini: sudah dijawab, menunggu penilaian. Script capture mengubah statusnya
// sementara untuk memotret tampilan "terbuka" dan "menunggu penilaian".
const todayStart = new Date(`${today}T02:05:00Z`);
insert('challenge_sessions', {
  id: 'demo-session-today', organization_id: DEMO_ORG_ID, session_date: today, sequence_no: 1, round_no: Math.floor(sessionCount / 10) + 1,
  selected_member_id: members[7].memberId, core_value_id: values[0].id, question_id: values[0].questions[0].id,
  answer_text: values[0].answers[0], answered_at: new Date(todayStart.getTime() + 9 * 60 * 1000).toISOString(), status: 'answered',
  created_by_member_id: members[0].memberId, created_at: todayStart.toISOString(), updated_at: todayStart.toISOString(),
});

[
  ['challenge.answered', 'Jawaban masuk', 'Citra Maharani menjawab challenge Customer Obsession.', null],
  ['challenge.started', 'Challenge baru', 'Challenge hari ini telah dimulai.', null],
  ['challenge.scored', 'Challenge dinilai', 'Jawaban Bima Santoso mendapat skor 9.', dayOffset(-1).toISOString()],
].forEach(([type, title, message, readAt], i) => insert('notifications', {
  id: `demo-notif-${i + 1}`, organization_id: DEMO_ORG_ID, recipient_member_id: members[0].memberId, type, title, message,
  entity_type: 'challenge_session', entity_id: 'demo-session-today', payload: '{}', source_event_id: `demo-event-${i + 1}`, read_at: readAt,
  created_at: new Date(todayStart.getTime() + (10 - i * 5) * 60 * 1000).toISOString(),
}));

insert('auth_sessions', {
  id: 'demo-auth-session', user_id: 'demo-user-1', token_hash: createHash('sha256').update(DEMO_SESSION_TOKEN).digest('hex'),
  expires_at: dayOffset(30).toISOString(), created_at: new Date().toISOString(),
});

execFileSync('sqlite3', ['-cmd', '.timeout 10000', dbPath], { input: `${cleanup}\nbegin;\n${sql.join('\n')}\ncommit;\n` });
console.log(`Seed demo selesai: ${members.length} member, ${values.length} values, ${sessionCount + 1} challenge.`);
console.log(`Cookie: valueloop_session=${DEMO_SESSION_TOKEN}; valueloop_org=${DEMO_ORG_ID}`);
