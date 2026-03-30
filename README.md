# Accounting Assistant

基於 Cloudflare Workers、Hono、D1、Telegram、LINE 與 Gemini 的輕量 AI 記帳助手。  
目前版本已支援：

- 多服務：Telegram 與 LINE
- 多帳本隔離：不同使用者的帳務彼此分開
- 同帳本跨服務共用：同一個人可把 Telegram 與 LINE 綁到同一本帳
- 自助 onboarding：bootstrap invite 建帳本、pairing code 綁定其他通訊軟體
- 文字、圖片記帳與自然語言查詢

## 核心功能

- 直接輸入 `午餐 150`、`搭車 50` 進行記帳
- 傳送收據或發票圖片交給 Gemini 解析
- 用自然語言查詢，例如 `今天花多少？`、`這個月吃飯花多少？`
- 用 `/summary` 查看本月總花費
- 用 `/categories` 查看分類
- 用 `/export` 匯出 CSV
- 用 reply 編輯既有帳目
- 用 bootstrap / pairing 流程把帳本擴充到其他通訊軟體

## 系統架構

- Runtime: Cloudflare Workers
- Framework: Hono.js
- Database: Cloudflare D1
- AI parsing: Google Gemini API
- Provider adapters:
  - Telegram
  - LINE
- Shared core:
  - provider-neutral accounting service
  - account / identity resolution
  - bootstrap invite / pairing code flow

## 帳號模型

- 每個內部帳本對應一個 `account`
- 每個 `account` 可綁多個 `account_identities`
- 同一個人可同時綁：
  - Telegram
  - LINE
- 不同人的帳本完全隔離

第一版限制：

- 只支援 Telegram private chat
- 只支援 LINE 一對一聊天
- 不支援 Telegram 群組
- 不支援 LINE group / room

## 需求準備

- [Cloudflare 帳號](https://dash.cloudflare.com/)
- Telegram Bot Token
- Google Gemini API Key
- 若要啟用 LINE：
  - LINE Channel Access Token
  - LINE Channel Secret
- Telegram 數字 user id
  - 可向 [@userinfobot](https://t.me/userinfobot) 查詢

## 安裝與初始化

```bash
git clone <your-repo-url>
cd accounting-assistant
npm install
npm run setup
```

`npm run setup` 會：

1. 建立或更新 D1 設定
2. 套用 migration
3. 寫入必要 secrets
4. 同步本機 `.dev.vars`
5. 若有提供 LINE secrets，也一併設定 LINE

目前 setup 仍會要求輸入 `ALLOWED_USER_ID`。  
這個值主要用於舊的 Telegram single-user fallback；新使用者 onboarding 主流程已經是 bootstrap invite 與 pairing。

## 常用指令

```bash
npm run setup
npm run dev
npm run deploy
npm run deploy:staging

npm run migrate:local
npm run migrate:remote
npm run migrate:staging

npm run provision:account -- --dry-run ...
npm run bootstrap:invite -- --dry-run ...

npm run test
npm run test:unit
```

## 管理者流程

### 1. 升級既有資料庫到 multi-account / multi-service

```bash
npm run migrate:remote
```

### 2. 手動 provision 已知使用者

```bash
npm run provision:account -- --remote --env production \
  --account-slug amy \
  --display-name "Amy" \
  --telegram-user-id 123456789 \
  --line-user-id Uxxxxxxxx
```

注意：

- `--telegram-user-id` 要填 Telegram 的數字 user id，不是 `@username`
- `--line-user-id` 要填 LINE Messaging API 的 `userId`

### 3. 建立 bootstrap invite

```bash
npm run bootstrap:invite -- --remote --env production \
  --account-slug amy \
  --display-name "Amy"
```

腳本會輸出一組 invite code，提供給要建立新帳本的使用者。

## 使用者 onboarding 流程

### A. 建立新帳本

使用者可從任一已支援的通訊軟體開始：

- Telegram：`/create <邀請碼>`
- LINE：`建立帳本 <邀請碼>`

成功後，該通訊軟體就會成為這個帳本的第一個已綁定 identity。

### B. 綁定另一個通訊軟體

已綁定的通訊軟體可發 pairing code：

- Telegram：`/pair <telegram|line>`
- LINE：`配對 <telegram|line>`

接著到目標通訊軟體輸入：

- `綁定 <配對碼>`

例如：

1. 在 Telegram 輸入 `/pair line`
2. 拿到配對碼
3. 到 LINE 輸入 `綁定 <配對碼>`

完成後，Telegram 與 LINE 會共用同一本帳。

## 使用方式

### Telegram

- `/start`
- `/help`
- `/summary`
- `/categories`
- `/export`
- `/create <邀請碼>`
- `/pair <telegram|line>`
- `綁定 <配對碼>`

### LINE

- `/start`
- `/help`
- `/summary`
- `/categories`
- `/export`
- `建立帳本 <邀請碼>`
- `配對 <telegram|line>`
- `綁定 <配對碼>`

### 自然語言

- 記帳：`午餐 150`
- 查詢：`今天花多少？`
- 分類查詢：`這個月吃飯花多少？`
- 刪除分類：`幫我刪掉早餐分類`

### 編輯既有帳目

Telegram 可直接 reply 成功記帳訊息，再輸入：

- `金額改成 200`
- `其實是昨天的晚餐`
- `刪掉這筆`

LINE 沒有 Telegram 那種 reply-edit 與 callback alert 的完整等價介面，所以會走較接近的文字 / quick reply fallback。

## 部署

### Production

```bash
npm run deploy
```

這會：

1. 建置並部署 Worker
2. 設定 Telegram webhook
3. 若本機有 LINE credentials，設定 LINE webhook endpoint
4. 對 LINE 送測試 webhook

若是 LINE，仍需到 LINE Developers Console 確認 `Use webhook` 已啟用。

### Staging

```bash
npm run migrate:staging
npm run deploy:staging
```

如果 staging secrets 尚未設定，請先用 Wrangler 設定對應的：

- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `ALLOWED_USER_ID`

## 本機開發

```bash
npm run dev
```

若要測 webhook，可搭配 `cloudflared` 或 `ngrok` 把本機埠暴露出去。

例如：

```bash
npx cloudflared tunnel --url http://127.0.0.1:8787
```

## 測試

完整測試：

```bash
npm run test
```

較穩定的單元測試：

```bash
npm run test:unit
```

## 已知限制

- LINE `/export` 目前會回文字 fallback，請改用 Telegram `/export`
- LINE 的 postback / callback UX 會退化成可見文字，不像 Telegram 有 callback alert 與 message edit
- provider identity 若已綁定到另一個帳本，目前不支援自動 merge 或自動移轉
