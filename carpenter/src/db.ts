import Database from "@tauri-apps/plugin-sql";

let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:carpenter.db");
  }
  return dbPromise;
}

// NOTE: tauri-plugin-sql v2 uses a sqlx connection pool, so BEGIN/COMMIT in
// separate execute() calls run on different pool connections and leak the
// transaction. We run the statements sequentially without a transaction.
// Trade-off: if the app crashes mid-write, partial data can remain. For a
// single-user desktop shop app this is acceptable. Move to a Rust-side
// transaction command if stricter atomicity is needed later.
export async function withTransaction<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const db = await getDb();
  return fn(db);
}
