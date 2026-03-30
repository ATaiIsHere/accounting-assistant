-- Phase 3 cleanup migration for multi-account multi-service support.
-- Preconditions:
--   1. The application no longer reads or writes legacy user_id ownership fields
--   2. All bookkeeping rows have a non-NULL account_id
--   3. The additive migration has already been applied and verified
--
-- This migration rebuilds legacy tables so account_id becomes the only ownership key.

BEGIN TRANSACTION;

PRAGMA foreign_keys = OFF;

CREATE TABLE categories_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(account_id, name)
);

INSERT INTO categories_new (id, account_id, name)
SELECT id, account_id, name
FROM categories
WHERE account_id IS NOT NULL;

DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

CREATE TABLE pending_expenses_new (
    draft_id TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    suggested_category TEXT NOT NULL,
    raw_message TEXT,
    media_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO pending_expenses_new (
    draft_id,
    account_id,
    date,
    item,
    amount,
    suggested_category,
    raw_message,
    media_reference,
    created_at
)
SELECT
    draft_id,
    account_id,
    date,
    item,
    amount,
    suggested_category,
    raw_message,
    media_reference,
    created_at
FROM pending_expenses
WHERE account_id IS NOT NULL;

DROP TABLE pending_expenses;
ALTER TABLE pending_expenses_new RENAME TO pending_expenses;

CREATE TABLE expenses_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    raw_message TEXT,
    media_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO expenses_new (
    id,
    account_id,
    date,
    item,
    amount,
    category_id,
    raw_message,
    media_reference,
    created_at
)
SELECT
    id,
    account_id,
    date,
    item,
    amount,
    category_id,
    raw_message,
    media_reference,
    created_at
FROM expenses
WHERE account_id IS NOT NULL;

DROP TABLE expenses;
ALTER TABLE expenses_new RENAME TO expenses;

CREATE INDEX IF NOT EXISTS idx_account_identities_account_id
    ON account_identities(account_id);

CREATE INDEX IF NOT EXISTS idx_account_identities_provider_external_user_id
    ON account_identities(provider, external_user_id);

CREATE INDEX IF NOT EXISTS idx_categories_account_id
    ON categories(account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_account_name
    ON categories(account_id, name);

CREATE INDEX IF NOT EXISTS idx_expenses_account_date
    ON expenses(account_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_account_category_date
    ON expenses(account_id, category_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_pending_expenses_account_created_at
    ON pending_expenses(account_id, created_at DESC);

PRAGMA foreign_keys = ON;

COMMIT;
