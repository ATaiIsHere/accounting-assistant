# Accounting Assistant

Telegram 記帳助理，後端部署在 Cloudflare Workers，前端 Dashboard 部署在 Cloudflare Pages，資料存放於 Cloudflare D1。

## 專案結構

```text
.
|-- dashboard/              React Dashboard
|-- infra/terraform/        Cloudflare IaC
|-- openspec/               OpenSpec changes 與 specs
|-- scripts/                deploy / provision / setup scripts
|-- src/                    Worker 原始碼
|-- tests/                  Worker tests
|-- schema.sql              D1 schema
|-- wrangler.jsonc          Worker 設定
|-- package.json            根目錄 scripts
```

## 主要技術

- Cloudflare Workers
- Cloudflare D1
- Cloudflare Pages
- Cloudflare Access
- React 19 + Vite
- Terraform
- Vitest

## 本機開發

安裝依賴：

```bash
npm ci
npm ci --prefix dashboard
```

啟動 Worker 本機開發：

```bash
npm run dev
```

執行測試：

```bash
npm test
```

Dashboard 檢查與建置：

```bash
npm --prefix dashboard run lint
npm --prefix dashboard run build
```

## 單一部署入口

部署流程已收斂為單一入口：

```bash
npm run deploy
```

這個入口會固定執行：

```text
preflight
-> provision
-> deploy
-> post-deploy
```

如果缺少 Cloudflare 長期資源，流程會先進入 provision；如果資源已存在但尚未被 Terraform state 接管，流程會停止並提示先做 adopt/import。

常用 scripts：

- `npm run setup`：相容舊入口，內部仍走共享 provisioning 流程
- `npm run provision`：只做 provision
- `npm run deploy`：完整部署
- `npm run deploy:worker`：只部署 Worker
- `npm run deploy:dashboard`：只部署 Dashboard
- `npm run deploy:ci`：CI 用完整部署入口
- `npm run infra:plan`：執行 Terraform plan
- `npm run infra:apply`：執行 Terraform apply

## Provisioning 與 IaC

這個專案採混合式部署：

- Terraform 管理長期 Cloudflare 資源
- Wrangler / Cloudflare API 管理 secrets 與實際 deploy

目前 Terraform 負責：

- D1 database
- Cloudflare Pages project
- Cloudflare Access application / policy

目前不放進 Terraform state 的內容：

- Worker secrets
- Pages secrets
- Worker / Pages deploy artifact

如需直接操作 Terraform：

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

平常建議直接用根目錄 scripts：

```bash
npm run infra:plan
npm run infra:apply
```

## 必要設定與 Secrets

### Cloudflare / IaC

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ACCESS_ALLOWED_EMAILS` 或 `CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS`

常用非 secret 參數：

- `D1_DATABASE_NAME`
- `PAGES_PROJECT_NAME`
- `PAGES_PRODUCTION_BRANCH`
- `DASHBOARD_DOMAIN`

### Cloudflare API Token 建立方式

可以先用 Cloudflare Dashboard 的 API token template URL 預填表單，再手動完成建立。template URL 只會預填欄位，不會直接建立 token。

目前實測結果是：

- `D1 > Edit` 可以透過 template URL 預填
- `Cloudflare Pages > Write` 也可以透過 template URL 預填，對應 key 是 `page`

[Open Cloudflare token template](https://dash.cloudflare.com/?to=/:account/api-tokens&permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22access%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22access_acct%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%5D&name=Accounting%20Assistant%20Deploy%20Token)

打開後請確認畫面中已預填：

- `Cloudflare Pages > Write`
- `D1 > Edit`

最後這顆 token 應具備以下權限：

- `Workers Scripts > Write`
- `Account Settings > Read`
- `Access applications > Edit`
- `Access organizations > Edit`
- `Cloudflare Pages > Write`
- `D1 > Edit`

建立時請注意：

- `Account Resources` 只選此專案所在的 account，不要選 `All accounts`
- 建好後把 token 放到根目錄 `.dev.vars` 或 GitHub Actions secrets，名稱是 `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` 可在 Cloudflare Dashboard 的 Overview 頁找到

### Worker

- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `ALLOWED_USER_ID`
- `DASHBOARD_PROXY_SECRET`
- `DASHBOARD_URL`

### Dashboard / Pages

- `API_BASE_URL`
- `DASHBOARD_PROXY_SECRET`
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`
- `CLOUDFLARE_ACCESS_AUD`

可放置位置：

- 根目錄 `.dev.vars`
- `dashboard/.dev.vars`

兩邊都會讀取的共用值：

- `DASHBOARD_PROXY_SECRET`
- `DASHBOARD_URL`
- `API_BASE_URL`

## Adopt / Import 既有資源

如果 Cloudflare 上已經有既有的 D1、Pages project 或 Access application，但 Terraform state 尚未接管，`npm run deploy` 會停止，避免直接覆蓋現有設定。

處理方式：

1. 先看 [infra/terraform/README.md](/d:/ATai/Documents/AI/accounting-assistant/infra/terraform/README.md) 內對應的 Terraform address
2. 使用 `terraform import` 將既有資源納入 state
3. 再重新執行 `npm run deploy`

常見 Terraform addresses：

- `cloudflare_d1_database.primary[0]`
- `cloudflare_pages_project.dashboard[0]`
- `cloudflare_zero_trust_access_application.dashboard[0]`
- `cloudflare_zero_trust_access_policy.dashboard_allow[0]`

## 驗證

Worker：

```bash
npm test
```

Dashboard：

```bash
npm --prefix dashboard run lint
npm --prefix dashboard run build
```

## GitHub Actions

repo 內建的 [deploy.yml](/d:/ATai/Documents/AI/accounting-assistant/.github/workflows/deploy.yml) 目前分成三段：

- `validate`：執行 Worker tests、Dashboard lint、Dashboard build
- `infra-plan`：執行 Terraform plan
- `deploy`：在 `main` 分支執行 `npm run deploy:ci`

需要設定的 GitHub Secrets：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`
- `CLOUDFLARE_ACCESS_ALLOWED_EMAILS` 或 `CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS`
- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `ALLOWED_USER_ID`
- `DASHBOARD_PROXY_SECRET`

常用 GitHub Variables：

- `DASHBOARD_DOMAIN`
- `DASHBOARD_URL`
- `API_BASE_URL`
- `D1_DATABASE_NAME`
- `PAGES_PROJECT_NAME`
- `PAGES_PRODUCTION_BRANCH`
