import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { can, type Expense } from "../types";
import { useSettings } from "../settings";
import { useConfirm } from "../ConfirmDialog";

export default function Expenses() {
  const { user } = useAuth();
  const { format } = useSettings();
  const confirm = useConfirm();
  const canEdit = can(user?.role, "expenses.edit");
  const [items, setItems] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "wood", amount: 0, note: "" });

  async function load() {
    const db = await getDb();
    setItems(await db.select<Expense[]>("SELECT * FROM expenses ORDER BY id DESC LIMIT 300"));
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const db = await getDb();
    await db.execute("INSERT INTO expenses (category, amount, note) VALUES (?, ?, ?)", [form.category, +form.amount, form.note]);
    setOpen(false); setForm({ category: "wood", amount: 0, note: "" });
    load();
  }

  async function remove(e: Expense) {
    const ok = await confirm({
      title: "Delete expense",
      message: `Delete this ${e.category} expense of ${format(e.amount)}?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    const db = await getDb();
    await db.execute("DELETE FROM expenses WHERE id = ?", [e.id]);
    load();
  }

  const total = items.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Expenses</h1>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>+ New Expense</button>}
      </div>
      <div className="stats bg-base-100 shadow mb-4">
        <div className="stat"><div className="stat-title">Total (shown)</div><div className="stat-value text-error">{format(total)}</div></div>
      </div>
      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-sm">
          <thead><tr><th>Date</th><th>Category</th><th>Note</th><th className="text-right">Amount</th><th></th></tr></thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td className="text-xs">{e.created_at}</td>
                <td><span className="badge badge-outline">{e.category}</span></td>
                <td>{e.note}</td>
                <td className="text-right">{format(e.amount)}</td>
                <td className="text-right">{canEdit && <button className="btn btn-xs btn-error" onClick={() => remove(e)}>Del</button>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="text-center opacity-60">No expenses.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">New Expense</h3>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <select className="select select-bordered select-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="wood">Wood Purchase</option>
                <option value="salary">Worker Salary</option>
                <option value="electricity">Electricity</option>
                <option value="transport">Transport</option>
                <option value="other">Other</option>
              </select>
              <input type="number" step="0.01" className="input input-bordered input-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} required />
              <input className="input input-bordered input-sm" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
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
