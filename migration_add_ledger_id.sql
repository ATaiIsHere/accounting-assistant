-- 1. Backup old data into temporary tables
CREATE TABLE categories_old AS SELECT * FROM categories;
CREATE TABLE pending_expenses_old AS SELECT * FROM pending_expenses;
CREATE TABLE expenses_old AS SELECT * FROM expenses;

-- 2. Drop the old tables (Order MATTERS for Foreign Keys: expenses -> categories)
DROP TABLE expenses;
DROP TABLE pending_expenses;
DROP TABLE categories;

-- 3. Recreate the new schema with ledger_id constraints
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(ledger_id, name)
);

CREATE TABLE IF NOT EXISTS pending_expenses (
    draft_id TEXT PRIMARY KEY,
    ledger_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    suggested_category TEXT NOT NULL,
    raw_message TEXT,
    media_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ledger_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    raw_message TEXT,
    media_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Restore data from backup tables, mapping ledger_id to user_id
INSERT INTO categories (id, ledger_id, user_id, name)
SELECT id, user_id, user_id, name FROM categories_old;

INSERT INTO pending_expenses (draft_id, ledger_id, user_id, date, item, amount, suggested_category, raw_message, media_reference, created_at)
SELECT draft_id, user_id, user_id, date, item, amount, suggested_category, raw_message, media_reference, created_at FROM pending_expenses_old;

-- Note: we disabled PRAGMA foreign_keys, but since D1 enforces them, we insert categories first, then expenses!
INSERT INTO expenses (id, ledger_id, user_id, date, item, amount, category_id, raw_message, media_reference, created_at)
SELECT id, user_id, user_id, date, item, amount, category_id, raw_message, media_reference, created_at FROM expenses_old;

-- 5. Drop the backup tables
DROP TABLE expenses_old;
DROP TABLE pending_expenses_old;
DROP TABLE categories_old;
