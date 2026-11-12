#!/usr/bin/env node
// Memotret halaman app asli (workspace demo) untuk dipakai di halaman /preview.
// Prasyarat: dev server jalan, dan `node scripts/seed-preview-demo.mjs` sudah dijalankan.
//
//   PLAYWRIGHT_PATH=/path/ke/node_modules/playwright node scripts/capture-preview.mjs [baseUrl]
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const baseUrl = process.argv[2] || 'http://localhost:4321';
const outDir = join(rootDir, 'public/media/preview');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(rootDir, 'src/data'), { recursive: true });

const d1Dir = join(rootDir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const dbPath = join(d1Dir, readdirSync(d1Dir).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite'));
const db = (statement) => execFileSync('sqlite3', ['-cmd', '.timeout 10000', dbPath], { input: statement });

const TODAY = `id = 'demo-session-today'`;
const setAnswered = () => db(`update challenge_sessions set status = 'answered', answer_text = coalesce(answer_text, _a), answered_at = coalesce(answered_at, _t) from (select answer_text as _a, answered_at as _t from challenge_sessions where id = 'demo-session-001') where ${TODAY};`);

const shots = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'challenge', path: '/challenge', before: () => db(`update challenge_sessions set status = 'open', answer_text = null, answered_at = null where ${TODAY};`), after: setAnswered },
  { name: 'scoring', path: '/challenge' },
  { name: 'leaderboard', path: '/leaderboard' },
  { name: 'history', path: '/history' },
  { name: 'insights', path: '/insights' },
  { name: 'values', path: '/settings/values' },
];
const viewports = [
  // App belum punya layout mobile (sidebar selalu tampil), jadi hanya versi desktop yang dipotret.
  { suffix: 'desktop', width: 1440, height: 900, outWidth: 2000 },
];

const browser = await chromium.launch();
const sizes = {};
const manifest = {};
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
      locale: 'id-ID',
      timezoneId: 'Asia/Jakarta',
    });
    const { hostname } = new URL(baseUrl);
    await context.addCookies([
      { name: 'valueloop_session', value: 'valueloop-preview-demo-session', domain: hostname, path: '/' },
      { name: 'valueloop_org', value: 'demo-org', domain: hostname, path: '/' },
    ]);
    const page = await context.newPage();
    for (const shot of shots) {
      shot.before?.();
      try {
        const response = await page.goto(baseUrl + shot.path, { waitUntil: 'networkidle' });
        if (!response?.ok() || new URL(page.url()).pathname !== shot.path) throw new Error(`${shot.path} -> ${response?.status()} ${page.url()}`);
        await page.addStyleTag({ content: 'astro-dev-toolbar{display:none!important} *,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}' });
        // Samakan tinggi viewport dengan tinggi konten supaya sidebar (setinggi layar) ikut penuh sampai bawah.
        const fullHeight = await page.evaluate(() => Math.max(...[document.documentElement, document.body, ...document.querySelectorAll('main, [class*="overflow-y"]')].map((el) => el.scrollHeight)));
        await page.setViewportSize({ width: viewport.width, height: Math.max(viewport.height, fullHeight) });
        await page.waitForTimeout(600);
        const png = await page.screenshot({ fullPage: true });
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const file = `${shot.name}-${viewport.suffix}.webp`;
        const info = await sharp(png).resize({ width: viewport.outWidth }).webp({ quality: 84 }).toFile(join(outDir, file));
        sizes[file] = { width: info.width, height: info.height, kb: Math.round(info.size / 1024) };
        (manifest[shot.name] ||= {})[viewport.suffix] = { src: `/media/preview/${file}`, width: info.width, height: info.height };
      } finally {
        shot.after?.();
      }
    }
    await context.close();
  }
} finally {
  setAnswered();
  await browser.close();
}
writeFileSync(join(rootDir, 'src/data/preview-shots.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.table(sizes);
