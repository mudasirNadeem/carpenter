import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { can, type Product, type StockMovement } from "../types";

export default function Inventory() {
  const { user } = useAuth();
  const canEdit = can(user?.role, "inventory.edit");
  const [products, setProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: 0, change: 0, reason: "purchase", note: "" });

  async function load() {
    const db = await getDb();
    setProducts(await db.select<Product[]>("SELECT * FROM products ORDER BY name"));
    setHistory(await db.select<StockMovement[]>(
      `SELECT m.*, p.name as product_name, u.username
       FROM stock_movements m
       LEFT JOIN products p ON p.id = m.product_id
       LEFT JOIN users u ON u.id = m.user_id
       ORDER BY m.id DESC LIMIT 100`,
    ));
  }
  useEffect(() => { load(); }, []);

  const lowStock = products.filter((p) => p.quantity <= p.low_stock_threshold);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.product_id || form.change === 0) return;
    const db = await getDb();
    await db.execute("UPDATE products SET quantity = quantity + ? WHERE id = ?", [+form.change, form.product_id]);
    await db.execute(
      "INSERT INTO stock_movements (product_id, change, reason, note, user_id) VALUES (?, ?, ?, ?, ?)",
      [form.product_id, +form.change, form.reason, form.note, user?.id ?? null],
    );
    setOpen(false);
    setForm({ product_id: 0, change: 0, reason: "purchase", note: "" });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Inventory</h1>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ Stock Movement</button>}
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning mb-4">
          <span>⚠ Low stock: {lowStock.map((p) => `${p.name} (${p.quantity})`).join(", ")}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Current Stock</h2>
          <table className="table table-sm">
            <thead><tr><th>Product</th><th className="text-right">Qty</th><th className="text-right">Threshold</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.quantity <= p.low_stock_threshold ? "text-warning" : ""}>
                  <td>{p.name}</td><td className="text-right">{p.quantity}</td><td className="text-right">{p.low_stock_threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">Recent Stock History</h2>
          <table className="table table-sm">
            <thead><tr><th>Date</th><th>Product</th><th>Change</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="text-xs">{h.created_at}</td>
                  <td>{h.product_name}</td>
                  <td className={h.change >= 0 ? "text-success" : "text-error"}>{h.change > 0 ? "+" : ""}{h.change}</td>
                  <td>{h.reason}</td>
                  <td>{h.username ?? "-"}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="text-center opacity-60">No history.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Stock Movement</h3>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <select className="select select-bordered select-sm" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: +e.target.value })} required>
                <option value={0}>-- Product --</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stock: {p.quantity})</option>)}
              </select>
              <label className="form-control"><span className="label-text">Change (+in / -out)</span>
                <input type="number" step="0.01" className="input input-bordered input-sm" value={form.change} onChange={(e) => setForm({ ...form, change: +e.target.value })} required />
              </label>
              <select className="select select-bordered select-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                <option value="purchase">Purchase (in)</option>
                <option value="adjustment">Adjustment</option>
                <option value="used">Used in work (out)</option>
                <option value="waste">Waste/Damage (out)</option>
                <option value="return">Return</option>
              </select>
              <input className="input input-bordered input-sm" placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary">Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
