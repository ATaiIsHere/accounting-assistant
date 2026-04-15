## 1. 資料庫變更 (Database Schema)

- [x] 1.1 建立對應的 schema 變更（或直接修改 `schema.sql`），在 `expenses`、`categories`、`pending_expenses` 表格中**新增** `ledger_id` 欄位，同時保留 `user_id` 欄位
- [x] 1.2 更新 `core/db.ts` 中的 SQL 查詢邏輯，所有資料獲取（SELECT / UPDATE / DELETE）以 `ledger_id` 作為帳本隔離的依據
- [x] 1.3 確保資料新增（INSERT）的操作時，能同步寫入 `ledger_id`（歸屬帳本）與 `user_id`（紀錄創建者）

## 2. 授權與環境變數重構 (Auth & Config)

- [x] 2.1 修改 `src/index.ts` 頂部的環境變數宣告以及驗證邏輯，允許 `ALLOWED_USER_ID` 為逗號分隔字串
- [x] 2.2 更新 Telegram Webhook 的 `bot.use` 中介軟體，從陣列清單內檢核請求是否來源於合法的 `ctx.from.id` 或 `ctx.chat.id`
- [x] 2.3 確認 Dashboard API (`/api/*`) 也使用新的多 ID 驗證邏輯

## 3. 群組記帳邏輯實作 (Group Accounting Logic)

- [x] 3.1 於 `src/index.ts` 內建立統一解析 `ledger_id` 的共用變更，若是群組則取 `ctx.chat.id`，若是個人私聊取 `ctx.from.id`
- [x] 3.2 確保新增記帳 (`insertExpense`) 與未分類草稿 (`savePendingExpense`) 都使用 `ledger_id`
- [x] 3.3 測試與修正 `/summary`, `/categories`, `/export` 和 Dashboard 等查詢方法是否能正常根據 `ledger_id` 拉取對應數據
