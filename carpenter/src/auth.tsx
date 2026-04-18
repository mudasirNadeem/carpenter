import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import bcrypt from "bcryptjs";
import { getDb } from "./db";
import type { User, Role } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => void;
  createUser: (u: { username: string; password: string; full_name: string; role: Role }) => Promise<string | null>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<string | null>;
  resetUserPassword: (userId: number, newPassword: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const SESSION_KEY = "carpenter.session";

async function ensureDefaultAdmin() {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM users");
  if (rows[0]?.c === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    await db.execute(
      "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
      ["admin", hash, "Administrator", "admin"],
    );
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await ensureDefaultAdmin();
        const cached = localStorage.getItem(SESSION_KEY);
        if (cached) setUser(JSON.parse(cached));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(username: string, password: string): Promise<string | null> {
    const db = await getDb();
    const rows = await db.select<(User & { password_hash: string })[]>(
      "SELECT * FROM users WHERE username = ? AND active = 1",
      [username],
    );
    if (rows.length === 0) return "Invalid username or password";
    const row = rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return "Invalid username or password";
    const { password_hash, ...safe } = row;
    setUser(safe as User);
    localStorage.setItem(SESSION_KEY, JSON.stringify(safe));
    return null;
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }

  async function createUser(u: { username: string; password: string; full_name: string; role: Role }) {
    const db = await getDb();
    const existing = await db.select<{ c: number }[]>(
      "SELECT COUNT(*) as c FROM users WHERE username = ?",
      [u.username],
    );
    if ((existing[0]?.c ?? 0) > 0) return "Username already exists";
    const hash = await bcrypt.hash(u.password, 10);
    await db.execute(
      "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
      [u.username, hash, u.full_name, u.role],
    );
    return null;
  }

  async function changePassword(oldPassword: string, newPassword: string): Promise<string | null> {
    if (!user) return "Not signed in";
    if (newPassword.length < 4) return "New password must be at least 4 characters";
    const db = await getDb();
    const rows = await db.select<{ password_hash: string }[]>(
      "SELECT password_hash FROM users WHERE id = ?",
      [user.id],
    );
    if (rows.length === 0) return "User not found";
    const ok = await bcrypt.compare(oldPassword, rows[0].password_hash);
    if (!ok) return "Current password is incorrect";
    const hash = await bcrypt.hash(newPassword, 10);
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);
    return null;
  }

  async function resetUserPassword(userId: number, newPassword: string): Promise<string | null> {
    if (user?.role !== "admin") return "Admins only";
    if (newPassword.length < 4) return "Password must be at least 4 characters";
    const db = await getDb();
    const hash = await bcrypt.hash(newPassword, 10);
    await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, createUser, changePassword, resetUserPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
