-- 動態分類表
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE(user_id, name)
);

-- 記帳草稿表 (處理 Inline Keyboard 的無狀態問題)
CREATE TABLE IF NOT EXISTS pending_expenses (
    draft_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    item TEXT NOT NULL,
    amount REAL NOT NULL,
    suggested_category TEXT NOT NULL,       -- AI 建議的新分類名稱
    raw_message TEXT,
    media_reference TEXT,                   -- 若為多媒體記帳，紀錄平台專用資源位置
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 記帳主表
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
