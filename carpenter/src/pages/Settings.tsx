import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { useSettings } from "../settings";
import { can } from "../types";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { copyFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { getDb } from "../db";
import { runBackup } from "../backup";

interface BackupConfig {
  backup_enabled: boolean;
  backup_folder: string;
  backup_retention: number;
  last_backup_at: string;
}

export default function Settings() {
  const { user } = useAuth();
  const { settings, save } = useSettings();
  const [form, setForm] = useState(settings);
  const [bcfg, setBcfg] = useState<BackupConfig>({ backup_enabled: false, backup_folder: "", backup_retention: 7, last_backup_at: "" });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => { setForm(settings); }, [settings]);

  async function loadBackupCfg() {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>(
      "SELECT key, value FROM settings WHERE key IN ('backup_enabled','backup_folder','backup_retention','last_backup_at')",
    );
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    setBcfg({
      backup_enabled: m.backup_enabled === "1",
      backup_folder: m.backup_folder ?? "",
      backup_retention: Number(m.backup_retention) || 7,
      last_backup_at: m.last_backup_at ?? "",
    });
  }
  useEffect(() => { loadBackupCfg(); }, []);

  if (!can(user?.role, "settings.manage")) {
    return <div className="alert alert-warning">Admin only.</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await save({ shop_name: form.shop_name, currency: form.currency, tax_percent: +form.tax_percent });
    setStatus("Saved.");
    setTimeout(() => setStatus(null), 2000);
  }

  async function saveBackupCfg(next: BackupConfig) {
    const db = await getDb();
    const entries: [string, string][] = [
      ["backup_enabled", next.backup_enabled ? "1" : "0"],
      ["backup_folder", next.backup_folder],
      ["backup_retention", String(next.backup_retention)],
    ];
    for (const [k, v] of entries) {
      await db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [k, v],
      );
    }
    setBcfg(next);
  }

  async function pickFolder() {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      await saveBackupCfg({ ...bcfg, backup_folder: picked });
      setStatus(`Auto-backup folder set to: ${picked}`);
    }
  }

  async function backupNow() {
    if (!bcfg.backup_folder) {
      setStatus("Pick an auto-backup folder first, or use Manual Backup.");
      return;
    }
    try {
      const path = await runBackup(bcfg.backup_folder, bcfg.backup_retention);
      setStatus(`Backup saved: ${path}`);
      loadBackupCfg();
    } catch (err: any) {
      setStatus(`Backup failed: ${err.message ?? err}`);
    }
  }

  async function manualBackup() {
    try {
      const target = await saveDialog({
        defaultPath: `carpenter-backup-${new Date().toISOString().slice(0, 10)}.db`,
        filters: [{ name: "SQLite DB", extensions: ["db"] }],
      });
      if (!target) return;
      const db = await getDb();
      await db.execute("VACUUM INTO ?", [target]);
      setStatus(`Backup saved: ${target}`);
    } catch (err: any) {
      setStatus(`Backup failed: ${err.message ?? err}`);
    }
  }

  async function restore() {
    if (!confirm("Restore will REPLACE the current database on next app start. Continue?")) return;
    try {
      const src = await openDialog({ multiple: false, filters: [{ name: "SQLite DB", extensions: ["db"] }] });
      if (!src || typeof src !== "string") return;
      await copyFile(src, "carpenter.db", { toPathBaseDir: BaseDirectory.AppConfig });
      setStatus("Restored. Please restart the app.");
    } catch (err: any) {
      setStatus(`Restore failed: ${err.message ?? err}`);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <div className="grid md:grid-cols-2 gap-4">
        <form onSubmit={submit} className="bg-base-100 rounded-lg shadow p-4 flex flex-col gap-3">
          <h2 className="font-bold">Shop</h2>
          <label className="form-control"><span className="label-text">Shop Name</span>
            <input className="input input-bordered" value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
          </label>
          <label className="form-control"><span className="label-text">Currency</span>
            <input className="input input-bordered" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </label>
          <label className="form-control"><span className="label-text">Tax %</span>
            <input type="number" step="0.01" className="input input-bordered" value={form.tax_percent} onChange={(e) => setForm({ ...form, tax_percent: +e.target.value })} />
          </label>
          <button type="submit" className="btn btn-primary btn-sm self-start">Save</button>
        </form>

        <div className="bg-base-100 rounded-lg shadow p-4 flex flex-col gap-3">
          <h2 className="font-bold">Auto Backup</h2>
          <p className="text-sm opacity-70">
            Pick a folder inside Google Drive / OneDrive / Dropbox. The app will back up the database once per day and keep the latest N copies.
          </p>

          <label className="label cursor-pointer justify-start gap-3">
            <input type="checkbox" className="toggle toggle-primary" checked={bcfg.backup_enabled} onChange={(e) => saveBackupCfg({ ...bcfg, backup_enabled: e.target.checked })} />
            <span>Enable daily auto-backup</span>
          </label>

          <div className="form-control">
            <span className="label-text">Backup folder</span>
            <div className="flex gap-2">
              <input className="input input-bordered input-sm flex-1" readOnly title="Backup folder" placeholder="(not set)" value={bcfg.backup_folder} />
              <button type="button" className="btn btn-sm" onClick={pickFolder}>Choose…</button>
            </div>
          </div>

          <label className="form-control">
            <span className="label-text">Keep last N backups</span>
            <input type="number" min={1} max={365} className="input input-bordered input-sm w-24"
              value={bcfg.backup_retention}
              onChange={(e) => saveBackupCfg({ ...bcfg, backup_retention: Math.max(1, +e.target.value || 1) })} />
          </label>

          <div className="text-xs opacity-70">
            Last backup: {bcfg.last_backup_at ? new Date(bcfg.last_backup_at).toLocaleString() : "never"}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn btn-sm btn-primary" onClick={backupNow}>Backup Now</button>
            <button type="button" className="btn btn-sm" onClick={manualBackup}>Manual Backup (pick file)</button>
            <button type="button" className="btn btn-sm btn-outline" onClick={restore}>Restore DB</button>
          </div>
        </div>
      </div>

      {status && <div className="alert alert-info mt-4 text-sm">{status}</div>}
    </div>
  );
}
