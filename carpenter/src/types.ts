export type Role = "admin" | "manager" | "employee";

export interface User {
  id: number;
  username: string;
  full_name: string | null;
  role: Role;
  active: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  type: string;
  cost_price: number;
  sale_price: number;
  quantity: number;
  size: string | null;
  material: string | null;
  low_stock_threshold: number;
  created_at: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name?: string;
  change: number;
  reason: string;
  note: string | null;
  user_id: number | null;
  username?: string | null;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  created_at: string;
}

export type PaymentStatus = "paid" | "partial" | "unpaid";

export interface Sale {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  user_id: number | null;
  total: number;
  profit: number;
  paid: number;
  payment_status: PaymentStatus;
  created_at: string;
}

export interface Payment {
  id: number;
  sale_id: number;
  amount: number;
  note: string | null;
  user_id: number | null;
  created_at: string;
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
}

export interface Expense {
  id: number;
  category: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  contact_person: string | null;
  address: string | null;
  note: string | null;
  created_at: string;
}

export interface Purchase {
  id: number;
  supplier_id: number | null;
  invoice_number: string | null;
  user_id: number | null;
  total: number;
  paid: number;
  payment_status: PaymentStatus;
  bonus_per_unit: number;
  bonus_total: number;
  note: string | null;
  purchase_date: string;
  created_at: string;
}

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_cost: number;
}

export interface SupplierPayment {
  id: number;
  purchase_id: number;
  amount: number;
  note: string | null;
  user_id: number | null;
  created_at: string;
}

export type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled";
export interface Order {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  description: string;
  price: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export const PERMISSIONS: Record<Role, string[]> = {
  admin: [
    "products.view", "products.edit",
    "inventory.view", "inventory.edit",
    "sales.view", "sales.create",
    "expenses.view", "expenses.edit",
    "reports.view",
    "customers.view", "customers.edit",
    "orders.view", "orders.edit",
    "credit.view", "credit.collect",
    "suppliers.view", "suppliers.edit",
    "purchases.view", "purchases.create",
    "users.manage",
    "settings.manage",
  ],
  manager: [
    "products.view",
    "inventory.view",
    "sales.view", "sales.create",
    "expenses.view",
    "reports.view",
    "customers.view", "customers.edit",
    "orders.view", "orders.edit",
    "credit.view", "credit.collect",
    "suppliers.view",
    "purchases.view", "purchases.create",
  ],
  employee: [
    "products.view",
    "inventory.view",
    "sales.view", "sales.create",
    "customers.view",
    "orders.view",
  ],
};

export function can(role: Role | undefined, permission: string): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(permission) ?? false;
}
