import { dbFirst } from '../db/client';

export async function hasAnyUsers(db: D1Database): Promise<boolean> {
  const row = await dbFirst<{ id: string }>(db, `select id from users limit 1`);
  return Boolean(row);
}
