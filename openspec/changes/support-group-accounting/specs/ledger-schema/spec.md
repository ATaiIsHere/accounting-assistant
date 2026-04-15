## ADDED Requirements

### Requirement: 資料表以帳本 ID 作為分類核心
系統底層的資料表架構，包括 `expenses`, `categories`, `pending_expenses` SHALL 新增 `ledger_id` 來區分該筆紀錄歸屬的帳本，並同時保留 `user_id` 作為紀錄新增使用者的追蹤標記。

#### Scenario: 儲存新帳目
- **WHEN** 發起新增（Insert）一筆花費至 `expenses`
- **THEN** 系統將傳入的 `ledger_id`（帳本歸屬）與 `user_id`（操作者）一併保存至該筆紀錄內。`ledger_id` 將作為主要帳本查詢的關聯依據。

#### Scenario: 查詢帳目
- **WHEN** 系統查詢某個帳本的帳目清單或分類總結
- **THEN** API 查詢條件 SHALL 以傳入的 `ledger_id` 作為資料邊界限縮查詢範圍。
