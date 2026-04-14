## 1. 單一部署入口

- [x] 1.1 重新定義部署骨幹，明確拆成 `preflight`、`provision`、`deploy`、`post-deploy` 四個階段。
- [x] 1.2 重構根目錄部署入口，讓本機與 CI 都能以同一命令啟動完整流程。
- [x] 1.3 整理 `scripts/setup.ts`、`scripts/deploy.ts`、`package.json` 與 `dashboard/package.json` 的責任邊界，移除重複或分岔入口。

## 2. 基礎設施 Provisioning

- [x] 2.1 新增 IaC 結構，定義 D1、Pages project 與 Cloudflare Access / Zero Trust 的宣告式資源。
- [x] 2.2 實作 provisioning 檢查邏輯，讓部署流程在缺少必要資源時自動建立或同步。
- [x] 2.3 為 Worker / Pages secrets 設計 state 外同步流程，避免敏感值寫入 IaC state。
- [x] 2.4 定義既有手動環境的 adopt / import 流程，避免導入 IaC 時直接覆蓋既有資源。

## 3. 應用程式部署與同步

- [x] 3.1 在 provisioning 成功後，實作固定部署順序：Worker、後部署同步、Dashboard 設定同步、Dashboard。
- [x] 3.2 補上成功摘要、失敗中止與可診斷的階段化輸出。
- [x] 3.3 驗證 `deploy` 在新環境與既有環境下都能正確區分「建立資源」、「採納資源」與「直接部署」。

## 4. GitHub Actions 規劃

- [x] 4.1 設計 GitHub Actions workflow，重用相同部署骨幹而不是另寫一套部署邏輯。
- [x] 4.2 定義 CI 所需 secrets、Cloudflare token 權限與 Terraform 憑證需求。
- [x] 4.3 規劃驗證、IaC plan / provision 與正式部署的階段切分，為後續 preview 或多環境策略預留空間。

## 5. 文件與導入

- [x] 5.1 更新根目錄 `README.md`，說明新的單一部署入口與資源自動建立流程。
- [x] 5.2 更新 `dashboard/README.md`，說明 Pages / Access 在新流程中的角色與必要設定。
- [x] 5.3 補充既有環境 adopt / import 與 GitHub Actions 導入說明，降低切換風險。
