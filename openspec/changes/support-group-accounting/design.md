## Context

目前系統設計為單用戶私訊記帳模式，資料表 (`expenses`、`categories`、`pending_expenses`) 與請求驗證皆強烈綁定單一的 `user_id` 且以此作為帳本區分。環境變數 `ALLOWED_USER_ID` 也只接受一個使用者的 ID。
隨著使用場景擴充，需要讓 Bot 能在 Line/Telegram 群組內運作，同一個群組內的所有使用者其記帳應當歸入同一個群組帳本。為此，我們需要在保留 `user_id` 欄位用作追蹤發言者的同時，新增並改配通用的 `ledger_id` 來擔任「劃分帳本資料」的核心，並使存取控制支援多組授權 ID。

## Goals / Non-Goals

**Goals:**
- 在底層資料結構新增 `ledger_id` 欄位以統一管理個人與群組的帳本空間，並保留 `user_id` 作為紀錄建立者/編輯者的追蹤功能。
- 重構 Bot 的中介軟體 (Middleware) 驗證邏輯，支援檢核多個 `ALLOWED_USER_ID` (允許傳入陣列或是逗號分隔字串)。
- 確保 Bot 在群組環境下，能正確擷取群組 ID (`ctx.chat.id`) 作為帳單歸屬；若為私聊則維持使用個人 ID (`ctx.from.id`)。
- 維持現有的 Dashboard API 查詢邏輯，但底層查詢條件改為 `ledger_id`。

**Non-Goals:**
- 不實作多使用者各自權限區分的複雜 RBAC (Role-Based Access Control) 系統。
- 不實作跨不同群組共用帳本的功能 (一個群組固定一個專屬帳本)。

## Decisions

1. **認證邏輯調整 (Middleware Auth)**: 
   - *如何實作*: 將 `c.env.ALLOWED_USER_ID` 從字串比較改為陣列包含檢測。預設環境變數以逗號分隔字串儲存（例如 `"12345,-67890"`）。
   - *替代方案*: 引入 DB 儲存白名單。*不採用原因*: 增加系統複雜性與 D1 查詢次數，目前環境變數已足夠應付小規模場景。

2. **區分帳本的核心邏輯 (`ledger_id` 定義)**:
   - *如何實作*: 在 Telegram Bot 收到訊息時，判斷 `ctx.chat.type`。若為 `group` 或 `supergroup`，則取 `ctx.chat.id.toString()` 作為 `ledger_id`；若為 `private`，則取 `ctx.from.id.toString()` 作為 `ledger_id`。
   - *替代方案*: 新增獨立的 `group_id` 與 `user_id` 雙重欄位。*不採用原因*: 會讓未來的 SQL 查詢變得無謂複雜 (`WHERE user_id = ? OR group_id = ?`)，採用單一 `ledger_id` 查詢最簡潔。

3. **資料表結構變更 (Data Model)**:
   - *如何實作*: 修改 `schema.sql`，在 `expenses`, `categories`, `pending_expenses` 的資料表中新增 `ledger_id` 欄位，同時保留 `user_id` 作為「新增該筆紀錄的發言者唯一標示」。將準備資料遷移腳本把原有的 `user_id` 直接帶入至 `ledger_id` 中完成歷史資料相容。
   - *替代方案*: 將 `user_id` 欄位直接改為 `ledger_id` 取代，丟掉發言者資訊。*不採用原因*: 歷史紀錄將無法追蹤是群組內的哪個人記了這筆帳（缺少 Audit trail）。

## Risks / Trade-offs

- **[Risk] SQLite (D1) 欄位重命名的遷移風險** → *Mitigation*: 將準備一份安全的 SQL 腳本來執行 `INSERT INTO ... SELECT` 操作進行完整遷移，並建議佈署前進行備份。
- **[Risk] Dashboard 使用者登入權限問題** → *Mitigation*: 由於 Dashboard 現階段也依賴設定 `ALLOWED_USER_ID` 來過濾查詢資料，我們需要讓 Dashboard 支援在多個允許的帳本中切換，或是預設在 Dashboard 請求時，傳入目標的 `ledger_id`，確保資料安全隔離。
