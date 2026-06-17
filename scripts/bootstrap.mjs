#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultDatabase = 'valueloop';
const defaultTimezone = 'Asia/Jakarta';
const defaultLocaleValue = 'id';
const iterationCount = 120000;

function parseArgs(argv) {
  const result = {
    database: defaultDatabase,
    mode: '--local',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') {
      result.help = true;
      continue;
    }
    if (value === '--remote') {
      result.mode = '--remote';
      continue;
    }
    if (value === '--local') {
      result.mode = '--local';
      continue;
    }
    if (value === '--database') {
      result.database = argv[index + 1] || defaultDatabase;
      index += 1;
      continue;
    }
    if (value.startsWith('--database=')) {
      result.database = value.slice('--database='.length) || defaultDatabase;
    }
  }

  return result;
}

function helpText() {
  return [
    'Bootstrap ValueLoop root user dan organisasi pertama.',
    '',
    'Usage:',
    '  node scripts/bootstrap.mjs [--local|--remote] [--database valueloop]',
    '',
    'Examples:',
    '  npm run setup',
    '  npm run setup -- --remote',
    '',
    'Notes:',
    '  - Jalankan migration D1 dulu sebelum bootstrap.',
    '  - Script ini aman dijalankan ulang; data yang sudah ada akan di-update atau di-skip.',
  ].join('\n');
}

function resolveWranglerBin() {
  const candidates = process.platform === 'win32'
    ? [resolve(rootDir, 'node_modules/.bin/wrangler.cmd'), resolve(rootDir, 'node_modules/.bin/wrangler')]
    : [resolve(rootDir, 'node_modules/.bin/wrangler')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return 'npx';
}

function runWrangler(args, options = {}) {
  const wranglerBin = resolveWranglerBin();
  const finalArgs = wranglerBin === 'npx' ? ['wrangler', ...args] : args;
  const result = spawnSync(wranglerBin, finalArgs, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || result.stdout?.trim() || 'Perintah wrangler gagal.';
    throw new Error(stderr);
  }

  return result.stdout.trim();
}

function queryD1(database, mode, sql) {
  const output = runWrangler(['d1', 'execute', database, mode, '--json', '--command', sql]);
  const parsed = JSON.parse(output);
  return parsed[0]?.results ?? [];
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function uuid() {
  return webcrypto.randomUUID();
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await webcrypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: iterationCount,
    },
    key,
    256
  );

  return ['pbkdf2_sha256', String(iterationCount), toBase64Url(salt), toBase64Url(new Uint8Array(derived))].join('$');
}

async function ask(rl, question, fallback = '') {
  const suffix = fallback ? ` [${fallback}]` : '';
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback;
}

