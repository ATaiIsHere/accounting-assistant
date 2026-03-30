CREATE UNIQUE INDEX IF NOT EXISTS idx_account_identities_active_direct_provider
    ON account_identities(account_id, provider)
    WHERE is_active = 1 AND chat_scope = 'direct';

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
