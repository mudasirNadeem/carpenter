import { useEffect, useState } from "react";
import { getDb } from "../db";
import { useAuth } from "../auth";
import type { User, Role } from "../types";
import { can } from "../types";

export default function Users() {
  const { user, createUser, resetUserPassword } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", full_name: "", role: "employee" as Role });
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetErr, setResetErr] = useState<string | null>(null);

  async function load() {
    const db = await getDb();
    const rows = await db.select<User[]>("SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id");
    setUsers(rows);
  }

  useEffect(() => { load(); }, []);

  if (!can(user?.role, "users.manage")) {
    return <div className="alert alert-warning">You do not have permission to manage users.</div>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = await createUser(form);
    if (err) { setError(err); return; }
    setOpen(false);
    setForm({ username: "", password: "", full_name: "", role: "employee" });
    load();
  }

  async function toggleActive(u: User) {
    const db = await getDb();
    await db.execute("UPDATE users SET active = ? WHERE id = ?", [u.active ? 0 : 1, u.id]);
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Users</h1>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ New User</button>
      </div>

      <div className="overflow-x-auto bg-base-100 rounded-lg shadow">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.full_name}</td>
                <td><span className="badge badge-outline">{u.role}</span></td>
                <td>{u.active ? <span className="badge badge-success">Active</span> : <span className="badge badge-ghost">Disabled</span>}</td>
                <td className="whitespace-nowrap">
                  <button type="button" className="btn btn-xs mr-1" onClick={() => { setResetTarget(u); setResetPw(""); setResetErr(null); }}>Reset PW</button>
                  {u.id !== user?.id && (
                    <button type="button" className="btn btn-xs" onClick={() => toggleActive(u)}>
                      {u.active ? "Disable" : "Enable"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetTarget && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-2">Reset password for {resetTarget.username}</h3>
            <p className="text-sm opacity-70 mb-3">User should change this password after first login.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setResetErr(null);
                const err = await resetUserPassword(resetTarget.id, resetPw);
                if (err) { setResetErr(err); return; }
                alert(`Password reset for ${resetTarget.username}.`);
                setResetTarget(null);
              }}
              className="flex flex-col gap-2"
            >
              <input type="password" className="input input-bordered input-sm" placeholder="New password (min 4 chars)"
                value={resetPw} onChange={(e) => setResetPw(e.target.value)} required minLength={4} autoFocus />
              {resetErr && <div className="alert alert-error py-2 text-sm">{resetErr}</div>}
              <div className="modal-action">
                <button type="button" className="btn btn-sm" onClick={() => setResetTarget(null)}>Cancel</button>
                <button className="btn btn-sm btn-primary">Reset</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {open && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">New User</h3>
            <form onSubmit={submit} className="flex flex-col gap-2">
              <input className="input input-bordered" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              <input className="input input-bordered" placeholder="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              <input className="input input-bordered" type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={4} />
              <select title="Role" className="select select-bordered" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="employee">Employee</option>
              </select>
              {error && <div className="alert alert-error py-2 text-sm">{error}</div>}
              <div className="modal-action">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
