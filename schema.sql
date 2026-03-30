-- 多帳本主表
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 帳本與外部平台身份映射表
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

CREATE INDEX IF NOT EXISTS idx_account_identities_account_id
    ON account_identities(account_id);

CREATE INDEX IF NOT EXISTS idx_account_identities_provider_external_user_id
    ON account_identities(provider, external_user_id);

-- 動態分類表
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id),
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_categories_account_id
    ON categories(account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_account_name
    ON categories(account_id, name)
    WHERE account_id IS NOT NULL;

-- 記帳草稿表 (處理 Inline Keyboard 的無狀態問題)
CREATE TABLE IF NOT EXISTS pending_expenses (
    draft_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id),
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    suggested_category TEXT NOT NULL,       -- AI 建議的新分類名稱
    raw_message TEXT,
    media_reference TEXT,                   -- 若為多媒體記帳，紀錄平台專用資源位置
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pending_expenses_account_created_at
    ON pending_expenses(account_id, created_at DESC);

-- 記帳主表
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id),
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    raw_message TEXT,
    media_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_account_date
    ON expenses(account_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_expenses_account_category_date
    ON expenses(account_id, category_id, date DESC, id DESC);
