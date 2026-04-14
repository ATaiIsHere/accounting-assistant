# Dashboard

Accounting Assistant 的前端 Dashboard，使用 React + Vite 建置，部署到 Cloudflare Pages。

## 結構

```text
dashboard/
|-- src/                  React UI
|-- functions/            Pages Functions middleware 與 API proxy
|-- public/               靜態資源
|-- wrangler.toml         Pages project 設定
`-- .dev.vars             Pages Functions 本機設定
```

## 開發

安裝依賴：

```bash
npm install
```

啟動前端：

```bash
npm run dev
```

如需連同 Pages Functions 一起本機驗證：

```bash
npm run pages:dev
```

## 必要設定

放在 `dashboard/.dev.vars` 或由根目錄 deploy 流程同步：

- `API_BASE_URL`
- `DASHBOARD_PROXY_SECRET`

若使用 Cloudflare Access 自訂網域保護 Dashboard，另外需要：

- `CLOUDFLARE_ACCESS_TEAM_DOMAIN`
- `CLOUDFLARE_ACCESS_AUD`

## 部署

建議從 repo 根目錄執行：

```bash
npm run deploy
```

部署流程會：

- 建立或同步 Pages project
- 同步 `API_BASE_URL`
- 同步 `DASHBOARD_PROXY_SECRET`
- 視情況同步 Cloudflare Access 設定
- build 並部署 Dashboard

## Cloudflare Access

Dashboard 對 Worker API 的保護分兩層：

- Pages Functions 到 Worker 使用 `DASHBOARD_PROXY_SECRET`
- 自訂網域時，可再加上 Cloudflare Access 驗證終端使用者身份

目前行為如下：

- 如果 Dashboard 網域是 `*.pages.dev`，deploy 會自動跳過 Cloudflare Access provisioning
- 這種情況下 Dashboard 會是公開頁面，但 API 仍透過 `DASHBOARD_PROXY_SECRET` 保護
- 如果你要真正啟用 Cloudflare Access，請改用屬於你 Cloudflare zone 的自訂網域

## 驗證

```bash
npm run lint
npm run build
```
