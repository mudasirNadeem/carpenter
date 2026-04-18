import { useState } from "react";
import { useAuth } from "./auth";

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ old: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.next !== form.confirm) { setError("New passwords do not match"); return; }
    setBusy(true);
    const err = await changePassword(form.old, form.next);
    setBusy(false);
    if (err) { setError(err); return; }
    alert("Password changed successfully.");
    onClose();
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Change Password</h3>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input type="password" placeholder="Current password" className="input input-bordered input-sm"
            value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} required autoFocus />
          <input type="password" placeholder="New password (min 4 chars)" className="input input-bordered input-sm"
            value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required minLength={4} />
          <input type="password" placeholder="Confirm new password" className="input input-bordered input-sm"
            value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required minLength={4} />
          {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
          <div className="modal-action">
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" disabled={busy}>{busy ? "Saving..." : "Change"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
