## ADDED Requirements

### Requirement: 系統支援處理群組聊天室的記帳行為
當 Bot 被拉入群組後，來自同一群組的成員所觸發的記帳動作，系統 SHALL 讀取群組 ID 並歸入相同的 `ledger_id`，確保成員能共管同一份帳本。

#### Scenario: 成員在群組中記帳
- **WHEN** 群組內任一使用者發送可記帳的訊息給 Bot (例如：「便當 100」)
- **THEN** 系統將從 `ctx.chat.id` 解析出群組 ID，並以該群組 ID 作為 `ledger_id` 建立記帳紀錄。

#### Scenario: 用戶在私聊中記帳
- **WHEN** 使用者在私人的 Telegram 對話中發送記帳訊息
- **THEN** 系統將以用戶個人的 `ctx.from.id` 作為 `ledger_id` 建立記帳紀錄。

### Requirement: 群組與個人帳本獨立查詢
群組內的記帳紀錄 SHALL 與用戶個人的私聊帳本完全獨立。在群組內發出的查詢指令，將彙整該群組內「所有成員」共同記下的帳目；而在個人私聊中發出的查詢，則只會顯示該用戶私底下建立的帳目，不會混入群組的公費紀錄。

#### Scenario: 查詢群組月結算
- **WHEN** 任意成員在群組內向 Bot 發送 /summary
- **THEN** Bot 將針對該群組專屬 `ledger_id` 所彙整的當月記帳總結進行回覆（包含所有成員的貢獻）。

#### Scenario: 查詢個人月結算
- **WHEN** 使用者在私人對話中向 Bot 發送 /summary
- **THEN** Bot 回覆針對該使用者私聊專屬 `ledger_id` 所彙整的當月記帳總結（僅包含自己私戳 Bot 記下的項目）。
