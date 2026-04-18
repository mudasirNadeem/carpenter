import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./auth";
import { runAutoBackupIfDue } from "./backup";
import { SettingsProvider } from "./settings";
import { NotificationsProvider } from "./notifications";
import Login from "./pages/Login";
import Layout, { PageKey } from "./Layout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Credit from "./pages/Credit";
import Purchases from "./pages/Purchases";
import Suppliers from "./pages/Suppliers";
import Expenses from "./pages/Expenses";
import Customers from "./pages/Customers";
import Orders from "./pages/Orders";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import "./App.css";

function Shell() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState<PageKey>("dashboard");

  useEffect(() => {
    if (user) runAutoBackupIfDue().catch((e) => console.error(e));
  }, [user]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-base-200"><span className="loading loading-spinner loading-lg" /></div>;
  }
  if (!user) return <Login />;

  let content;
  switch (page) {
    case "dashboard": content = <Dashboard />; break;
    case "products": content = <Products />; break;
    case "inventory": content = <Inventory />; break;
    case "sales": content = <Sales />; break;
    case "credit": content = <Credit />; break;
    case "purchases": content = <Purchases />; break;
    case "suppliers": content = <Suppliers />; break;
    case "expenses": content = <Expenses />; break;
    case "customers": content = <Customers />; break;
    case "orders": content = <Orders />; break;
    case "reports": content = <Reports />; break;
    case "users": content = <Users />; break;
    case "settings": content = <Settings />; break;
  }

  return <Layout page={page} setPage={setPage}>{content}</Layout>;
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <NotificationsProvider>
          <Shell />
        </NotificationsProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
