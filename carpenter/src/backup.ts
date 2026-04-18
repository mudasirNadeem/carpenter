import { readDir, remove } from "@tauri-apps/plugin-fs";
import { getDb } from "./db";

const BACKUP_PREFIX = "carpenter-backup-";
const BACKUP_EXT = ".db";
const MIN_INTERVAL_HOURS = 20;

function tsName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${BACKUP_PREFIX}${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}${BACKUP_EXT}`;
}

function joinPath(folder: string, name: string) {
  const sep = folder.includes("\\") ? "\\" : "/";
  return folder.replace(/[\\/]+$/, "") + sep + name;
}

export async function runBackup(folder: string, retention: number): Promise<string> {
  const db = await getDb();
  const filename = tsName();
  const target = joinPath(folder, filename);
  await db.execute("VACUUM INTO ?", [target]);

  await db.execute(
    "INSERT INTO settings (key, value) VALUES ('last_backup_at', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    [new Date().toISOString()],
  );

  try {
    const entries = await readDir(folder);
    const backups = entries
      .filter((e) => e.name?.startsWith(BACKUP_PREFIX) && e.name.endsWith(BACKUP_EXT))
      .map((e) => e.name!)
      .sort();
    const extra = backups.length - retention;
    if (extra > 0) {
      for (const name of backups.slice(0, extra)) {
        try { await remove(joinPath(folder, name)); } catch { /* ignore */ }
      }
    }
  } catch { /* folder listing is best-effort */ }

  return target;
}

export async function runAutoBackupIfDue(): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings WHERE key IN ('backup_enabled','backup_folder','backup_retention','last_backup_at')",
  );
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (map.backup_enabled !== "1") return null;
  if (!map.backup_folder) return null;

  if (map.last_backup_at) {
    const last = new Date(map.last_backup_at).getTime();
    const hours = (Date.now() - last) / 3_600_000;
    if (hours < MIN_INTERVAL_HOURS) return null;
  }

  try {
    return await runBackup(map.backup_folder, Number(map.backup_retention) || 7);
  } catch (err) {
    console.error("auto-backup failed", err);
    return null;
  }
}
