import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { can, type Customer, type Sale } from "../types";
import { useSettings } from "../settings";
import { useConfirm } from "../ConfirmDialog";

export default function Customers() {
  const { user } = useAuth();
  const { format } = useSettings();
  const confirm = useConfirm();
  const canEdit = can(user?.role, "customers.edit");
  const [items, setItems] = useState<Customer[]>([]);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Sale[]>([]);

  async function load() {
    const db = await getDb();
    setItems(await db.select<Customer[]>("SELECT * FROM customers ORDER BY name"));
  }
  useEffect(() => { load(); }, []);

  async function showHistory(c: Customer) {
    setSelected(c);
    const db = await getDb();
    setHistory(await db.select<Sale[]>("SELECT * FROM sales WHERE customer_id = ? ORDER BY id DESC", [c.id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const db = await getDb();
    if (editing) await db.execute("UPDATE customers SET name=?, phone=? WHERE id=?", [form.name, form.phone, editing.id]);
    else await db.execute("INSERT INTO customers (name, phone) VALUES (?, ?)", [form.name, form.phone]);
    setOpen(false); setEditing(null); setForm({ name: "", phone: "" });
    load();
  }

  async function remove(c: Customer) {
    const ok = await confirm({
      title: "Delete customer",
      message: `Delete ${c.name}? Their sales history will remain, but the customer record will be removed.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const db = await getDb();
    await db.execute("DELETE FROM customers WHERE id = ?", [c.id]);
    if (selected?.id === c.id) { setSelected(null); setHistory([]); }
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Customers</h1>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setForm({ name: "", phone: "" }); setOpen(true); }}>+ New Customer</button>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-base-100 rounded-lg shadow p-4">
          <table className="table table-sm">
            <thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className={selected?.id === c.id ? "bg-base-200" : ""}>
                  <td className="cursor-pointer" onClick={() => showHistory(c)}>{c.name}</td>
                  <td>{c.phone}</td>
                  <td className="text-right">
                    {canEdit && <>
                      <button className="btn btn-xs mr-1" onClick={() => { setEditing(c); setForm({ name: c.name, phone: c.phone ?? "" }); setOpen(true); }}>Edit</button>
                      <button className="btn btn-xs btn-error" onClick={() => remove(c)}>Del</button>
                    </>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={3} className="text-center opacity-60">No customers.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">{selected ? `Purchase history: ${selected.name}` : "Select a customer"}</h2>
          {selected && (
            <table className="table table-sm">
              <thead><tr><th>Date</th><th>Sale #</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {history.map((s) => <tr key={s.id}><td className="text-xs">{s.created_at}</td><td>#{s.id}</td><td className="text-right">{format(s.total)}</td></tr>)}
                {history.length === 0 && <tr><td colSpan={3} className="text-center opacity-60">No purchases.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">{editing ? "Edit" : "New"} Customer</h3>
            <form onSubmit={submit} className="flex flex-col gap-2">
              <input className="input input-bordered" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="input input-bordered" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
