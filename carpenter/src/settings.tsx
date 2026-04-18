import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { getDb } from "./db";

interface AppSettings {
  shop_name: string;
  currency: string;
  tax_percent: number;
}

interface SettingsContextValue {
  settings: AppSettings;
  save: (s: Partial<AppSettings>) => Promise<void>;
  format: (n: number) => string;
}

const defaults: AppSettings = { shop_name: "Carpenter Shop", currency: "PKR", tax_percent: 0 };
const Ctx = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaults);

  const load = useCallback(async () => {
    const db = await getDb();
    const rows = await db.select<{ key: string; value: string }[]>("SELECT key, value FROM settings");
    const map: any = { ...defaults };
    for (const r of rows) {
      if (r.key === "tax_percent") map[r.key] = Number(r.value);
      else map[r.key] = r.value;
    }
    setSettings(map);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(s: Partial<AppSettings>) {
    const db = await getDb();
    for (const [k, v] of Object.entries(s)) {
      await db.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [k, String(v)],
      );
    }
    await load();
  }

  function format(n: number) {
    return `${settings.currency} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return <Ctx.Provider value={{ settings, save, format }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings must be within SettingsProvider");
  return c;
}
