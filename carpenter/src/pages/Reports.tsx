import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useSettings } from "../settings";

type Row = { period: string; total: number; profit?: number; expenses?: number };

export default function Reports() {
  const { format } = useSettings();
  const [daily, setDaily] = useState<Row[]>([]);
  const [monthly, setMonthly] = useState<Row[]>([]);
  const [expensesBy, setExpensesBy] = useState<{ category: string; total: number }[]>([]);
  const [stock, setStock] = useState<{ name: string; quantity: number; cost_price: number; sale_price: number }[]>([]);
  const [totals, setTotals] = useState({ sales: 0, profit: 0, expenses: 0 });

  useEffect(() => { (async () => {
    const db = await getDb();
    setDaily(await db.select<Row[]>(
      `SELECT date(created_at) as period, COALESCE(SUM(total),0) as total, COALESCE(SUM(profit),0) as profit
       FROM sales GROUP BY date(created_at) ORDER BY period DESC LIMIT 30`,
    ));
    setMonthly(await db.select<Row[]>(
      `SELECT strftime('%Y-%m', created_at) as period, COALESCE(SUM(total),0) as total, COALESCE(SUM(profit),0) as profit
       FROM sales GROUP BY period ORDER BY period DESC LIMIT 12`,
    ));
    setExpensesBy(await db.select<{ category: string; total: number }[]>(
      `SELECT category, COALESCE(SUM(amount),0) as total FROM expenses GROUP BY category ORDER BY total DESC`,
    ));
    setStock(await db.select(
      `SELECT name, quantity, cost_price, sale_price FROM products ORDER BY name`,
    ));
    const t = await db.select<{ sales: number; profit: number }[]>(
      "SELECT COALESCE(SUM(total),0) as sales, COALESCE(SUM(profit),0) as profit FROM sales",
    );
    const e = await db.select<{ expenses: number }[]>("SELECT COALESCE(SUM(amount),0) as expenses FROM expenses");
    setTotals({ sales: t[0]?.sales ?? 0, profit: t[0]?.profit ?? 0, expenses: e[0]?.expenses ?? 0 });
  })(); }, []);

  const stockValueCost = stock.reduce((s, p) => s + p.quantity * p.cost_price, 0);
  const stockValueRetail = stock.reduce((s, p) => s + p.quantity * p.sale_price, 0);
  const netProfit = totals.profit - totals.expenses;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Reports</h1>

      <div className="stats shadow bg-base-100 mb-6 w-full">
        <div className="stat"><div className="stat-title">Total Sales</div><div className="stat-value text-primary">{format(totals.sales)}</div></div>
        <div className="stat"><div className="stat-title">Gross Profit</div><div className="stat-value text-success">{format(totals.profit)}</div></div>
        <div className="stat"><div className="stat-title">Expenses</div><div className="stat-value text-error">{format(totals.expenses)}</div></div>
        <div className="stat"><div className="stat-title">Net Profit</div><div className={`stat-value ${netProfit >= 0 ? "text-success" : "text-error"}`}>{format(netProfit)}</div></div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Daily Sales (30d)</h2>
          <table className="table table-sm">
            <thead><tr><th>Date</th><th className="text-right">Sales</th><th className="text-right">Profit</th></tr></thead>
            <tbody>{daily.map((r) => <tr key={r.period}><td>{r.period}</td><td className="text-right">{format(r.total)}</td><td className="text-right text-success">{format(r.profit ?? 0)}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Monthly Sales</h2>
          <table className="table table-sm">
            <thead><tr><th>Month</th><th className="text-right">Sales</th><th className="text-right">Profit</th></tr></thead>
            <tbody>{monthly.map((r) => <tr key={r.period}><td>{r.period}</td><td className="text-right">{format(r.total)}</td><td className="text-right text-success">{format(r.profit ?? 0)}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Expenses by Category</h2>
          <table className="table table-sm">
            <thead><tr><th>Category</th><th className="text-right">Total</th></tr></thead>
            <tbody>{expensesBy.map((r) => <tr key={r.category}><td>{r.category}</td><td className="text-right text-error">{format(r.total)}</td></tr>)}</tbody>
          </table>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Stock Valuation</h2>
          <div className="stats stats-vertical w-full">
            <div className="stat"><div className="stat-title">At Cost</div><div className="stat-value text-sm">{format(stockValueCost)}</div></div>
            <div className="stat"><div className="stat-title">At Retail</div><div className="stat-value text-sm">{format(stockValueRetail)}</div></div>
          </div>
          <table className="table table-xs mt-2">
            <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Cost Value</th></tr></thead>
            <tbody>{stock.map((p) => <tr key={p.name}><td>{p.name}</td><td className="text-right">{p.quantity}</td><td className="text-right">{format(p.quantity * p.cost_price)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
