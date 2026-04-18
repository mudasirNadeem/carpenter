import { useEffect, useMemo, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { useSettings } from "../settings";
import { can, type PaymentStatus, type Product, type Purchase, type PurchaseItem, type Supplier, type SupplierPayment } from "../types";

interface Line { product_id: number; quantity: number; unit_cost: number; }

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}

export default function Purchases() {
  const { user } = useAuth();
  const { format } = useSettings();
  const canCreate = can(user?.role, "purchases.create");

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);

  // form state
  const [supplierId, setSupplierId] = useState<number>(0);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([{ product_id: 0, quantity: 0, unit_cost: 0 }]);
  const [bonusPerUnit, setBonusPerUnit] = useState<string>("0");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [note, setNote] = useState("");

  const [detail, setDetail] = useState<{ purchase: Purchase; items: PurchaseItem[]; payments: SupplierPayment[] } | null>(null);
  const [pay, setPay] = useState<{ purchase: Purchase; amount: string; note: string } | null>(null);
  const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7));

  async function load() {
    const db = await getDb();
    setPurchases(await db.select<Purchase[]>("SELECT * FROM purchases ORDER BY id DESC LIMIT 300"));
    setSuppliers(await db.select<Supplier[]>("SELECT * FROM suppliers ORDER BY name"));
    setProducts(await db.select<Product[]>("SELECT * FROM products ORDER BY name"));
  }
  useEffect(() => { load(); }, []);

  function addLine() { setLines([...lines, { product_id: 0, quantity: 0, unit_cost: 0 }]); }
  function updateLine(idx: number, patch: Partial<Line>) {
    const next = [...lines];
    next[idx] = { ...next[idx], ...patch };
    if (patch.product_id !== undefined) {
      const p = products.find((x) => x.id === patch.product_id);
      if (p && !next[idx].unit_cost) next[idx].unit_cost = p.cost_price;
    }
    setLines(next);
  }
  function removeLine(idx: number) { setLines(lines.filter((_, i) => i !== idx)); }

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);
  const bonusTotal = totalUnits * (Number(bonusPerUnit) || 0);

  function openNew() {
    setSupplierId(0);
    setInvoiceNumber("");
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setLines([{ product_id: 0, quantity: 0, unit_cost: 0 }]);
    setBonusPerUnit("0");
    setPaidAmount("");
    setNote("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) return alert("Select a supplier.");
    const valid = lines.filter((l) => l.product_id && l.quantity > 0);
    if (valid.length === 0) return alert("Add at least one product.");

    const paid = Math.max(0, Math.min(total, Number(paidAmount === "" ? total : paidAmount) || 0));
    const status: PaymentStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";

    const db = await getDb();
    try {
      const result = await db.execute(
        `INSERT INTO purchases
           (supplier_id, invoice_number, user_id, total, paid, payment_status, bonus_per_unit, bonus_total, note, purchase_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [supplierId, invoiceNumber || null, user?.id ?? null, total, paid, status, Number(bonusPerUnit) || 0, bonusTotal, note || null, purchaseDate],
      );
      const id = result.lastInsertId!;
      if (paid > 0) {
        await db.execute(
          "INSERT INTO supplier_payments (purchase_id, amount, user_id) VALUES (?, ?, ?)",
          [id, paid, user?.id ?? null],
        );
      }
      for (const l of valid) {
        await db.execute(
          "INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)",
          [id, l.product_id, l.quantity, l.unit_cost],
        );
        await db.execute("UPDATE products SET quantity = quantity + ?, cost_price = ? WHERE id = ?",
          [l.quantity, l.unit_cost, l.product_id]);
        await db.execute(
          "INSERT INTO stock_movements (product_id, change, reason, note, user_id) VALUES (?, ?, 'purchase', ?, ?)",
          [l.product_id, l.quantity, `Purchase #${id}`, user?.id ?? null],
        );
      }
      setOpen(false);
      load();
    } catch (err: any) {
      alert(`Purchase failed: ${err.message ?? err}`);
    }
  }

  async function viewDetail(p: Purchase) {
    const db = await getDb();
    const items = await db.select<PurchaseItem[]>(
      "SELECT pi.*, pr.name as product_name FROM purchase_items pi LEFT JOIN products pr ON pr.id = pi.product_id WHERE purchase_id = ?",
      [p.id],
    );
    const payments = await db.select<SupplierPayment[]>("SELECT * FROM supplier_payments WHERE purchase_id = ? ORDER BY id", [p.id]);
    setDetail({ purchase: p, items, payments });
  }

  async function submitPay(e: React.FormEvent) {
    e.preventDefault();
    if (!pay) return;
    const amt = Math.max(0, Math.min(pay.purchase.total - pay.purchase.paid, Number(pay.amount) || 0));
    if (amt <= 0) return;
    const db = await getDb();
    try {
      await db.execute(
        "INSERT INTO supplier_payments (purchase_id, amount, note, user_id) VALUES (?, ?, ?, ?)",
        [pay.purchase.id, amt, pay.note || null, user?.id ?? null],
      );
      const newPaid = pay.purchase.paid + amt;
      const status: PaymentStatus = newPaid >= pay.purchase.total ? "paid" : newPaid > 0 ? "partial" : "unpaid";
      await db.execute("UPDATE purchases SET paid = ?, payment_status = ? WHERE id = ?",
        [newPaid, status, pay.purchase.id]);
      setPay(null);
      load();
    } catch (err: any) {
      alert(`Payment failed: ${err.message ?? err}`);
    }
  }

  const monthlyStats = useMemo(() => {
    const filtered = purchases.filter((p) => monthKey(p.purchase_date) === monthFilter);
    const total = filtered.reduce((s, p) => s + p.total, 0);
    const bonus = filtered.reduce((s, p) => s + p.bonus_total, 0);
    const paid = filtered.reduce((s, p) => s + p.paid, 0);
    const balance = total - paid;
    return { count: filtered.length, total, bonus, balance, filtered };
  }, [purchases, monthFilter]);

  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    set.add(new Date().toISOString().slice(0, 7));
    for (const p of purchases) set.add(monthKey(p.purchase_date));
    return [...set].sort().reverse();
  }, [purchases]);

  if (!can(user?.role, "purchases.view")) {
    return <div className="alert alert-warning">You do not have permission.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Purchases</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="month-filter" className="text-sm">Month</label>
          <select id="month-filter" className="select select-bordered select-sm" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {canCreate && <button type="button" className="btn btn-primary btn-sm" onClick={openNew}>+ New Purchase</button>}
        </div>
      </div>

      <div className="stats stats-vertical md:stats-horizontal shadow bg-base-100 w-full mb-4">
        <div className="stat">
          <div className="stat-title">Month Purchases</div>
          <div className="stat-value text-primary">{format(monthlyStats.total)}</div>
          <div className="stat-desc">{monthlyStats.count} invoices</div>
        </div>
        <div className="stat">
          <div className="stat-title">Bonus Earned (Month)</div>
          <div className="stat-value text-success">{format(monthlyStats.bonus)}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Owed to Suppliers (Month)</div>
          <div className="stat-value text-error">{format(monthlyStats.balance)}</div>
        </div>
      </div>

      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>#</th><th>Date</th><th>Supplier</th><th>Invoice</th>
              <th className="text-right">Total</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Balance</th>
              <th className="text-right">Bonus</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {monthlyStats.filtered.map((p) => {
              const balance = p.total - p.paid;
              const badge = p.payment_status === "paid" ? "badge-success" : p.payment_status === "partial" ? "badge-warning" : "badge-error";
              return (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td className="text-xs">{p.purchase_date}</td>
                  <td>{p.supplier_id ? supplierMap[p.supplier_id] : "-"}</td>
                  <td className="text-xs">{p.invoice_number ?? "-"}</td>
                  <td className="text-right">{format(p.total)}</td>
                  <td className="text-right">{format(p.paid)}</td>
                  <td className={`text-right ${balance > 0 ? "text-error font-semibold" : ""}`}>{format(balance)}</td>
                  <td className="text-right text-success">{format(p.bonus_total)}</td>
                  <td><span className={`badge badge-sm ${badge}`}>{p.payment_status}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" className="btn btn-xs mr-1" onClick={() => viewDetail(p)}>View</button>
                    {balance > 0 && canCreate && <button type="button" className="btn btn-xs btn-primary" onClick={() => setPay({ purchase: p, amount: String(balance), note: "" })}>Pay</button>}
                  </td>
                </tr>
              );
            })}
            {monthlyStats.filtered.length === 0 && <tr><td colSpan={10} className="text-center opacity-60 py-6">No purchases for {monthFilter}.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-bold text-lg mb-4">New Purchase</h3>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <label className="form-control">
                  <span className="label-text text-xs">Supplier</span>
                  <select className="select select-bordered select-sm" value={supplierId} onChange={(e) => setSupplierId(+e.target.value)} required>
                    <option value={0}>-- Supplier --</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Invoice #</span>
                  <input className="input input-bordered input-sm" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Purchase Date</span>
                  <input type="date" className="input input-bordered input-sm" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} required />
                </label>
              </div>

              <table className="table table-sm">
                <thead><tr><th>Product</th><th>Qty (sheets)</th><th>Unit Cost</th><th className="text-right">Line Total</th><th></th></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select className="select select-bordered select-xs" value={l.product_id} onChange={(e) => updateLine(i, { product_id: +e.target.value })}>
                          <option value={0}>--</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td><input type="number" step="0.01" className="input input-bordered input-xs w-20" value={l.quantity} onChange={(e) => updateLine(i, { quantity: +e.target.value })} /></td>
                      <td><input type="number" step="0.01" className="input input-bordered input-xs w-24" value={l.unit_cost} onChange={(e) => updateLine(i, { unit_cost: +e.target.value })} /></td>
                      <td className="text-right">{format(l.quantity * l.unit_cost)}</td>
                      <td><button type="button" className="btn btn-xs btn-ghost" onClick={() => removeLine(i)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn btn-xs self-start" onClick={addLine}>+ Add Line</button>

              <div className="grid grid-cols-2 gap-3 bg-base-200 rounded p-3">
                <label className="form-control">
                  <span className="label-text text-xs">Bonus per sheet (from company)</span>
                  <input type="number" step="0.01" min={0} className="input input-bordered input-sm"
                    value={bonusPerUnit}
                    onChange={(e) => setBonusPerUnit(e.target.value)} />
                </label>
                <div className="flex flex-col justify-end text-sm">
                  <div>Total units: <span className="font-bold">{totalUnits}</span></div>
                  <div>Bonus total: <span className="font-bold text-success">{format(bonusTotal)}</span></div>
                </div>
              </div>

              <div className="flex justify-end items-center gap-2 text-sm">
                <span>Total: <span className="font-bold">{format(total)}</span></span>
              </div>

              <div className="flex justify-end items-center gap-2 text-sm">
                <label htmlFor="paid-input" className="label-text">Amount Paid</label>
                <input id="paid-input" type="number" step="0.01" min={0} max={total} className="input input-bordered input-sm w-32"
                  placeholder={String(total.toFixed(2))}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)} />
                <button type="button" className="btn btn-xs" onClick={() => setPaidAmount(String(total))}>Full</button>
                <button type="button" className="btn btn-xs" onClick={() => setPaidAmount("0")}>Credit</button>
              </div>

              <input className="input input-bordered input-sm" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary">Record Purchase</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Purchase #{detail.purchase.id}</h3>
            <div className="text-sm opacity-70 mb-2">
              {supplierMap[detail.purchase.supplier_id ?? 0]} · {detail.purchase.purchase_date}
              {detail.purchase.invoice_number && ` · Invoice ${detail.purchase.invoice_number}`}
            </div>
            <table className="table table-sm">
              <thead><tr><th>Product</th><th>Qty</th><th className="text-right">Unit</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {detail.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.product_name}</td>
                    <td>{i.quantity}</td>
                    <td className="text-right">{format(i.unit_cost)}</td>
                    <td className="text-right">{format(i.quantity * i.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right mt-2 text-sm">
              <div>Total: <span className="font-bold">{format(detail.purchase.total)}</span></div>
              <div>Paid: <span className="text-success">{format(detail.purchase.paid)}</span></div>
              {detail.purchase.total - detail.purchase.paid > 0 && (
                <div>Balance: <span className="text-error font-semibold">{format(detail.purchase.total - detail.purchase.paid)}</span></div>
              )}
              <div className="text-success">Bonus ({format(detail.purchase.bonus_per_unit)}/sheet): {format(detail.purchase.bonus_total)}</div>
            </div>

            {detail.payments.length > 0 && (
              <div className="mt-3">
                <div className="font-semibold text-sm mb-1">Payments to supplier</div>
                <table className="table table-xs">
                  <thead><tr><th>Date</th><th className="text-right">Amount</th><th>Note</th></tr></thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.id}><td className="text-xs">{p.created_at}</td><td className="text-right">{format(p.amount)}</td><td>{p.note}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-action">
              <button type="button" className="btn btn-sm" onClick={() => setDetail(null)}>Close</button>
              {detail.purchase.total - detail.purchase.paid > 0 && canCreate && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                  setPay({ purchase: detail.purchase, amount: String(detail.purchase.total - detail.purchase.paid), note: "" });
                  setDetail(null);
                }}>Pay Supplier</button>
              )}
            </div>
          </div>
        </div>
      )}

      {pay && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Pay Supplier — Purchase #{pay.purchase.id}</h3>
            <div className="text-sm opacity-70 mb-3">
              Total {format(pay.purchase.total)} · Paid {format(pay.purchase.paid)} · <span className="text-error">Balance {format(pay.purchase.total - pay.purchase.paid)}</span>
            </div>
            <form onSubmit={submitPay} className="flex flex-col gap-3">
              <label className="form-control">
                <span className="label-text">Amount paid</span>
                <input type="number" step="0.01" min={0.01} max={pay.purchase.total - pay.purchase.paid}
                  className="input input-bordered input-sm"
                  value={pay.amount}
                  onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                  autoFocus required />
              </label>
              <label className="form-control">
                <span className="label-text">Note (optional)</span>
                <input className="input input-bordered input-sm" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
              </label>
              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setPay(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
