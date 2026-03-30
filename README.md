# Accounting Assistant

`Accounting Assistant` 是一個以 Cloudflare 為核心的個人記帳系統，目前包含三個主要部分：

- `src/`：主後端 Worker，負責 Telegram webhook、Dashboard API 與未來 AI tools 的共用入口
- `dashboard/`：`React + Vite + Cloudflare Pages` 前端，透過 Pages Functions 代理同網域 `/api/*`
- `tests/`：後端 Worker 的 Vitest 測試

目前正式環境的設計重點是：

- 帳務與分類資料仍集中在同一個 `accounting-assistant` Worker
- Dashboard 走 `Pages + Functions proxy`，不直接從瀏覽器跨網域打 Worker
- Dashboard API 需要 `DASHBOARD_PROXY_SECRET`
- Pages 站點需要搭配 Cloudflare Access / Zero Trust 才會對外提供內容

### 1. 準備工作 (Prerequisites)
- [Cloudflare 帳號](https://dash.cloudflare.com/) 
- Telegram Bot Token (向 [@BotFather](https://t.me/BotFather) 申請)
- LINE Channel Access Token 與 Channel Secret（若要啟用 LINE）
- [Google AI Studio API Key](https://aistudio.google.com/app/apikey) (Gemini Token)
- 你的 Telegram User ID (可向 [@userinfobot](https://t.me/userinfobot) 查詢)

```text
accounting-assistant/
|-- src/                  Worker 入口、路由與核心邏輯
|-- src/core/             資料庫與 AI 相關共用邏輯
|-- dashboard/            React 前端與 Pages Functions
|-- tests/                Worker 測試
|-- scripts/              Worker 部署與初始化腳本
|-- schema.sql            D1 schema
`-- wrangler.jsonc        Worker 設定
```

## 技術組成

- 後端：Cloudflare Workers + Hono
- 資料庫：Cloudflare D1
- Bot：GrammY
- AI 解析：Gemini
- Dashboard：React 19 + Vite + Cloudflare Pages + Pages Functions

## 開發需求

- Node.js 20+
- npm
- 已登入的 Wrangler
- Cloudflare D1 database
- Telegram Bot Token
- Gemini API Key

## 快速開始

先安裝根目錄依賴：

```bash
npm install
```

# 執行全自動設定腳本
npm run setup
\`\`\`
執行腳本後，程式會：
1. 自動創建 `accounting-db` 資料庫並覆寫 `wrangler.jsonc`。
2. 自動套用 `wrangler d1 migrations`，建立或升級資料庫結構。
3. 透過互動式介面引導您輸入 `TELEGRAM_BOT_TOKEN`、`GEMINI_API_KEY` 與 `ALLOWED_USER_ID`，並自動安全地加密存入 Cloudflare Secrets 中。
4. 若有提供 `LINE_CHANNEL_ACCESS_TOKEN` 與 `LINE_CHANNEL_SECRET`，也會一併寫入 Cloudflare Secrets 與 `.dev.vars`。

### 3.5 既有資料庫升級與帳號綁定 (Multi-account Bootstrap)

若您已經有既有 D1 資料庫，現在要升級到 multi-account / multi-service schema，可依序執行：

```bash
npm run migrate:remote
npm run provision:account -- --remote --env production --account-slug amy --display-name "Amy" --telegram-user-id 123456789 --line-user-id Uxxxxxxxx
```

若您要讓新使用者從任一通訊軟體自助建立帳本，先由管理者建立 bootstrap invite：

```bash
npm run bootstrap:invite -- --remote --env production --account-slug amy --display-name "Amy"
```

建立後腳本會印出邀請碼。使用者可用：

- Telegram：`/create <邀請碼>`
- LINE：`建立帳本 <邀請碼>`

若使用者之後想把另一個通訊軟體綁到同一本帳本：

- Telegram：`/pair line`
- LINE：`配對 telegram`
- 目標通訊軟體：`綁定 <配對碼>`

可用指令：

- `npm run migrate:local`
- `npm run migrate:remote`
- `npm run migrate:staging`
- `npm run provision:account -- --dry-run ...`
- `npm run bootstrap:invite -- --dry-run ...`

### 4. 終極一鍵部署 (Deploy to Production)
現在我們已經將環境設定、部署、與 Webhook 註冊**完美串接在同一個指令**中！若您是第一次克隆此專案，只要跑這一行就夠了：
\`\`\`bash
npm run deploy
\`\`\`
執行此指令後，系統會自動：
1. **[偵測]** 發現環境未初始化，自動呼叫 `npm run setup` 建立 D1 資料庫與安全憑證。
2. **[建置]** 自動編譯並將程式碼發佈推送到 Cloudflare Workers。
3. **[註冊]** 自動呼叫 Telegram API，將您的專屬 Worker 網址安全註冊為伺服器 Webhook。
4. **[LINE]** 若本機 `.dev.vars` 有 `LINE_CHANNEL_ACCESS_TOKEN`，會自動設定 `/webhook/line` 並送出測試 webhook。

看到 `🎉 Telegram Webhook 註冊成功！` 或 `🎉 LINE webhook endpoint 設定完成` 即代表部署已完成。若是 LINE，仍需到 LINE Developers Console 確認 `Use webhook` 已啟用。

### 1. 啟動後端 Worker

根目錄建立 `.dev.vars`，至少準備下列變數：

- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `ALLOWED_USER_ID`
- `DASHBOARD_PROXY_SECRET`

啟動 Worker：

```bash
npm run dev
```

### 2. 啟動 Dashboard

在 `dashboard/` 目錄建立 `.dev.vars`，可從 `.dev.vars.example` 複製：

```bash
cd dashboard
Copy-Item .dev.vars.example .dev.vars
```

至少設定：

- `API_BASE_URL`
- `DASHBOARD_PROXY_SECRET`

本機建議：

```text
API_BASE_URL=http://127.0.0.1:8787
```

啟動前端開發伺服器：

```bash
npm run dev
```

如果要連同 Pages Functions 一起模擬，請用：

```bash
npm run pages:dev
```

說明：

- `npm run dev` 適合純 UI 開發，速度最快
- `npm run pages:dev` 會模擬正式的 `/api/*` proxy 行為
- localhost 會自動略過 Cloudflare Access JWT 驗證，方便本機開發

## 測試與驗證

後端測試：

```bash
npm run test
```

Dashboard 檢查：

```bash
cd dashboard
npm run lint
npm run build
```

目前 repository 內還沒有 dashboard 專屬的自動化 UI 測試，所以目前以：

- `npm run test`
- `cd dashboard && npm run lint`
- `cd dashboard && npm run build`

作為主要驗證流程。

## 部署

### 最簡單的部署流程

如果 Cloudflare 資源都已經先建好，平常部署只要兩步：

1. 部署後端 Worker
2. 部署 Dashboard Pages

### 1. 部署 Worker

在根目錄執行：

```bash
npm run deploy
```

這個腳本會部署 `accounting-assistant` Worker，並更新 Telegram webhook。

### 2. 部署 Dashboard

在 `dashboard/` 目錄執行：

```bash
npm run pages:deploy
```

目前 Pages 專案名稱為 `accounting-dashboard`。

## 一次性設定

### Worker secrets

後端 Worker 至少需要：

- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `ALLOWED_USER_ID`
- `DASHBOARD_PROXY_SECRET`

### Pages secrets

Dashboard 的 Pages 專案至少需要：

- `API_BASE_URL`
- `DASHBOARD_PROXY_SECRET`
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`
- `CLOUDFLARE_ACCESS_AUD`

範例：

```bash
cd dashboard
echo https://accounting-assistant.tai-accouting.workers.dev | npx wrangler pages secret put API_BASE_URL --project-name accounting-dashboard
```

說明：

- `API_BASE_URL`：後端 Worker URL
- `DASHBOARD_PROXY_SECRET`：必須與 Worker 端完全一致
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`：你的 Access team domain，例如 `https://<team>.cloudflareaccess.com`
- `CLOUDFLARE_ACCESS_AUD`：對應 Dashboard Access application 的 audience

如果更新了 Pages secrets，請重新部署一次 Pages，新的 deployment 才會吃到變更。

## Zero Trust / Access

目前正式站採用 fail-closed 設計：

- 沒有正確的 `DASHBOARD_PROXY_SECRET`，Worker API 會拒絕 dashboard 請求
- 沒有有效的 Cloudflare Access JWT，Pages 會拒絕請求
- 如果 production 沒設定 `CLOUDFLARE_ACCESS_TEAM_DOMAIN` 與 `CLOUDFLARE_ACCESS_AUD`，Pages 會回 `503`，不會公開提供 dashboard

建議的正式環境流量路徑如下：

1. 使用者先登入 Cloudflare Access
2. 通過後才能進入 Pages 網站
3. 前端呼叫同網域 `/api/*`
4. Pages Functions 以 `DASHBOARD_PROXY_SECRET` 代理到後端 Worker
5. Worker 處理帳務與分類 CRUD

## 目前狀態

目前已完成：

- Dashboard 從 Next.js 改為 `React + Vite + Cloudflare Pages`
- Pages Functions 同網域 proxy
- Worker 端 `DASHBOARD_PROXY_SECRET` 保護
- Pages 端 Cloudflare Access JWT 驗證
- 基本的 dashboard 查詢邏輯已開始抽到 `src/core/db.ts`

目前尚未完善，後續會再繼續整理：

1. 佈署方式再簡化
2. 共用邏輯再往 service layer 收斂
3. agentic AI 架構與 tools 整理
