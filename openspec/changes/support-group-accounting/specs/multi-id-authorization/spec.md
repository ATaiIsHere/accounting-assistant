## ADDED Requirements

### Requirement: 支援複數 ID 授權驗證
系統中驗證連線來源是否有存取權限的邏輯，SHALL 從原本比對單一 `ALLOWED_USER_ID`，更新為支援多筆 ID 列表的比較（包含 User ID 與 Group ID）。

#### Scenario: 具備授權群組傳入請求
- **WHEN** 有新的 Webhook 請求進來，其 `ctx.chat.id`（對應 Group）包含於 `ALLOWED_USER_ID` 指定的集合中
- **THEN** 系統授權該請求繼續執行，不予阻擋。

#### Scenario: 非授權名單發送請求
- **WHEN** 發送訊息者的 `ctx.from.id` 或是傳送群組的 `ctx.chat.id` 皆未位於 `ALLOWED_USER_ID` 的設定名單中
- **THEN** 系統將靜默丟棄此請求或回傳 401 Unauthorized。
