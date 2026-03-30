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

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_identities_active_direct_provider
    ON account_identities(account_id, provider)
    WHERE is_active = 1 AND chat_scope = 'direct';

-- 帳本建立邀請碼表
CREATE TABLE IF NOT EXISTS account_bootstrap_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_slug TEXT NOT NULL,
    display_name TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at DATETIME NOT NULL,
    claimed_account_id INTEGER REFERENCES accounts(id),
    claimed_provider TEXT,
    claimed_external_user_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_account_bootstrap_codes_status_expires_at
    ON account_bootstrap_codes(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_account_bootstrap_codes_slug_status
    ON account_bootstrap_codes(account_slug, status);

-- 跨服務綁定配對碼表
CREATE TABLE IF NOT EXISTS identity_pairing_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_provider TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    used_by_provider TEXT,
    used_by_external_user_id TEXT,
    requested_via_provider TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_identity_pairing_codes_target_status_expires_at
    ON identity_pairing_codes(target_provider, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_identity_pairing_codes_account_target_status
    ON identity_pairing_codes(account_id, target_provider, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_pairing_codes_pending_account_target
    ON identity_pairing_codes(account_id, target_provider)
    WHERE status = 'pending';

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
