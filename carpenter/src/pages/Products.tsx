import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { can, type Product } from "../types";
import { useSettings } from "../settings";

const EMPTY: Omit<Product, "id" | "created_at"> = {
  name: "", type: "sheet", cost_price: 0, sale_price: 0, quantity: 0, size: "", material: "", low_stock_threshold: 5,
};

export default function Products() {
  const { user } = useAuth();
  const { format } = useSettings();
  const [items, setItems] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [query, setQuery] = useState("");

  const canEdit = can(user?.role, "products.edit");

  async function load() {
    const db = await getDb();
    const rows = await db.select<Product[]>("SELECT * FROM products ORDER BY name");
    setItems(rows);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(p: Product) { setEditing(p); setForm({ ...p }); setOpen(true); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const db = await getDb();
    if (editing) {
      await db.execute(
        "UPDATE products SET name=?, type=?, cost_price=?, sale_price=?, quantity=?, size=?, material=?, low_stock_threshold=? WHERE id=?",
        [form.name, form.type, +form.cost_price, +form.sale_price, +form.quantity, form.size, form.material, +form.low_stock_threshold, editing.id],
      );
    } else {
      await db.execute(
        "INSERT INTO products (name, type, cost_price, sale_price, quantity, size, material, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [form.name, form.type, +form.cost_price, +form.sale_price, +form.quantity, form.size, form.material, +form.low_stock_threshold],
      );
    }
    setOpen(false);
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`Delete "${p.name}"? This also removes its stock history.`)) return;
    const db = await getDb();
    await db.execute("DELETE FROM products WHERE id = ?", [p.id]);
    load();
  }

  const filtered = items.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.type.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
        <input className="input input-bordered input-sm flex-1 max-w-xs" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} />
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ New Product</button>}
      </div>

      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-sm">
          <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Material</th><th className="text-right">Cost</th><th className="text-right">Price</th><th className="text-right">Stock</th><th></th></tr></thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className={p.quantity <= p.low_stock_threshold ? "bg-warning/10" : ""}>
                <td className="font-medium">{p.name}</td>
                <td><span className="badge badge-outline">{p.type}</span></td>
                <td>{p.size}</td>
                <td>{p.material}</td>
                <td className="text-right">{format(p.cost_price)}</td>
                <td className="text-right">{format(p.sale_price)}</td>
                <td className="text-right">{p.quantity}{p.quantity <= p.low_stock_threshold && <span className="badge badge-warning badge-xs ml-2">LOW</span>}</td>
                <td className="text-right">
                  {canEdit && <>
                    <button className="btn btn-xs mr-1" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn btn-xs btn-error" onClick={() => remove(p)}>Del</button>
                  </>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center opacity-60">No products.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box max-w-xl">
            <h3 className="font-bold text-lg mb-4">{editing ? "Edit" : "New"} Product</h3>
            <form onSubmit={submit} className="grid grid-cols-2 gap-3">
              <label className="form-control"><span className="label-text">Name</span><input className="input input-bordered input-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
              <label className="form-control"><span className="label-text">Type</span>
                <select className="select select-bordered select-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="sheet">Sheet</option><option value="table">Table</option><option value="cupboard">Cupboard</option><option value="other">Other</option>
                </select>
              </label>
              <label className="form-control"><span className="label-text">Size</span><input className="input input-bordered input-sm" value={form.size ?? ""} onChange={(e) => setForm({ ...form, size: e.target.value })} /></label>
              <label className="form-control"><span className="label-text">Material</span><input className="input input-bordered input-sm" value={form.material ?? ""} onChange={(e) => setForm({ ...form, material: e.target.value })} /></label>
              <label className="form-control"><span className="label-text">Cost Price</span><input type="number" step="0.01" className="input input-bordered input-sm" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} /></label>
              <label className="form-control"><span className="label-text">Sale Price</span><input type="number" step="0.01" className="input input-bordered input-sm" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} /></label>
              <label className="form-control"><span className="label-text">Quantity</span><input type="number" step="0.01" className="input input-bordered input-sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
              <label className="form-control"><span className="label-text">Low Stock Threshold</span><input type="number" step="0.01" className="input input-bordered input-sm" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></label>
              <div className="modal-action col-span-2">
                <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary">{editing ? "Save" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
