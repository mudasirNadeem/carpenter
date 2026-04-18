import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { can, type Customer, type Order, type OrderStatus } from "../types";
import { useSettings } from "../settings";
import { useConfirm } from "../ConfirmDialog";

const STATUSES: OrderStatus[] = ["pending", "in_progress", "completed", "cancelled"];

export default function Orders() {
  const { user } = useAuth();
  const { format } = useSettings();
  const confirm = useConfirm();
  const canEdit = can(user?.role, "orders.edit");
  const [items, setItems] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [form, setForm] = useState<any>({ customer_id: 0, customer_name: "", description: "", price: 0, status: "pending" });

  async function load() {
    const db = await getDb();
    setItems(await db.select<Order[]>("SELECT * FROM orders ORDER BY id DESC"));
    setCustomers(await db.select<Customer[]>("SELECT * FROM customers ORDER BY name"));
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const db = await getDb();
    if (editing) {
      await db.execute(
        "UPDATE orders SET customer_id=?, customer_name=?, description=?, price=?, status=?, updated_at=datetime('now') WHERE id=?",
        [form.customer_id || null, form.customer_name, form.description, +form.price, form.status, editing.id],
      );
    } else {
      await db.execute(
        "INSERT INTO orders (customer_id, customer_name, description, price, status) VALUES (?, ?, ?, ?, ?)",
        [form.customer_id || null, form.customer_name, form.description, +form.price, form.status],
      );
    }
    setOpen(false); setEditing(null);
    setForm({ customer_id: 0, customer_name: "", description: "", price: 0, status: "pending" });
    load();
  }

  async function setStatus(o: Order, status: OrderStatus) {
    const db = await getDb();
    await db.execute("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?", [status, o.id]);
    load();
  }

  async function remove(o: Order) {
    const ok = await confirm({
      title: "Delete order",
      message: `Delete order #${o.id}${o.description ? ` — ${o.description}` : ""}?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const db = await getDb();
    await db.execute("DELETE FROM orders WHERE id = ?", [o.id]);
    load();
  }

  const badgeClass = (s: OrderStatus) => ({
    pending: "badge-warning", in_progress: "badge-info", completed: "badge-success", cancelled: "badge-ghost",
  }[s]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Custom Orders</h1>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm({ customer_id: 0, customer_name: "", description: "", price: 0, status: "pending" }); setOpen(true); }}>+ New Order</button>}
      </div>

      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-sm">
          <thead><tr><th>#</th><th>Customer</th><th>Description</th><th className="text-right">Price</th><th>Status</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {items.map((o) => {
              const c = customers.find((x) => x.id === o.customer_id);
              return (
                <tr key={o.id}>
                  <td>#{o.id}</td>
                  <td>{c?.name ?? o.customer_name}</td>
                  <td className="max-w-xs truncate">{o.description}</td>
                  <td className="text-right">{format(o.price)}</td>
                  <td><span className={`badge ${badgeClass(o.status)}`}>{o.status}</span></td>
                  <td className="text-xs">{o.updated_at}</td>
                  <td className="text-right">
                    {canEdit && <>
                      <select className="select select-xs mr-1" value={o.status} onChange={(e) => setStatus(o, e.target.value as OrderStatus)}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button className="btn btn-xs mr-1" onClick={() => { setEditing(o); setForm({ ...o, customer_id: o.customer_id ?? 0, customer_name: o.customer_name ?? "" }); setOpen(true); }}>Edit</button>
                      <button className="btn btn-xs btn-error" onClick={() => remove(o)}>Del</button>
                    </>}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={7} className="text-center opacity-60">No orders.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">{editing ? "Edit" : "New"} Order</h3>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <select className="select select-bordered select-sm" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: +e.target.value })}>
                <option value={0}>-- Customer --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {!form.customer_id && <input className="input input-bordered input-sm" placeholder="Customer name (if new)" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />}
              <textarea className="textarea textarea-bordered" placeholder="Description / requirements" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              <input type="number" step="0.01" className="input input-bordered input-sm" placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} />
              <select className="select select-bordered select-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="modal-action">
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
