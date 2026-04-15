## Why

目前系統只支援個人私訊記帳（基於 `user_id`），無法應用於多人共管開銷的場景。本變更是為解決群組記帳的需求，讓被加入至聊天群組的 Bot 能將該群組內的記帳操作合併至同一個帳本中，同時擴充設定檔機制，以便支援多個授權的使用者或群組 ID。

## What Changes

- **新增欄位區分帳本**：在資料表層級新增 `ledger_id` 欄位以判斷資料歸屬哪個帳本，**同時保留現有 `user_id` 欄位作為追蹤操作者（誰記了這筆帳）的紀錄**。
- **支援群組記帳**：讓 Bot 在群組對話發生時，能讀取群組 ID 並使用該群組 ID 作為該筆開銷的 `ledger_id`，同時紀錄發言使用者的 ID 為 `user_id`。若在私訊，這兩者皆為個人 User ID。
- **支援多重授權**：修改環境變數/設定檔中的 `ALLOWED_USER_ID`，使其改為可接受多筆 ID 的陣列字串（如以逗號分隔包含 User ID 與 Group ID），並重構其授權驗證邏輯。
- **BREAKING**: 系統環境變數與核心結構變更，需執行資料庫遷移（新增 `ledger_id` 欄位，並將舊資料的 `ledger_id` 預設填入原有的 `user_id`）。

## Capabilities

### New Capabilities
- `group-accounting`: 支援群組記帳。Bot 能判斷是在群組或私訊中呼叫，並提取群組 ID 來歸屬於相同的 `ledger_id`。
- `multi-id-authorization`: 重新設計全域與請求級別的授權機制，支援以陣列形式管理並驗證多個允許存取的來源 ID (User / Group)。
- `ledger-schema`: 建立 `ledger_id` 這一新的核心資料定義，用於取代過往的 `user_id` 以建立更通用的帳本查詢條件。

### Modified Capabilities
<!-- No existing capabilities to modify -->

## Impact

- **Database**: 所有原先基於 `user_id` 的 SQL 操作需重構改為 `ledger_id`。
- **Middleware / Handlers**: 需要更新傳入的參數，判斷來自群組還是私訊區分 `ledger_id`，並調整存取控制 (Authentication)。
- **Configuration (.dev.vars / wrangler)**: 需改變使用 `ALLOWED_USER_ID` 變數的處理，可能需要改名為 `ALLOWED_IDS` 或於讀入時拆解為陣列。
