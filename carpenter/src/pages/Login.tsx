import { useState } from "react";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const err = await login(username.trim(), password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title justify-center">Carpenter Shop</h2>
          <p className="text-center text-sm opacity-70">Sign in to continue</p>
          <form onSubmit={submit} className="flex flex-col gap-3 mt-4">
            <input
              className="input input-bordered"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
            <input
              className="input input-bordered"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <div className="alert alert-error text-sm py-2">{error}</div>}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <div className="text-xs opacity-60 text-center mt-2">
            Default: admin / admin123
          </div>
        </div>
      </div>
    </div>
  );
}
