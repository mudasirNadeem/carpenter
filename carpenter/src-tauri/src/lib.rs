use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_core_tables",
            sql: "
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    full_name TEXT,
                    role TEXT NOT NULL CHECK(role IN ('admin','manager','employee')),
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    cost_price REAL NOT NULL DEFAULT 0,
                    sale_price REAL NOT NULL DEFAULT 0,
                    quantity REAL NOT NULL DEFAULT 0,
                    size TEXT,
                    material TEXT,
                    low_stock_threshold REAL NOT NULL DEFAULT 5,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS stock_movements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    change REAL NOT NULL,
                    reason TEXT NOT NULL,
                    note TEXT,
                    user_id INTEGER REFERENCES users(id),
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS sales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER REFERENCES customers(id),
                    customer_name TEXT,
                    user_id INTEGER REFERENCES users(id),
                    total REAL NOT NULL DEFAULT 0,
                    profit REAL NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS sale_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    quantity REAL NOT NULL,
                    unit_cost REAL NOT NULL,
                    unit_price REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS expenses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    amount REAL NOT NULL,
                    note TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER REFERENCES customers(id),
                    customer_name TEXT,
                    description TEXT NOT NULL,
                    price REAL NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_name', 'Carpenter Shop');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'PKR');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('tax_percent', '0');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('backup_enabled', '0');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('backup_folder', '');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('backup_retention', '7');
                INSERT OR IGNORE INTO settings (key, value) VALUES ('last_backup_at', '');
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_payments_and_sale_balance",
            sql: "
                ALTER TABLE sales ADD COLUMN paid REAL NOT NULL DEFAULT 0;
                ALTER TABLE sales ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'paid';
                UPDATE sales SET paid = total, payment_status = 'paid' WHERE paid = 0 AND total > 0;

                CREATE TABLE IF NOT EXISTS payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
                    amount REAL NOT NULL,
                    note TEXT,
                    user_id INTEGER REFERENCES users(id),
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_suppliers_and_purchases",
            sql: "
                CREATE TABLE IF NOT EXISTS suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT,
                    contact_person TEXT,
                    address TEXT,
                    note TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS purchases (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_id INTEGER REFERENCES suppliers(id),
                    invoice_number TEXT,
                    user_id INTEGER REFERENCES users(id),
                    total REAL NOT NULL DEFAULT 0,
                    paid REAL NOT NULL DEFAULT 0,
                    payment_status TEXT NOT NULL DEFAULT 'paid',
                    bonus_per_unit REAL NOT NULL DEFAULT 0,
                    bonus_total REAL NOT NULL DEFAULT 0,
                    note TEXT,
                    purchase_date TEXT NOT NULL DEFAULT (date('now','localtime')),
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS purchase_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
                    product_id INTEGER NOT NULL REFERENCES products(id),
                    quantity REAL NOT NULL,
                    unit_cost REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS supplier_payments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
                    amount REAL NOT NULL,
                    note TEXT,
                    user_id INTEGER REFERENCES users(id),
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
            ",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:carpenter.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
