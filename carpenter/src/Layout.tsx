import { ReactNode, useState } from "react";
import { useAuth } from "./auth";
import { can } from "./types";
import { useNotifications } from "./notifications";
import ChangePasswordModal from "./ChangePasswordModal";

export type PageKey = "dashboard" | "products" | "inventory" | "sales" | "credit" | "expenses" | "customers" | "orders" | "reports" | "users" | "settings";

const NAV: { key: PageKey; label: string; perm: string; badge?: "lowStock" | "pendingOrders" }[] = [
  { key: "dashboard",  label: "Dashboard",  perm: "products.view" },
  { key: "products",   label: "Products",   perm: "products.view" },
  { key: "inventory",  label: "Inventory",  perm: "inventory.view", badge: "lowStock" },
  { key: "sales",      label: "Sales",      perm: "sales.view" },
  { key: "credit",     label: "Credit",     perm: "credit.view" },
  { key: "expenses",   label: "Expenses",   perm: "expenses.view" },
  { key: "customers",  label: "Customers",  perm: "customers.view" },
  { key: "orders",     label: "Orders",     perm: "orders.view", badge: "pendingOrders" },
  { key: "reports",    label: "Reports",    perm: "reports.view" },
  { key: "users",      label: "Users",      perm: "users.manage" },
  { key: "settings",   label: "Settings",   perm: "settings.manage" },
];

export default function Layout({ page, setPage, children }: { page: PageKey; setPage: (p: PageKey) => void; children: ReactNode }) {
  const { user, logout } = useAuth();
  const { counts } = useNotifications();
  const [open, setOpen] = useState(true);
  const [pwOpen, setPwOpen] = useState(false);
  const visible = NAV.filter((n) => can(user?.role, n.perm));

  return (
    <div className="min-h-screen flex bg-base-200">
      <aside className={`${open ? "w-60" : "w-16"} transition-all bg-base-100 shadow-md flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-base-200">
          {open && <span className="font-bold">Carpenter</span>}
          <button className="btn btn-ghost btn-xs" onClick={() => setOpen(!open)}>{open ? "«" : "»"}</button>
        </div>
        <nav className="flex-1 p-2 flex flex-col gap-1">
          {visible.map((n) => {
            const badgeVal = n.badge ? counts[n.badge] : 0;
            return (
              <button
                key={n.key}
                onClick={() => setPage(n.key)}
                className={`btn btn-sm justify-start ${page === n.key ? "btn-primary" : "btn-ghost"}`}
              >
                <span className="flex-1 text-left">{open ? n.label : n.label[0]}</span>
                {badgeVal > 0 && <span className="badge badge-warning badge-sm">{badgeVal}</span>}
              </button>
            );
          })}
        </nav>
        <div className="p-2 border-t border-base-200">
          {open && <div className="text-xs mb-2 px-2">
            <div className="font-semibold">{user?.full_name ?? user?.username}</div>
            <div className="opacity-60 capitalize">{user?.role}</div>
          </div>}
          {open && (
            <button type="button" className="btn btn-xs btn-ghost w-full mb-1" onClick={() => setPwOpen(true)}>
              Change Password
            </button>
          )}
          <button type="button" className="btn btn-sm btn-outline w-full" onClick={logout}>
            {open ? "Logout" : "⎋"}
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}