function formatTemplateOptions(templates) {
  return templates.map((template, index) => `${index + 1}. ${template.name} (${template.code})`).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    return;
  }

  const templates = queryD1(
    args.database,
    args.mode,
    `select code, name, description from value_templates where is_active = 1 order by name asc;`
  );
  const freePlanSeed = `
    insert or ignore into plans (id, code, name, limits, features, is_active, created_at)
    values (
      'plan-free',
      'free',
      'Free',
      json_object('maxMembers', 25, 'maxActiveValues', 10, 'maxChallengesPerMonth', 31, 'exports', 0, 'insights', 1),
      json_object('exports', 0, 'insights', 1, 'selfScoring', 0),
      1,
      datetime('now')
    );
  `;
  const proPlanSeed = `
    insert or ignore into plans (id, code, name, limits, features, is_active, created_at)
    values (
      'plan-pro',
      'pro',
      'Pro',
      json_object('maxMembers', 500, 'maxActiveValues', 100, 'maxChallengesPerMonth', 1000, 'exports', 1, 'insights', 1),
      json_object('exports', 1, 'insights', 1, 'selfScoring', 1),
      1,
      datetime('now')
    );
  `;
  const planRows = queryD1(
    args.database,
    args.mode,
    `select id, code from plans where code = 'free' and is_active = 1 limit 1;`
  );

  const rl = createInterface({ input, output });
  try {
    console.log('Bootstrap ValueLoop');
    console.log('Isi data root user dan organisasi pertama.');
    console.log('');

    const fullName = await ask(rl, 'Nama root user');
    const email = await ask(rl, 'Email root user');
    const password = await ask(rl, 'Kata sandi root user');
    const organizationName = await ask(rl, 'Nama organisasi pertama');
    const organizationSlugInput = await ask(rl, 'Slug organisasi', slugify(organizationName));
    const timezone = await ask(rl, 'Timezone organisasi', defaultTimezone);
    const locale = await ask(rl, 'Locale default', defaultLocaleValue);

    let templateCode = '';
    if (templates.length > 0) {
      console.log('');
      console.log('Template awal yang tersedia:');
      console.log(formatTemplateOptions(templates));
      const selected = await ask(rl, 'Pilih template (kosong untuk blank)', 'blank');
      const numericChoice = Number.parseInt(selected, 10);
      if (selected && Number.isFinite(numericChoice) && numericChoice >= 1 && numericChoice <= templates.length) {
        templateCode = templates[numericChoice - 1].code;
      } else if (selected && selected !== 'blank') {
        const matched = templates.find((template) => template.code === selected || template.name.toLowerCase() === selected.toLowerCase());
        templateCode = matched?.code ?? '';
      }
    }

    const confirm = await ask(rl, 'Lanjutkan bootstrap? (y/n)', 'y');
    if (!['y', 'yes'].includes(confirm.toLowerCase())) {
      console.log('Bootstrap dibatalkan.');
      return;
    }

    const passwordHash = await hashPassword(password);
    const organizationSlug = organizationSlugInput || slugify(organizationName) || 'organization';
    const existingUser = queryD1(
      args.database,
      args.mode,
      `select id from users where lower(email) = lower(${sqlLiteral(email)}) limit 1;`
    );
    const existingOrganization = queryD1(
      args.database,
      args.mode,
      `select id from organizations where lower(slug) = lower(${sqlLiteral(organizationSlug)}) limit 1;`
    );
    const userId = existingUser[0]?.id || uuid();
    const existingOwnership = queryD1(
      args.database,
      args.mode,
      `select organization_id from organization_members where user_id = ${sqlLiteral(userId)} and role = 'owner' limit 1;`
    );
    const organizationId = existingOrganization[0]?.id || existingOwnership[0]?.organization_id || uuid();
    const existingMembership = queryD1(
      args.database,
      args.mode,
      `select id from organization_members where organization_id = ${sqlLiteral(organizationId)} and user_id = ${sqlLiteral(userId)} limit 1;`
    );
    const memberId = existingMembership[0]?.id || uuid();
    const existingCoreValues = queryD1(
      args.database,
      args.mode,
      `select id, name from core_values where organization_id = ${sqlLiteral(organizationId)} order by sort_order asc, name asc;`
    );
    const existingQuestions = queryD1(
      args.database,
      args.mode,
      `select id, core_value_id, question_text from questions where organization_id = ${sqlLiteral(organizationId)};`
    );
    const coreValueIdByName = new Map(existingCoreValues.map((row) => [row.name, row.id]));
    const questionKeySet = new Set(
      existingQuestions.map((row) => `${row.core_value_id}::${row.question_text}`)
    );
    const now = new Date().toISOString();
    const setupStatements = [
      freePlanSeed.trim(),
      proPlanSeed.trim(),
      `insert or ignore into users (id, full_name, email, password_hash, email_verified_at, platform_role, created_at, updated_at)
       values (${sqlLiteral(userId)}, ${sqlLiteral(fullName)}, ${sqlLiteral(email.toLowerCase())}, ${sqlLiteral(passwordHash)}, ${sqlLiteral(now)}, 'platform_admin', ${sqlLiteral(now)}, ${sqlLiteral(now)})`,
      `update users
       set full_name = ${sqlLiteral(fullName)},
           email = ${sqlLiteral(email.toLowerCase())},
           password_hash = ${sqlLiteral(passwordHash)},
           email_verified_at = coalesce(email_verified_at, ${sqlLiteral(now)}),
           platform_role = 'platform_admin',
           updated_at = ${sqlLiteral(now)}
       where lower(email) = lower(${sqlLiteral(email)})`,
      `insert or ignore into organizations (id, name, slug, timezone, default_locale, status, created_at, updated_at)
       values (${sqlLiteral(organizationId)}, ${sqlLiteral(organizationName)}, ${sqlLiteral(organizationSlug)}, ${sqlLiteral(timezone)}, ${sqlLiteral(locale)}, 'active', ${sqlLiteral(now)}, ${sqlLiteral(now)})`,
      `update organizations
       set name = ${sqlLiteral(organizationName)},
           slug = ${sqlLiteral(organizationSlug)},
           timezone = ${sqlLiteral(timezone)},
           default_locale = ${sqlLiteral(locale)},
           status = 'active',
           updated_at = ${sqlLiteral(now)}
       where lower(slug) = lower(${sqlLiteral(organizationSlug)})`,
      `insert or ignore into organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
       values (${sqlLiteral(memberId)}, ${sqlLiteral(organizationId)}, ${sqlLiteral(userId)}, 'owner', 'active', ${sqlLiteral(now)}, ${sqlLiteral(now)}, ${sqlLiteral(now)})`,
      `update organization_members
       set role = 'owner',
           status = 'active',
           joined_at = coalesce(joined_at, ${sqlLiteral(now)}),
           updated_at = ${sqlLiteral(now)}
       where organization_id = ${sqlLiteral(organizationId)} and user_id = ${sqlLiteral(userId)}`,
      `insert into organization_settings (organization_id, settings, updated_at)
       values (
         ${sqlLiteral(organizationId)},
         ${sqlLiteral(JSON.stringify({
           challengeFrequency: 'daily',
           questionCooldownDays: 14,
           allowMultipleChallengesPerDay: false,
           allowSelfScoring: false,
           defaultScoreRubric: [
             { min: 0, max: 2, label: 'Perlu banyak perbaikan' },
             { min: 3, max: 4, label: 'Masih kurang' },
             { min: 5, max: 6, label: 'Cukup' },
             { min: 7, max: 8, label: 'Baik' },
             { min: 9, max: 10, label: 'Sangat baik' },
          ],
        }))},
         ${sqlLiteral(now)}
       )
       on conflict(organization_id) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
      `insert into subscriptions (id, organization_id, plan_id, status, created_at, updated_at)
       values (${sqlLiteral(uuid())}, ${sqlLiteral(organizationId)}, ${sqlLiteral(planRows[0]?.id || 'plan-free')}, 'trialing', ${sqlLiteral(now)}, ${sqlLiteral(now)})
       on conflict(organization_id) do update set plan_id = excluded.plan_id, status = excluded.status, updated_at = excluded.updated_at`,
      `insert into audit_logs (id, organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, before_value, after_value, created_at)
       select ${sqlLiteral(uuid())}, ${sqlLiteral(organizationId)}, ${sqlLiteral(userId)}, ${sqlLiteral(memberId)}, 'organization.created', 'organization', ${sqlLiteral(organizationId)}, null, ${sqlLiteral(JSON.stringify({
         id: organizationId,
         name: organizationName,
         slug: organizationSlug,
         timezone,
         defaultLocale: locale,
       }))}, ${sqlLiteral(now)}
       where not exists (
         select 1 from audit_logs where organization_id = ${sqlLiteral(organizationId)} and action = 'organization.created' and entity_id = ${sqlLiteral(organizationId)}
       )`,
    ];

    if (templateCode) {
      const templateRows = queryD1(
        args.database,
        args.mode,
        `select id, code from value_templates where code = ${sqlLiteral(templateCode)} and is_active = 1 limit 1;`
      );
      const templateId = templateRows[0]?.id;

      if (templateId) {
        const values = queryD1(
          args.database,
          args.mode,
          `select * from value_template_items where template_id = ${sqlLiteral(templateId)} order by sort_order asc;`
        );
        const questions = queryD1(
          args.database,
          args.mode,
          `select * from question_template_items where value_template_item_id in (select id from value_template_items where template_id = ${sqlLiteral(templateId)}) order by rowid asc;`
        );

        const valueIdMap = new Map();
        for (const value of values) {
          const nextValueId = coreValueIdByName.get(value.name) || uuid();
          valueIdMap.set(value.id, nextValueId);
          coreValueIdByName.set(value.name, nextValueId);
          setupStatements.push(
            `insert into core_values
             (id, organization_id, name, short_description, description, expected_behaviors, anti_patterns, example, color, icon_name, sort_order, is_active, created_at, updated_at)
             select
               ${sqlLiteral(nextValueId)},
               ${sqlLiteral(organizationId)},
               ${sqlLiteral(value.name)},
               ${sqlLiteral(value.short_description)},
               ${sqlLiteral(value.description || '')},
               ${sqlLiteral(value.expected_behaviors || '[]')},
               ${sqlLiteral(value.anti_patterns || '[]')},
               ${sqlLiteral(value.example || '')},
               ${sqlLiteral(value.color)},
               ${sqlLiteral(value.icon_name)},
               ${Number(value.sort_order) || 0},
               1,
               ${sqlLiteral(now)},
               ${sqlLiteral(now)}
             where not exists (
               select 1 from core_values where organization_id = ${sqlLiteral(organizationId)} and name = ${sqlLiteral(value.name)}
             )`
          );
          setupStatements.push(
            `update core_values
             set short_description = ${sqlLiteral(value.short_description)},
                 description = ${sqlLiteral(value.description || '')},
                 expected_behaviors = ${sqlLiteral(value.expected_behaviors || '[]')},
                 anti_patterns = ${sqlLiteral(value.anti_patterns || '[]')},
                 example = ${sqlLiteral(value.example || '')},
                 color = ${sqlLiteral(value.color)},
                 icon_name = ${sqlLiteral(value.icon_name)},
                 sort_order = ${Number(value.sort_order) || 0},
                 is_active = 1,
                 updated_at = ${sqlLiteral(now)}
             where organization_id = ${sqlLiteral(organizationId)} and name = ${sqlLiteral(value.name)}`
          );
        }

        for (const question of questions) {
          const mappedValueId = valueIdMap.get(question.value_template_item_id);
          if (!mappedValueId) {
            continue;
          }
          const questionKey = `${mappedValueId}::${question.question_text}`;
          questionKeySet.add(questionKey);

          setupStatements.push(
            `insert into questions
             (id, organization_id, core_value_id, question_text, difficulty, suggested_rubric_note, is_active, created_by_member_id, created_at, updated_at)
             select
               ${sqlLiteral(uuid())},
               ${sqlLiteral(organizationId)},
               ${sqlLiteral(mappedValueId)},
               ${sqlLiteral(question.question_text)},
               ${sqlLiteral(question.difficulty)},
               ${sqlLiteral(question.suggested_rubric_note || '')},
               1,
               ${sqlLiteral(memberId)},
               ${sqlLiteral(now)},
               ${sqlLiteral(now)}
             where not exists (
               select 1
               from questions
               where organization_id = ${sqlLiteral(organizationId)}
                 and core_value_id = ${sqlLiteral(mappedValueId)}
                 and question_text = ${sqlLiteral(question.question_text)}
             )`
          );
          setupStatements.push(
            `update questions
             set difficulty = ${sqlLiteral(question.difficulty)},
                 suggested_rubric_note = ${sqlLiteral(question.suggested_rubric_note || '')},
                 is_active = 1,
                 updated_at = ${sqlLiteral(now)}
             where organization_id = ${sqlLiteral(organizationId)}
               and core_value_id = ${sqlLiteral(mappedValueId)}
               and question_text = ${sqlLiteral(question.question_text)}`
          );
        }

        setupStatements.push(
          `insert into audit_logs (id, organization_id, actor_user_id, actor_member_id, action, entity_type, entity_id, before_value, after_value, created_at)
           values (${sqlLiteral(uuid())}, ${sqlLiteral(organizationId)}, ${sqlLiteral(userId)}, ${sqlLiteral(memberId)}, 'organization.template_applied', 'value_template', ${sqlLiteral(templateId)}, null, ${sqlLiteral(JSON.stringify({ templateCode }))}, ${sqlLiteral(now)})`
        );
      }
    }

    const tempDir = await mkdtemp(resolve(tmpdir(), 'valueloop-bootstrap-'));
    const sqlFile = resolve(tempDir, 'bootstrap.sql');

    try {
      await writeFile(sqlFile, `${setupStatements.join(';\n')};\n`, 'utf8');
      runWrangler(['d1', 'execute', args.database, args.mode, '--yes', '--file', sqlFile]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    console.log('');
    console.log('Bootstrap selesai.');
    console.log(`Organisasi: ${organizationName} (${organizationSlug})`);
    console.log(`Root user: ${email.toLowerCase()}`);
    console.log('Lanjutkan dengan: npm run dev');
    console.log('Lalu login melalui halaman /login.');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
