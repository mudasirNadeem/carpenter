import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { useSettings } from "../settings";
import { can, type Purchase, type Supplier } from "../types";

export default function Suppliers() {
  const { user } = useAuth();
  const { format } = useSettings();
  const canEdit = can(user?.role, "suppliers.edit");
  const [items, setItems] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<Record<number, { balance: number; purchases: number }>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", contact_person: "", address: "", note: "" });
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [history, setHistory] = useState<Purchase[]>([]);

  async function load() {
    const db = await getDb();
    setItems(await db.select<Supplier[]>("SELECT * FROM suppliers ORDER BY name"));
    const rows = await db.select<{ supplier_id: number; balance: number; cnt: number }[]>(
      "SELECT supplier_id, COALESCE(SUM(total - paid), 0) as balance, COUNT(*) as cnt FROM purchases WHERE supplier_id IS NOT NULL GROUP BY supplier_id",
    );
    const map: Record<number, { balance: number; purchases: number }> = {};
    for (const r of rows) map[r.supplier_id] = { balance: r.balance, purchases: r.cnt };
    setBalances(map);
  }
  useEffect(() => { load(); }, []);

  async function showHistory(s: Supplier) {
    setSelected(s);
    const db = await getDb();
    setHistory(await db.select<Purchase[]>("SELECT * FROM purchases WHERE supplier_id = ? ORDER BY id DESC", [s.id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const db = await getDb();
    if (editing) {
      await db.execute(
        "UPDATE suppliers SET name=?, phone=?, contact_person=?, address=?, note=? WHERE id=?",
        [form.name, form.phone, form.contact_person, form.address, form.note, editing.id],
      );
    } else {
      await db.execute(
        "INSERT INTO suppliers (name, phone, contact_person, address, note) VALUES (?, ?, ?, ?, ?)",
        [form.name, form.phone, form.contact_person, form.address, form.note],
      );
    }
    setOpen(false); setEditing(null);
    setForm({ name: "", phone: "", contact_person: "", address: "", note: "" });
    load();
  }

  async function remove(s: Supplier) {
    const bal = balances[s.id];
    if (bal?.purchases > 0) { alert(`Cannot delete — supplier has ${bal.purchases} purchase(s).`); return; }
    if (!confirm(`Delete ${s.name}?`)) return;
    const db = await getDb();
    await db.execute("DELETE FROM suppliers WHERE id = ?", [s.id]);
    if (selected?.id === s.id) { setSelected(null); setHistory([]); }
    load();
  }

  const totalAP = Object.values(balances).reduce((sum, b) => sum + b.balance, 0);

  if (!can(user?.role, "suppliers.view")) {
    return <div className="alert alert-warning">You do not have permission.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Suppliers</h1>
        <div className="flex items-center gap-3">
          {totalAP > 0 && (
            <span className="text-sm">You owe suppliers: <span className="font-bold text-error">{format(totalAP)}</span></span>
          )}
          {canEdit && (
            <button type="button" className="btn btn-primary btn-sm"
              onClick={() => { setEditing(null); setForm({ name: "", phone: "", contact_person: "", address: "", note: "" }); setOpen(true); }}>
              + New Supplier
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
          <table className="table table-sm">
            <thead><tr><th>Name</th><th>Contact</th><th>Phone</th><th className="text-right">Balance</th><th></th></tr></thead>
            <tbody>
              {items.map((s) => {
                const bal = balances[s.id];
                return (
                  <tr key={s.id} className={selected?.id === s.id ? "bg-base-200" : "hover cursor-pointer"}>
                    <td className="font-medium" onClick={() => showHistory(s)}>{s.name}</td>
                    <td>{s.contact_person}</td>
                    <td>{s.phone}</td>
                    <td className={`text-right ${bal?.balance ? "text-error font-semibold" : ""}`}>
                      {bal ? format(bal.balance) : "-"}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {canEdit && <>
                        <button type="button" className="btn btn-xs mr-1" onClick={() => { setEditing(s); setForm({ name: s.name, phone: s.phone ?? "", contact_person: s.contact_person ?? "", address: s.address ?? "", note: s.note ?? "" }); setOpen(true); }}>Edit</button>
                        <button type="button" className="btn btn-xs btn-error" onClick={() => remove(s)}>Del</button>
                      </>}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={5} className="text-center opacity-60">No suppliers.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="bg-base-100 rounded-lg shadow p-4">
          <h2 className="font-bold mb-2">{selected ? `Purchase history: ${selected.name}` : "Select a supplier"}</h2>
          {selected && (
            <>
              {selected.address && <div className="text-sm mb-1">📍 {selected.address}</div>}
              {selected.note && <div className="text-xs opacity-70 mb-2">{selected.note}</div>}
              <table className="table table-sm">
                <thead><tr><th>Date</th><th>#</th><th className="text-right">Total</th><th className="text-right">Balance</th><th className="text-right">Bonus</th></tr></thead>
                <tbody>
                  {history.map((p) => (
                    <tr key={p.id}>
                      <td className="text-xs">{p.purchase_date}</td>
                      <td>#{p.id}</td>
                      <td className="text-right">{format(p.total)}</td>
                      <td className="text-right">{format(p.total - p.paid)}</td>
                      <td className="text-right text-success">{format(p.bonus_total)}</td>
                    </tr>
                  ))}
                  {history.length === 0 && <tr><td colSpan={5} className="text-center opacity-60">No purchases.</td></tr>}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">{editing ? "Edit" : "New"} Supplier</h3>
            <form onSubmit={submit} className="flex flex-col gap-2">
              <input className="input input-bordered" placeholder="Company name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <input className="input input-bordered" placeholder="Contact person" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
              <input className="input input-bordered" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className="input input-bordered" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <textarea className="textarea textarea-bordered" placeholder="Notes (bonus scheme, payment terms, etc.)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
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
