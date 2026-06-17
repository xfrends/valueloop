export type DbRecord = Record<string, unknown>;

export async function dbAll<T = DbRecord>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return (result.results ?? []) as T[];
}

export async function dbFirst<T = DbRecord>(
  db: D1Database,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return (result ?? null) as T | null;
}

export async function dbRun(db: D1Database, sql: string, params: unknown[] = []): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}

export async function dbBatch(db: D1Database, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  return db.batch(statements);
}
