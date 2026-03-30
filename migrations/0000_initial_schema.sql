-- Initial legacy schema.
-- This migration preserves the current single-user Telegram-based ownership model
-- and serves as the base that later additive migrations build upon.

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS pending_expenses (
    draft_id TEXT PRIMARY KEY,
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
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    raw_message TEXT,
    media_reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
