-- Phase 1 additive migration for multi-account multi-service support.
-- Safe intent:
--   1. Create account ownership tables
--   2. Add nullable account_id columns to existing bookkeeping tables
--   3. Backfill account_id using legacy user_id values
--   4. Keep legacy user_id columns in place until app cutover is complete

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    external_user_id TEXT NOT NULL,
    chat_scope TEXT NOT NULL DEFAULT 'direct',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, external_user_id)
);

ALTER TABLE categories ADD COLUMN account_id INTEGER REFERENCES accounts(id);
ALTER TABLE expenses ADD COLUMN account_id INTEGER REFERENCES accounts(id);
ALTER TABLE pending_expenses ADD COLUMN account_id INTEGER REFERENCES accounts(id);

CREATE INDEX IF NOT EXISTS idx_account_identities_account_id
    ON account_identities(account_id);

CREATE INDEX IF NOT EXISTS idx_account_identities_provider_external_user_id
    ON account_identities(provider, external_user_id);

CREATE INDEX IF NOT EXISTS idx_categories_account_id
    ON categories(account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_account_name
    ON categories(account_id, name)
    WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_account_date
    ON expenses(account_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_account_category_date
    ON expenses(account_id, category_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_pending_expenses_account_created_at
    ON pending_expenses(account_id, created_at DESC);

WITH legacy_user_ids AS (
    SELECT user_id AS legacy_user_id FROM categories WHERE user_id IS NOT NULL
    UNION
    SELECT user_id AS legacy_user_id FROM expenses WHERE user_id IS NOT NULL
    UNION
    SELECT user_id AS legacy_user_id FROM pending_expenses WHERE user_id IS NOT NULL
)
INSERT OR IGNORE INTO accounts (slug, display_name, status)
SELECT
    'legacy-' || legacy_user_id,
    'Legacy Account ' || legacy_user_id,
    'active'
FROM legacy_user_ids;

WITH legacy_user_ids AS (
    SELECT user_id AS legacy_user_id FROM categories WHERE user_id IS NOT NULL
    UNION
    SELECT user_id AS legacy_user_id FROM expenses WHERE user_id IS NOT NULL
    UNION
    SELECT user_id AS legacy_user_id FROM pending_expenses WHERE user_id IS NOT NULL
)
INSERT OR IGNORE INTO account_identities (
    account_id,
    provider,
    external_user_id,
    chat_scope,
    is_active
)
SELECT
    a.id,
    'telegram',
    legacy_user_ids.legacy_user_id,
    'direct',
    1
FROM legacy_user_ids
JOIN accounts a
    ON a.slug = 'legacy-' || legacy_user_ids.legacy_user_id;

UPDATE categories
SET account_id = (
    SELECT a.id
    FROM accounts a
    WHERE a.slug = 'legacy-' || categories.user_id
)
WHERE account_id IS NULL
  AND user_id IS NOT NULL;

UPDATE expenses
SET account_id = (
    SELECT a.id
    FROM accounts a
    WHERE a.slug = 'legacy-' || expenses.user_id
)
WHERE account_id IS NULL
  AND user_id IS NOT NULL;

UPDATE pending_expenses
SET account_id = (
    SELECT a.id
    FROM accounts a
    WHERE a.slug = 'legacy-' || pending_expenses.user_id
)
WHERE account_id IS NULL
  AND user_id IS NOT NULL;

COMMIT;
