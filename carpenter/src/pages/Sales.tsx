import { useEffect, useState } from "react";
import { getDb, withTransaction } from "../db";
import { useAuth } from "../auth";
import { can, type Customer, type Payment, type PaymentStatus, type Product, type Sale, type SaleItem } from "../types";
import { useSettings } from "../settings";
import { useConfirm } from "../ConfirmDialog";
import Receipt from "../Receipt";

interface Line { product_id: number; quantity: number; unit_price: number; unit_cost: number; }

export default function Sales() {
  const { user } = useAuth();
  const { settings, format } = useSettings();
  const confirm = useConfirm();
  const canCreate = can(user?.role, "sales.create");
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState<number | 0>(0);
  const [walkInName, setWalkInName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ sale: Sale; items: SaleItem[]; payments: Payment[] } | null>(null);
  const [receipt, setReceipt] = useState<{ sale: Sale; items: SaleItem[]; customerName: string | null; autoPrint: boolean } | null>(null);
  const [receive, setReceive] = useState<{ sale: Sale; amount: string; note: string } | null>(null);
  const canAdmin = can(user?.role, "users.manage");

  const [outstanding, setOutstanding] = useState(0);

  async function load() {
    const db = await getDb();
    setSales(await db.select<Sale[]>("SELECT * FROM sales ORDER BY id DESC LIMIT 200"));
    setProducts(await db.select<Product[]>("SELECT * FROM products ORDER BY name"));
    setCustomers(await db.select<Customer[]>("SELECT * FROM customers ORDER BY name"));
    const due = await db.select<{ d: number }[]>("SELECT COALESCE(SUM(total - paid), 0) as d FROM sales WHERE payment_status <> 'paid'");
    setOutstanding(due[0]?.d ?? 0);
  }
  useEffect(() => { load(); }, []);

  function addLine() { setLines([...lines, { product_id: 0, quantity: 1, unit_price: 0, unit_cost: 0 }]); }
  function updateLine(idx: number, patch: Partial<Line>) {
    const next = [...lines];
    next[idx] = { ...next[idx], ...patch };
    if (patch.product_id !== undefined) {
      const p = products.find((x) => x.id === patch.product_id);
      if (p) { next[idx].unit_price = p.sale_price; next[idx].unit_cost = p.cost_price; }
    }
    setLines(next);
  }
  function removeLine(idx: number) { setLines(lines.filter((_, i) => i !== idx)); }

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const profit = lines.reduce((s, l) => s + l.quantity * (l.unit_price - l.unit_cost), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = lines.filter((l) => l.product_id && l.quantity > 0);
    if (valid.length === 0) return alert("Add at least one product.");

    for (const l of valid) {
      const p = products.find((x) => x.id === l.product_id);
      if (!p) continue;
      const available = editingSaleId
        ? p.quantity + (await getOldQty(editingSaleId, l.product_id))
        : p.quantity;
      if (l.quantity > available) {
        const ok = await confirm({
          title: "Stock shortage",
          message: `${p.name}: selling ${l.quantity} but only ${available} in stock. Proceed anyway?`,
          confirmLabel: "Proceed",
          danger: true,
        });
        if (!ok) return;
      }
    }
    const paid = Math.max(0, Math.min(total, Number(paidAmount === "" ? total : paidAmount) || 0));
    const status: PaymentStatus = paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid";

    try {
      const saleId = await withTransaction(async (db) => {
        let id: number;
        if (editingSaleId) {
          const oldItems = await db.select<SaleItem[]>("SELECT * FROM sale_items WHERE sale_id = ?", [editingSaleId]);
          for (const oi of oldItems) {
            await db.execute("UPDATE products SET quantity = quantity + ? WHERE id = ?", [oi.quantity, oi.product_id]);
            await db.execute(
              "INSERT INTO stock_movements (product_id, change, reason, note, user_id) VALUES (?, ?, 'sale_edit', ?, ?)",
              [oi.product_id, oi.quantity, `Sale #${editingSaleId} edit: reversal`, user?.id ?? null],
            );
          }
          await db.execute("DELETE FROM sale_items WHERE sale_id = ?", [editingSaleId]);
          await db.execute(
            "UPDATE sales SET customer_id=?, customer_name=?, total=?, profit=?, paid=?, payment_status=? WHERE id=?",
            [customerId || null, walkInName || null, total, profit, paid, status, editingSaleId],
          );
          id = editingSaleId;
        } else {
          const result = await db.execute(
            "INSERT INTO sales (customer_id, customer_name, user_id, total, profit, paid, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [customerId || null, walkInName || null, user?.id ?? null, total, profit, paid, status],
          );
          id = result.lastInsertId!;
          if (paid > 0) {
            await db.execute(
              "INSERT INTO payments (sale_id, amount, user_id) VALUES (?, ?, ?)",
              [id, paid, user?.id ?? null],
            );
          }
        }
        for (const l of valid) {
          await db.execute(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_cost, unit_price) VALUES (?, ?, ?, ?, ?)",
            [id, l.product_id, l.quantity, l.unit_cost, l.unit_price],
          );
          await db.execute("UPDATE products SET quantity = quantity - ? WHERE id = ?", [l.quantity, l.product_id]);
          await db.execute(
            "INSERT INTO stock_movements (product_id, change, reason, note, user_id) VALUES (?, ?, 'sale', ?, ?)",
            [l.product_id, -l.quantity, `Sale #${id}`, user?.id ?? null],
          );
        }
        return id;
      });

      setOpen(false);
      const db = await getDb();
      const createdItems = await db.select<SaleItem[]>(
        "SELECT si.*, p.name as product_name FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE sale_id = ?",
        [saleId],
      );
      const createdSale = (await db.select<Sale[]>("SELECT * FROM sales WHERE id = ?", [saleId]))[0];
      const cName = customers.find((x) => x.id === customerId)?.name ?? walkInName ?? null;
      if (!editingSaleId) {
        setReceipt({ sale: createdSale, items: createdItems, customerName: cName, autoPrint: false });
      }
      setLines([]); setCustomerId(0); setWalkInName(""); setPaidAmount(""); setEditingSaleId(null);
      load();
    } catch (err: any) {
      alert(`Sale failed: ${err.message ?? err}`);
    }
  }

  async function getOldQty(saleId: number, productId: number): Promise<number> {
    const db = await getDb();
    const rows = await db.select<{ q: number }[]>(
      "SELECT COALESCE(SUM(quantity), 0) as q FROM sale_items WHERE sale_id = ? AND product_id = ?",
      [saleId, productId],
    );
    return rows[0]?.q ?? 0;
  }

  async function editSale(s: Sale) {
    const db = await getDb();
    const items = await db.select<SaleItem[]>("SELECT * FROM sale_items WHERE sale_id = ?", [s.id]);
    setEditingSaleId(s.id);
    setCustomerId(s.customer_id ?? 0);
    setWalkInName(s.customer_name ?? "");
    setPaidAmount(String(s.paid));
    setLines(items.map((i) => ({
      product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, unit_cost: i.unit_cost,
    })));
    setDetail(null);
    setOpen(true);
  }

  async function deleteSale(s: Sale) {
    const ok = await confirm({
      title: "Delete sale",
      message: `Delete Sale #${s.id}?\nStock will be restored and all payments for this sale will be removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await withTransaction(async (db) => {
        const items = await db.select<SaleItem[]>("SELECT * FROM sale_items WHERE sale_id = ?", [s.id]);
        for (const it of items) {
          await db.execute("UPDATE products SET quantity = quantity + ? WHERE id = ?", [it.quantity, it.product_id]);
          await db.execute(
            "INSERT INTO stock_movements (product_id, change, reason, note, user_id) VALUES (?, ?, 'sale_delete', ?, ?)",
            [it.product_id, it.quantity, `Sale #${s.id} deleted`, user?.id ?? null],
          );
        }
        await db.execute("DELETE FROM sales WHERE id = ?", [s.id]);
      });
      setDetail(null);
      load();
    } catch (err: any) {
      alert(`Delete failed: ${err.message ?? err}`);
    }
  }

  function openNewSale() {
    setEditingSaleId(null);
    setCustomerId(0);
    setWalkInName("");
    setPaidAmount("");
    setLines([{ product_id: 0, quantity: 1, unit_price: 0, unit_cost: 0 }]);
    setOpen(true);
  }

  async function viewDetail(s: Sale) {
    const db = await getDb();
    const items = await db.select<SaleItem[]>(
      "SELECT si.*, p.name as product_name FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE sale_id = ?",
      [s.id],
    );
    const payments = await db.select<Payment[]>("SELECT * FROM payments WHERE sale_id = ? ORDER BY id", [s.id]);
    setDetail({ sale: s, items, payments });
  }

  async function submitReceive(e: React.FormEvent) {
    e.preventDefault();
    if (!receive) return;
    const amt = Number(receive.amount);
    if (!amt || amt <= 0) return;
    const balance = receive.sale.total - receive.sale.paid;
    const pay = Math.min(amt, balance);
    try {
      await withTransaction(async (db) => {
        await db.execute(
          "INSERT INTO payments (sale_id, amount, note, user_id) VALUES (?, ?, ?, ?)",
          [receive.sale.id, pay, receive.note || null, user?.id ?? null],
        );
        const newPaid = receive.sale.paid + pay;
        const status: PaymentStatus = newPaid >= receive.sale.total ? "paid" : newPaid > 0 ? "partial" : "unpaid";
        await db.execute("UPDATE sales SET paid = ?, payment_status = ? WHERE id = ?", [newPaid, status, receive.sale.id]);
      });
      setReceive(null);
      load();
    } catch (err: any) {
      alert(`Payment failed: ${err.message ?? err}`);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Sales</h1>
        <div className="flex items-center gap-3">
          {outstanding > 0 && (
            <span className="text-sm">Outstanding credit: <span className="font-bold text-error">{format(outstanding)}</span></span>
          )}
          {canCreate && <button type="button" className="btn btn-primary btn-sm" onClick={openNewSale}>+ New Sale</button>}
        </div>
      </div>

      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-sm">
          <thead><tr><th>#</th><th>Date</th><th>Customer</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {sales.map((s) => {
              const c = customers.find((x) => x.id === s.customer_id);
              const balance = s.total - s.paid;
              const badge = s.payment_status === "paid" ? "badge-success" : s.payment_status === "partial" ? "badge-warning" : "badge-error";
              return (
                <tr key={s.id}>
                  <td>#{s.id}</td>
                  <td className="text-xs">{s.created_at}</td>
                  <td>{c?.name ?? s.customer_name ?? <span className="opacity-60">Walk-in</span>}</td>
                  <td className="text-right">{format(s.total)}</td>
                  <td className="text-right">{format(s.paid)}</td>
                  <td className={`text-right ${balance > 0 ? "text-error font-semibold" : ""}`}>{format(balance)}</td>
                  <td><span className={`badge badge-sm ${badge}`}>{s.payment_status}</span></td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" className="btn btn-xs mr-1" onClick={() => viewDetail(s)}>View</button>
                    {balance > 0 && <button type="button" className="btn btn-xs btn-primary" onClick={() => setReceive({ sale: s, amount: String(balance), note: "" })}>Receive</button>}
                  </td>
                </tr>
              );
            })}
            {sales.length === 0 && <tr><td colSpan={8} className="text-center opacity-60">No sales.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <h3 className="font-bold text-lg mb-4">{editingSaleId ? `Edit Sale #${editingSaleId}` : "New Sale"}</h3>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <select className="select select-bordered select-sm" value={customerId} onChange={(e) => setCustomerId(+e.target.value)}>
                  <option value={0}>Walk-in customer</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {!customerId && <input className="input input-bordered input-sm" placeholder="Walk-in name (optional)" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />}
              </div>

              <table className="table table-sm">
                <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th className="text-right">Line Total</th><th></th></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <select className="select select-bordered select-xs" value={l.product_id} onChange={(e) => updateLine(i, { product_id: +e.target.value })}>
                          <option value={0}>--</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stk: {p.quantity})</option>)}
                        </select>
                      </td>
                      <td><input type="number" step="0.01" className="input input-bordered input-xs w-20" value={l.quantity} onChange={(e) => updateLine(i, { quantity: +e.target.value })} /></td>
                      <td><input type="number" step="0.01" className="input input-bordered input-xs w-24" value={l.unit_price} onChange={(e) => updateLine(i, { unit_price: +e.target.value })} /></td>
                      <td className="text-right">{format(l.quantity * l.unit_price)}</td>
                      <td><button type="button" className="btn btn-xs btn-ghost" onClick={() => removeLine(i)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn btn-xs self-start" onClick={addLine}>+ Add Line</button>

              <div className="flex justify-end gap-6 text-sm items-center">
                <div>Profit: <span className="font-bold text-success">{format(profit)}</span></div>
                <div>Total: <span className="font-bold">{format(total)}</span></div>
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
              {paidAmount !== "" && +paidAmount < total && (
                <div className="text-right text-sm text-warning">Balance due: {format(Math.max(0, total - (+paidAmount || 0)))}</div>
              )}

              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); setEditingSaleId(null); }}>Cancel</button>
                <button className="btn btn-sm btn-primary">{editingSaleId ? "Save Changes" : "Create Sale"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Sale #{detail.sale.id}</h3>
            <p className="text-xs opacity-60">{detail.sale.created_at}</p>
            <table className="table table-sm mt-2">
              <thead><tr><th>Product</th><th>Qty</th><th className="text-right">Unit</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {detail.items.map((i) => <tr key={i.id}><td>{i.product_name}</td><td>{i.quantity}</td><td className="text-right">{format(i.unit_price)}</td><td className="text-right">{format(i.quantity * i.unit_price)}</td></tr>)}
              </tbody>
            </table>
            <div className="text-right mt-2 text-sm">
              <div>Total: <span className="font-bold">{format(detail.sale.total)}</span></div>
              <div>Paid: <span className="text-success">{format(detail.sale.paid)}</span></div>
              {detail.sale.total - detail.sale.paid > 0 && (
                <div>Balance: <span className="text-error font-semibold">{format(detail.sale.total - detail.sale.paid)}</span></div>
              )}
              <div className="opacity-70">Profit: {format(detail.sale.profit)}</div>
            </div>

            {detail.payments.length > 0 && (
              <div className="mt-3">
                <div className="font-semibold text-sm mb-1">Payment history</div>
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

            <div className="modal-action flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setDetail(null)}>Close</button>
              {canAdmin && <button type="button" className="btn btn-sm btn-error" onClick={() => deleteSale(detail.sale)}>Delete</button>}
              {canAdmin && <button type="button" className="btn btn-sm" onClick={() => editSale(detail.sale)}>Edit</button>}
              {detail.sale.total - detail.sale.paid > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => {
                  setReceive({ sale: detail.sale, amount: String(detail.sale.total - detail.sale.paid), note: "" });
                  setDetail(null);
                }}>Receive Payment</button>
              )}
              <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                const c = customers.find((x) => x.id === detail.sale.customer_id);
                setReceipt({ sale: detail.sale, items: detail.items, customerName: c?.name ?? detail.sale.customer_name, autoPrint: true });
                setDetail(null);
              }}>Print Receipt</button>
            </div>
          </div>
        </div>
      )}

      {receive && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Receive Payment — Sale #{receive.sale.id}</h3>
            <div className="text-sm opacity-70 mb-3">
              Total {format(receive.sale.total)} · Paid {format(receive.sale.paid)} · <span className="text-error">Balance {format(receive.sale.total - receive.sale.paid)}</span>
            </div>
            <form onSubmit={submitReceive} className="flex flex-col gap-3">
              <label className="form-control">
                <span className="label-text">Amount received</span>
                <input type="number" step="0.01" min={0.01} max={receive.sale.total - receive.sale.paid}
                  className="input input-bordered input-sm"
                  value={receive.amount}
                  onChange={(e) => setReceive({ ...receive, amount: e.target.value })}
                  autoFocus required />
              </label>
              <label className="form-control">
                <span className="label-text">Note (optional)</span>
                <input className="input input-bordered input-sm" value={receive.note} onChange={(e) => setReceive({ ...receive, note: e.target.value })} />
              </label>
              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setReceive(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary">Record Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receipt && (
        <Receipt
          sale={receipt.sale}
          items={receipt.items}
          shopName={settings.shop_name}
          currency={settings.currency}
          customerName={receipt.customerName}
          autoPrint={receipt.autoPrint}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
