import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useSettings } from "../settings";
import { useNotifications } from "../notifications";
import type { Product, Order } from "../types";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const PIE_COLORS = ["#6366f1", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6"];

function lastNDays(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default function Dashboard() {
  const { settings, format } = useSettings();
  const { counts } = useNotifications();
  const [data, setData] = useState({
    totalSales: 0, totalProfit: 0, totalExpenses: 0, stockCount: 0, outstanding: 0,
    todaySales: 0, todayProfit: 0, todayExpenses: 0, todaySalesCount: 0,
  });
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [weekly, setWeekly] = useState<{ day: string; sales: number }[]>([]);
  const [monthly, setMonthly] = useState<{ month: string; profit: number; sales: number }[]>([]);
  const [expensesByCat, setExpensesByCat] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => { (async () => {
    const db = await getDb();
    const t = await db.select<any[]>("SELECT COALESCE(SUM(total),0) as s, COALESCE(SUM(profit),0) as p FROM sales");
    const e = await db.select<any[]>("SELECT COALESCE(SUM(amount),0) as e FROM expenses");
    const sc = await db.select<any[]>("SELECT COALESCE(SUM(quantity),0) as q FROM products");
    const today = await db.select<any[]>(
      "SELECT COALESCE(SUM(total),0) as s, COALESCE(SUM(profit),0) as p, COUNT(*) as n FROM sales WHERE date(created_at)=date('now','localtime')",
    );
    const todayE = await db.select<any[]>("SELECT COALESCE(SUM(amount),0) as e FROM expenses WHERE date(created_at)=date('now','localtime')");
    const due = await db.select<any[]>("SELECT COALESCE(SUM(total - paid),0) as d FROM sales WHERE payment_status <> 'paid'");
    const bonusTotal = await db.select<any[]>("SELECT COALESCE(SUM(amount),0) as b FROM bonuses");
    const bonusToday = await db.select<any[]>("SELECT COALESCE(SUM(amount),0) as b FROM bonuses WHERE received_date = date('now','localtime')");
    setData({
      totalSales: t[0].s,
      totalProfit: t[0].p + bonusTotal[0].b,
      totalExpenses: e[0].e,
      stockCount: sc[0].q,
      outstanding: due[0].d,
      todaySales: today[0].s,
      todayProfit: today[0].p + bonusToday[0].b,
      todayExpenses: todayE[0].e,
      todaySalesCount: today[0].n,
    });
    setLowStock(await db.select<Product[]>("SELECT * FROM products WHERE quantity <= low_stock_threshold ORDER BY quantity ASC LIMIT 10"));
    setRecentOrders(await db.select<Order[]>("SELECT * FROM orders WHERE status IN ('pending','in_progress') ORDER BY id DESC LIMIT 10"));

    const dayRows = await db.select<{ d: string; s: number }[]>(
      "SELECT date(created_at) as d, COALESCE(SUM(total),0) as s FROM sales WHERE date(created_at) >= date('now','-6 days') GROUP BY d",
    );
    const dayMap = new Map(dayRows.map((r) => [r.d, r.s]));
    setWeekly(lastNDays(7).map((d) => ({
      day: new Date(d).toLocaleDateString(undefined, { weekday: "short" }),
      sales: dayMap.get(d) ?? 0,
    })));

    const monthRows = await db.select<{ m: string; s: number; p: number }[]>(
      "SELECT strftime('%Y-%m', created_at) as m, COALESCE(SUM(total),0) as s, COALESCE(SUM(profit),0) as p FROM sales GROUP BY m",
    );
    const monthMap = new Map(monthRows.map((r) => [r.m, { s: r.s, p: r.p }]));
    const bonusMonthRows = await db.select<{ m: string; b: number }[]>(
      "SELECT strftime('%Y-%m', received_date) as m, COALESCE(SUM(amount),0) as b FROM bonuses GROUP BY m",
    );
    const bonusMonthMap = new Map(bonusMonthRows.map((r) => [r.m, r.b]));
    setMonthly(lastNMonths(12).map((m) => {
      const x = monthMap.get(m) ?? { s: 0, p: 0 };
      const bonus = bonusMonthMap.get(m) ?? 0;
      return { month: m.slice(5) + "/" + m.slice(2, 4), sales: x.s, profit: x.p + bonus };
    }));

    const catRows = await db.select<{ category: string; total: number }[]>(
      "SELECT category, COALESCE(SUM(amount),0) as total FROM expenses GROUP BY category ORDER BY total DESC",
    );
    setExpensesByCat(catRows.map((r) => ({ name: r.category, value: r.total })));
  })(); }, []);

  const net = data.totalProfit - data.totalExpenses;
  const compactFormat = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="opacity-70">{settings.shop_name}</span>
      </div>

      {(counts.lowStock > 0 || counts.pendingOrders > 0) && (
        <div className="alert alert-info mb-4 text-sm">
          {counts.lowStock > 0 && <span>🔔 {counts.lowStock} product(s) low on stock. </span>}
          {counts.pendingOrders > 0 && <span>📦 {counts.pendingOrders} order(s) pending/in-progress.</span>}
        </div>
      )}

      <div className="stats stats-vertical md:stats-horizontal shadow bg-base-100 w-full mb-4">
        <div className="stat"><div className="stat-title">Total Sales</div><div className="stat-value text-primary">{format(data.totalSales)}</div></div>
        <div className="stat"><div className="stat-title">Gross Profit</div><div className="stat-value text-success">{format(data.totalProfit)}</div></div>
        <div className="stat"><div className="stat-title">Expenses</div><div className="stat-value text-error">{format(data.totalExpenses)}</div></div>
        <div className="stat"><div className="stat-title">Net</div><div className={`stat-value ${net >= 0 ? "text-success" : "text-error"}`}>{format(net)}</div></div>
        <div className="stat"><div className="stat-title">Outstanding Credit</div><div className={`stat-value text-warning`}>{format(data.outstanding)}</div></div>
        <div className="stat"><div className="stat-title">Stock Units</div><div className="stat-value">{data.stockCount}</div></div>
      </div>

      <h2 className="font-bold mb-2">Today</h2>
      <div className="stats shadow bg-base-100 w-full mb-6">
        <div className="stat"><div className="stat-title">Sales</div><div className="stat-value text-primary text-2xl">{format(data.todaySales)}</div><div className="stat-desc">{data.todaySalesCount} transactions</div></div>
        <div className="stat"><div className="stat-title">Profit</div><div className="stat-value text-success text-2xl">{format(data.todayProfit)}</div></div>
        <div className="stat"><div className="stat-title">Expenses</div><div className="stat-value text-error text-2xl">{format(data.todayExpenses)}</div></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Sales — Last 7 Days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis tickFormatter={compactFormat} fontSize={12} />
                <Tooltip formatter={(v) => format(Number(v))} />
                <Bar dataKey="sales" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Sales & Profit — Last 12 Months</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis tickFormatter={compactFormat} fontSize={12} />
                <Tooltip formatter={(v) => format(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4 lg:col-span-2">
          <h2 className="font-bold mb-2">Expenses by Category</h2>
          {expensesByCat.length === 0 ? (
            <p className="opacity-60 text-sm py-12 text-center">No expenses recorded yet.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expensesByCat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => e.name}>
                    {expensesByCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => format(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">⚠ Low Stock</h2>
          {lowStock.length === 0 ? <p className="opacity-60 text-sm">All good.</p> : (
            <table className="table table-sm">
              <thead><tr><th>Product</th><th className="text-right">Stock</th><th className="text-right">Threshold</th></tr></thead>
              <tbody>{lowStock.map((p) => <tr key={p.id}><td>{p.name}</td><td className="text-right">{p.quantity}</td><td className="text-right">{p.low_stock_threshold}</td></tr>)}</tbody>
            </table>
          )}
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">📦 Open Orders</h2>
          {recentOrders.length === 0 ? <p className="opacity-60 text-sm">No open orders.</p> : (
            <table className="table table-sm">
              <thead><tr><th>#</th><th>Customer</th><th>Description</th><th>Status</th></tr></thead>
              <tbody>{recentOrders.map((o) => <tr key={o.id}><td>#{o.id}</td><td>{o.customer_name ?? "-"}</td><td className="max-w-xs truncate">{o.description}</td><td><span className="badge badge-sm">{o.status}</span></td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
