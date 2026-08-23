import { Miniflare } from 'miniflare';
import initialMigration from '../../migrations/0001_initial.sql?raw';
import googleAuthMigration from '../../migrations/0002_auth_google.sql?raw';
import articlesMigration from '../../migrations/0003_articles.sql?raw';
import singleOwnerMigration from '../../migrations/0004_single_owner_per_organization.sql?raw';
import freePlanOnlyMigration from '../../migrations/0005_free_plan_only.sql?raw';
import notificationsMigration from '../../migrations/0006_notifications.sql?raw';
import membershipInvitationsMigration from '../../migrations/0007_membership_invitations.sql?raw';
import aiSettingsMigration from '../../migrations/0008_ai_settings.sql?raw';

export type TestD1 = {
  db: D1Database;
  kv: KVNamespace;
  mf: Miniflare;
  dispose: () => Promise<void>;
};

const migrations = [initialMigration, googleAuthMigration, articlesMigration, singleOwnerMigration, freePlanOnlyMigration, notificationsMigration, membershipInvitationsMigration, aiSettingsMigration];

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    current += char;

    if (quote) {
      if (char === quote) {
        if (nextChar === quote) {
          current += nextChar;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === ';') {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = '';
    }
  }

  const remaining = current.trim();
  if (remaining) {
    statements.push(remaining);
  }

  return statements;
}

export async function createTestD1(): Promise<TestD1> {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } };',
    d1Databases: {
      DB: crypto.randomUUID(),
    },
    kvNamespaces: ['KV'],
  });

  const db = await mf.getD1Database('DB');
  const kv = await mf.getKVNamespace('KV') as unknown as KVNamespace;
  for (const sql of migrations) {
    for (const statement of splitSqlStatements(sql)) {
      await db.prepare(statement).run();
    }
  }

  return {
    db,
    kv,
    mf,
    dispose: async () => {
      await mf.dispose();
    },
  };
}
