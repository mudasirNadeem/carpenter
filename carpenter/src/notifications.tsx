import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { getDb } from "./db";

interface Counts {
  lowStock: number;
  pendingOrders: number;
}

const Ctx = createContext<{ counts: Counts; refresh: () => Promise<void> } | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Counts>({ lowStock: 0, pendingOrders: 0 });

  const refresh = useCallback(async () => {
    const db = await getDb();
    const ls = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM products WHERE quantity <= low_stock_threshold");
    const po = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending','in_progress')");
    setCounts({ lowStock: ls[0]?.c ?? 0, pendingOrders: po[0]?.c ?? 0 });
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  return <Ctx.Provider value={{ counts, refresh }}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotifications must be within NotificationsProvider");
  return c;
}
