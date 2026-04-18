import { useEffect, useMemo, useState } from "react";
import { getDb, withTransaction } from "../db";
import { useAuth } from "../auth";
import { useSettings } from "../settings";
import { can, type Payment, type PaymentStatus, type Sale, type SaleItem } from "../types";
import CustomerStatement from "../CustomerStatement";

interface CustomerCredit {
  customer_id: number | null;
  customer: string;
  phone: string | null;
  balance: number;
  sale_count: number;
  oldest_sale: string;
  last_payment: string | null;
}

interface AgingBuckets {
  b0_30: number;
  b31_60: number;
  b61_90: number;
  b90_plus: number;
}

export default function Credit() {
  const { user } = useAuth();
  const { settings, format } = useSettings();
  const canCollect = can(user?.role, "credit.collect");

  const [rows, setRows] = useState<CustomerCredit[]>([]);
  const [aging, setAging] = useState<AgingBuckets>({ b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerCredit | null>(null);
  const [unpaidSales, setUnpaidSales] = useState<Sale[]>([]);
  const [paidSales, setPaidSales] = useState<Sale[]>([]);
  const [paymentHistory, setPaymentHistory] = useState<(Payment & { sale_total: number })[]>([]);
  const [collect, setCollect] = useState<{ amount: string; note: string } | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementItems, setStatementItems] = useState<Record<number, SaleItem[]>>({});

  async function load() {
    const db = await getDb();
    const data = await db.select<CustomerCredit[]>(`
      SELECT
        s.customer_id,
        COALESCE(c.name, s.customer_name, 'Walk-in (unnamed)') as customer,
        c.phone as phone,
        SUM(s.total - s.paid) as balance,
        COUNT(*) as sale_count,
        MIN(date(s.created_at)) as oldest_sale,
        (SELECT MAX(p.created_at)
           FROM payments p
           JOIN sales s2 ON s2.id = p.sale_id
           WHERE (s2.customer_id = s.customer_id AND s.customer_id IS NOT NULL)
              OR (s2.customer_id IS NULL AND s2.customer_name = s.customer_name AND s.customer_id IS NULL)
        ) as last_payment
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.payment_status <> 'paid'
      GROUP BY s.customer_id, COALESCE(c.name, s.customer_name, 'Walk-in (unnamed)')
      ORDER BY balance DESC
    `);
    setRows(data);

    const a = await db.select<any[]>(`
      SELECT
        COALESCE(SUM(CASE WHEN julianday('now','localtime') - julianday(created_at) <= 30 THEN total - paid END), 0) as b0_30,
        COALESCE(SUM(CASE WHEN julianday('now','localtime') - julianday(created_at) > 30 AND julianday('now','localtime') - julianday(created_at) <= 60 THEN total - paid END), 0) as b31_60,
        COALESCE(SUM(CASE WHEN julianday('now','localtime') - julianday(created_at) > 60 AND julianday('now','localtime') - julianday(created_at) <= 90 THEN total - paid END), 0) as b61_90,
        COALESCE(SUM(CASE WHEN julianday('now','localtime') - julianday(created_at) > 90 THEN total - paid END), 0) as b90_plus
      FROM sales WHERE payment_status <> 'paid'
    `);
    setAging(a[0]);
  }

  useEffect(() => { load(); }, []);

  async function openCustomer(c: CustomerCredit) {
    const db = await getDb();
    const where = c.customer_id
      ? "customer_id = ?"
      : "customer_id IS NULL AND customer_name = ?";
    const param = c.customer_id ?? c.customer;

    const unpaid = await db.select<Sale[]>(
      `SELECT * FROM sales WHERE ${where} AND payment_status <> 'paid' ORDER BY created_at ASC`,
      [param],
    );
    const paid = await db.select<Sale[]>(
      `SELECT * FROM sales WHERE ${where} AND payment_status = 'paid' ORDER BY created_at DESC LIMIT 20`,
      [param],
    );
    const payments = await db.select<(Payment & { sale_total: number })[]>(
      `SELECT p.*, s.total as sale_total
         FROM payments p
         JOIN sales s ON s.id = p.sale_id
         WHERE ${where.replace(/customer_id/g, "s.customer_id").replace(/customer_name/g, "s.customer_name")}
         ORDER BY p.id DESC`,
      [param],
    );

    setSelected(c);
    setUnpaidSales(unpaid);
    setPaidSales(paid);
    setPaymentHistory(payments);
    setCollect(null);
    setStatementItems({});
    setStatementOpen(false);
  }

  function closeDetail() {
    setSelected(null);
    setUnpaidSales([]);
    setPaidSales([]);
    setPaymentHistory([]);
  }

  const collectPreview = useMemo(() => {
    if (!collect || !selected) return [];
    let remaining = Math.max(0, Number(collect.amount) || 0);
    const alloc: { sale: Sale; amount: number }[] = [];
    for (const s of unpaidSales) {
      if (remaining <= 0) break;
      const bal = s.total - s.paid;
      const pay = Math.min(remaining, bal);
      if (pay > 0) alloc.push({ sale: s, amount: pay });
      remaining -= pay;
    }
    return alloc;
  }, [collect?.amount, unpaidSales, selected]);

  async function submitCollect(e: React.FormEvent) {
    e.preventDefault();
    if (!collect || !selected || collectPreview.length === 0) return;
    try {
      await withTransaction(async (db) => {
        for (const a of collectPreview) {
          await db.execute(
            "INSERT INTO payments (sale_id, amount, note, user_id) VALUES (?, ?, ?, ?)",
            [a.sale.id, a.amount, collect.note || null, user?.id ?? null],
          );
          const newPaid = a.sale.paid + a.amount;
          const status: PaymentStatus = newPaid >= a.sale.total ? "paid" : newPaid > 0 ? "partial" : "unpaid";
          await db.execute("UPDATE sales SET paid = ?, payment_status = ? WHERE id = ?", [newPaid, status, a.sale.id]);
        }
      });
      closeDetail();
      load();
    } catch (err: any) {
      alert(`Collection failed: ${err.message ?? err}`);
    }
  }

  async function openStatement() {
    const db = await getDb();
    const items: Record<number, SaleItem[]> = {};
    for (const s of unpaidSales) {
      items[s.id] = await db.select<SaleItem[]>(
        "SELECT si.*, p.name as product_name FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE sale_id = ?",
        [s.id],
      );
    }
    setStatementItems(items);
    setStatementOpen(true);
  }

  if (!can(user?.role, "credit.view")) {
    return <div className="alert alert-warning">You do not have permission to view credit.</div>;
  }

  const filtered = rows.filter((r) =>
    r.customer.toLowerCase().includes(query.toLowerCase()) ||
    (r.phone?.toLowerCase() ?? "").includes(query.toLowerCase()),
  );

  const totalAR = aging.b0_30 + aging.b31_60 + aging.b61_90 + aging.b90_plus;
  const overdue = aging.b31_60 + aging.b61_90 + aging.b90_plus;
  const selectedBalance = unpaidSales.reduce((s, x) => s + (x.total - x.paid), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Credit (Accounts Receivable)</h1>
        <input
          className="input input-bordered input-sm w-full max-w-xs"
          placeholder="Search customer or phone..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="stats stats-vertical md:stats-horizontal shadow bg-base-100 w-full mb-4">
        <div className="stat">
          <div className="stat-title">Total Outstanding</div>
          <div className="stat-value text-warning">{format(totalAR)}</div>
          <div className="stat-desc">{rows.length} customer(s) owing</div>
        </div>
        <div className="stat">
          <div className="stat-title">Overdue (&gt; 30 days)</div>
          <div className="stat-value text-error text-2xl">{format(overdue)}</div>
          <div className="stat-desc">{totalAR > 0 ? `${((overdue / totalAR) * 100).toFixed(0)}% of AR` : "—"}</div>
        </div>
      </div>

      <div className="bg-base-100 rounded-lg shadow p-4 mb-4">
        <h2 className="font-bold mb-2">Aging</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border-l-4 border-success pl-3">
            <div className="text-xs opacity-70">0 – 30 days</div>
            <div className="text-lg font-bold">{format(aging.b0_30)}</div>
          </div>
          <div className="border-l-4 border-warning pl-3">
            <div className="text-xs opacity-70">31 – 60 days</div>
            <div className="text-lg font-bold">{format(aging.b31_60)}</div>
          </div>
          <div className="border-l-4 border-orange-400 pl-3">
            <div className="text-xs opacity-70">61 – 90 days</div>
            <div className="text-lg font-bold">{format(aging.b61_90)}</div>
          </div>
          <div className="border-l-4 border-error pl-3">
            <div className="text-xs opacity-70">90+ days</div>
            <div className="text-lg font-bold">{format(aging.b90_plus)}</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th className="text-right">Balance</th>
              <th className="text-right">Sales</th>
              <th>Oldest Unpaid</th>
              <th>Last Payment</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const age = Math.floor((Date.now() - new Date(r.oldest_sale).getTime()) / (1000 * 60 * 60 * 24));
              const ageClass = age > 90 ? "text-error font-bold" : age > 30 ? "text-warning" : "";
              return (
                <tr key={`${r.customer_id ?? 0}-${r.customer}`} className="hover cursor-pointer" onClick={() => openCustomer(r)}>
                  <td className="font-medium">{r.customer}</td>
                  <td>{r.phone ?? "-"}</td>
                  <td className="text-right text-error font-semibold">{format(r.balance)}</td>
                  <td className="text-right">{r.sale_count}</td>
                  <td className={ageClass}>{r.oldest_sale} ({age}d)</td>
                  <td className="text-xs">{r.last_payment ?? "-"}</td>
                  <td className="text-right"><button type="button" className="btn btn-xs">Open</button></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center opacity-60 py-6">No outstanding credit.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="modal modal-open">
          <div className="modal-box max-w-4xl">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-bold text-lg">{selected.customer}</h3>
                {selected.phone && <div className="text-sm opacity-70">📞 {selected.phone}</div>}
              </div>
              <div className="text-right">
                <div className="text-xs opacity-70">Outstanding</div>
                <div className="text-xl font-bold text-error">{format(selectedBalance)}</div>
              </div>
            </div>

            <div className="tabs tabs-bordered mt-2 mb-3">
              <span className="tab tab-active">Unpaid Sales ({unpaidSales.length})</span>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead><tr><th>#</th><th>Date</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Age</th></tr></thead>
                <tbody>
                  {unpaidSales.map((s) => {
                    const age = Math.floor((Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={s.id}>
                        <td>#{s.id}</td>
                        <td className="text-xs">{s.created_at}</td>
                        <td className="text-right">{format(s.total)}</td>
                        <td className="text-right">{format(s.paid)}</td>
                        <td className="text-right text-error">{format(s.total - s.paid)}</td>
                        <td className={age > 60 ? "text-error" : age > 30 ? "text-warning" : ""}>{age}d</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {paymentHistory.length > 0 && (
              <>
                <div className="tabs tabs-bordered mt-4 mb-2">
                  <span className="tab tab-active">Payment History</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table table-xs">
                    <thead><tr><th>Date</th><th>Sale</th><th className="text-right">Amount</th><th>Note</th></tr></thead>
                    <tbody>
                      {paymentHistory.slice(0, 20).map((p) => (
                        <tr key={p.id}>
                          <td className="text-xs">{p.created_at}</td>
                          <td>#{p.sale_id}</td>
                          <td className="text-right">{format(p.amount)}</td>
                          <td>{p.note ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {paidSales.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold opacity-70">Recently paid sales ({paidSales.length})</summary>
                <table className="table table-xs mt-2">
                  <thead><tr><th>#</th><th>Date</th><th className="text-right">Total</th></tr></thead>
                  <tbody>{paidSales.map((s) => <tr key={s.id}><td>#{s.id}</td><td className="text-xs">{s.created_at}</td><td className="text-right">{format(s.total)}</td></tr>)}</tbody>
                </table>
              </details>
            )}

            <div className="modal-action">
              <button type="button" className="btn btn-sm" onClick={closeDetail}>Close</button>
              <button type="button" className="btn btn-sm" onClick={openStatement}>Print Statement</button>
              {canCollect && selectedBalance > 0 && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setCollect({ amount: String(selectedBalance), note: "" })}>
                  Collect Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {collect && selected && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Collect Payment — {selected.customer}</h3>
            <div className="text-sm opacity-70 mb-3">Balance: <span className="font-bold text-error">{format(selectedBalance)}</span></div>
            <form onSubmit={submitCollect} className="flex flex-col gap-3">
              <label className="form-control">
                <span className="label-text">Amount received</span>
                <input
                  type="number" step="0.01" min={0.01} max={selectedBalance}
                  className="input input-bordered input-sm"
                  value={collect.amount}
                  onChange={(e) => setCollect({ ...collect, amount: e.target.value })}
                  autoFocus required
                />
              </label>
              <label className="form-control">
                <span className="label-text">Note (optional)</span>
                <input className="input input-bordered input-sm" value={collect.note} onChange={(e) => setCollect({ ...collect, note: e.target.value })} />
              </label>

              {collectPreview.length > 0 && (
                <div className="bg-base-200 p-3 rounded text-sm">
                  <div className="font-semibold mb-1">Allocation (oldest first):</div>
                  <ul className="space-y-0.5">
                    {collectPreview.map((a) => (
                      <li key={a.sale.id} className="flex justify-between">
                        <span>Sale #{a.sale.id} ({a.sale.created_at.slice(0, 10)})</span>
                        <span className="font-mono">{format(a.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setCollect(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary" disabled={collectPreview.length === 0}>Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {statementOpen && selected && (
        <CustomerStatement
          customer={selected}
          unpaidSales={unpaidSales}
          saleItems={statementItems}
          payments={paymentHistory}
          shopName={settings.shop_name}
          currency={settings.currency}
          onClose={() => setStatementOpen(false)}
        />
      )}
    </div>
  );
}
