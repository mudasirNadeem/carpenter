import { useEffect, useMemo, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import { can, type Bonus } from "../types";
import { useSettings } from "../settings";
import { useConfirm } from "../ConfirmDialog";

const EMPTY = { source: "", amount: 0, note: "", received_date: new Date().toISOString().slice(0, 10) };

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}

export default function BonusPage() {
  const { user } = useAuth();
  const { format } = useSettings();
  const confirm = useConfirm();
  const canEdit = can(user?.role, "bonuses.edit");
  const [items, setItems] = useState<Bonus[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Bonus | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7));

  async function load() {
    const db = await getDb();
    setItems(await db.select<Bonus[]>("SELECT * FROM bonuses ORDER BY received_date DESC, id DESC LIMIT 500"));
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, received_date: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  function openEdit(b: Bonus) {
    setEditing(b);
    setForm({ source: b.source, amount: b.amount, note: b.note ?? "", received_date: b.received_date });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.source.trim()) return alert("Please enter a source (who paid the bonus).");
    if (!+form.amount || +form.amount <= 0) return alert("Amount must be greater than 0.");
    const db = await getDb();
    try {
      if (editing) {
        await db.execute(
          "UPDATE bonuses SET source=?, amount=?, note=?, received_date=? WHERE id=?",
          [form.source.trim(), +form.amount, form.note || null, form.received_date, editing.id],
        );
      } else {
        await db.execute(
          "INSERT INTO bonuses (source, amount, note, received_date, user_id) VALUES (?, ?, ?, ?, ?)",
          [form.source.trim(), +form.amount, form.note || null, form.received_date, user?.id ?? null],
        );
      }
      setOpen(false);
      setEditing(null);
      load();
    } catch (err: any) {
      alert(`Save failed: ${err.message ?? err}`);
    }
  }

  async function remove(b: Bonus) {
    const ok = await confirm({
      title: "Delete bonus",
      message: `Delete bonus of ${format(b.amount)} from ${b.source}?\nThis will also reduce your recorded profit.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const db = await getDb();
      await db.execute("DELETE FROM bonuses WHERE id = ?", [b.id]);
      load();
    } catch (err: any) {
      alert(`Delete failed: ${err.message ?? err}`);
    }
  }

  const monthlyStats = useMemo(() => {
    const filtered = items.filter((b) => monthKey(b.received_date) === monthFilter);
    const total = filtered.reduce((s, b) => s + b.amount, 0);
    return { count: filtered.length, total, filtered };
  }, [items, monthFilter]);

  const allTimeTotal = useMemo(() => items.reduce((s, b) => s + b.amount, 0), [items]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    set.add(new Date().toISOString().slice(0, 7));
    for (const b of items) set.add(monthKey(b.received_date));
    return [...set].sort().reverse();
  }, [items]);

  if (!can(user?.role, "bonuses.view")) {
    return <div className="alert alert-warning">You do not have permission.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Bonus</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="month-filter" className="text-sm">Month</label>
          <select id="month-filter" className="select select-bordered select-sm" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ New Bonus</button>}
        </div>
      </div>

      <div className="alert alert-info text-sm mb-4">
        Bonuses received from companies are added directly to your profit.
      </div>

      <div className="stats stats-vertical md:stats-horizontal shadow bg-base-100 w-full mb-4">
        <div className="stat">
          <div className="stat-title">Bonus (Month)</div>
          <div className="stat-value text-success">{format(monthlyStats.total)}</div>
          <div className="stat-desc">{monthlyStats.count} entries</div>
        </div>
        <div className="stat">
          <div className="stat-title">Bonus (All Time)</div>
          <div className="stat-value text-success">{format(allTimeTotal)}</div>
        </div>
      </div>

      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table table-sm">
          <thead><tr><th>Date</th><th>Source</th><th>Note</th><th className="text-right">Amount</th><th></th></tr></thead>
          <tbody>
            {monthlyStats.filtered.map((b) => (
              <tr key={b.id}>
                <td className="text-xs">{b.received_date}</td>
                <td className="font-medium">{b.source}</td>
                <td className="text-xs opacity-70">{b.note}</td>
                <td className="text-right text-success font-semibold">{format(b.amount)}</td>
                <td className="text-right whitespace-nowrap">
                  {canEdit && <>
                    <button className="btn btn-xs mr-1" onClick={() => openEdit(b)}>Edit</button>
                    <button className="btn btn-xs btn-error" onClick={() => remove(b)}>Del</button>
                  </>}
                </td>
              </tr>
            ))}
            {monthlyStats.filtered.length === 0 && <tr><td colSpan={5} className="text-center opacity-60 py-6">No bonuses for {monthFilter}.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">{editing ? "Edit Bonus" : "New Bonus"}</h3>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="form-control">
                <span className="label-text text-xs">Source (company name)</span>
                <input
                  className="input input-bordered input-sm"
                  placeholder="e.g. Acme Sheet Co."
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  required
                  autoFocus
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Amount</span>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  className="input input-bordered input-sm"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Received on</span>
                <input
                  type="date"
                  className="input input-bordered input-sm"
                  value={form.received_date}
                  onChange={(e) => setForm({ ...form, received_date: e.target.value })}
                  required
                />
              </label>
              <label className="form-control">
                <span className="label-text text-xs">Note (optional)</span>
                <input
                  className="input input-bordered input-sm"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </label>
              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</button>
                <button className="btn btn-sm btn-primary">{editing ? "Save Changes" : "Record Bonus"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
