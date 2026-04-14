## Why

目前專案的部署流程只涵蓋既有 Worker 與既有 Pages 專案的發佈，Cloudflare 資源建立仍散落在 `setup` 腳本、README 手動步驟與 Cloudflare 後台操作之間。這讓首次部署、換環境、交接維運與未來接入 GitHub Actions 都容易卡在「少一個資源」或「資源存在但沒有被流程接住」。

## What Changes

- 提供單一 `deploy` 入口，先執行前置檢查，發現缺少必要 Cloudflare 資源時自動進入建立或同步流程，再繼續部署應用程式。
- 將長期存在的 Cloudflare 資源納入 IaC 管理範圍，至少涵蓋 D1、Pages project 與 Cloudflare Access / Zero Trust 相關設定。
- 明確區分 IaC 與非 IaC 管理邊界，避免將不適合放進 state 的敏感 secrets 直接交由 Terraform 管理。
- 規劃可重用的 GitHub Actions 部署流程，讓本機與 CI 盡量共用同一套部署入口與步驟。
- 更新文件與任務拆解，讓首次部署與後續維運都以相同心智模型操作。

## Capabilities

### New Capabilities
- `deployment-workflow`: 定義單一入口的部署流程、前置檢查、缺資源時自動 provision 與部署順序。
- `infrastructure-provisioning`: 定義 Cloudflare 長期資源的建立、同步、採納與 IaC 管理邊界。
- `github-actions-deployment`: 定義 GitHub Actions 如何重用相同部署入口並完成自動化驗證與發佈。

### Modified Capabilities
- 無

## Impact

- 可能新增 `infra/` 或同等 IaC 資料夾，並調整 `scripts/deploy.ts`、`scripts/setup.ts`、根目錄 `package.json` 與 [dashboard/package.json](d:/ATai/Documents/AI/accounting-assistant/dashboard/package.json)。
- 可能新增或調整 GitHub Actions workflow，例如 `.github/workflows/*`。
- 會影響 Worker、Pages、D1 與 Cloudflare Access 的部署與初始化說明。
- 需要定義既有手動建立資源如何被新流程接管，避免首次導入 IaC 時覆蓋既有環境。

## 替代方案與取捨

- 繼續以 Wrangler CLI + README 手動步驟為主：工具最少，但首次部署與 CI 接軌依然脆弱。
- 全部都交給 Terraform：表面上最一致，但 secrets 與應用程式發佈未必適合放進 Terraform state，風險較高。
- 本機與 GitHub Actions 各自維護不同流程：短期可行，但會讓排錯與維運成本持續上升。
