## Context

目前專案的 Cloudflare 相關工作分散在三處：

- `scripts/setup.ts`：建立或查詢 D1、套用 schema，並寫入部分 Worker secrets。
- `scripts/deploy.ts`：部署 Worker，之後設定 Telegram webhook 與 bot commands。
- `dashboard/package.json` 與 README：部署既有 Pages project，並要求操作者手動建立 Pages secrets 與 Cloudflare Access 設定。

這代表目前流程比較像「部署已經存在的環境」，而不是「從空環境一路建立並部署完成」。若要進一步支援 GitHub Actions，就需要先把資源建立、敏感設定同步、應用程式部署與後部署同步拆成可重用的階段。

另外，Cloudflare 官方文件顯示：

- D1、Pages project 與 Zero Trust / Access 適合用 Terraform 管理。
- Workers secrets 不建議繼續依賴即將淘汰的 Terraform secret resource，較適合使用 Wrangler 或 API 管理。
- Terraform 若要接管既有手動資源，需要先 import / adopt，而不是直接假設所有現有資源都能無痛接手。

因此這次設計不只是「把指令變短」，而是要重新定義部署與基礎設施的責任邊界。

## Goals / Non-Goals

**Goals:**

- 提供單一 `deploy` 入口，讓操作者不必先判斷要跑 `setup`、`deploy`、`pages:deploy` 或手動開 Cloudflare 後台。
- 讓 `deploy` 先做前置檢查，再在缺少資源時進入 `provision`，最後接續應用程式部署。
- 使用 IaC 管理長期存在且適合宣告式管理的 Cloudflare 資源。
- 保留 secrets 與應用程式發佈在較適合的工具鏈，例如 Wrangler、Cloudflare API 或 CI secrets。
- 讓本機部署與 GitHub Actions 共用相同流程骨幹，降低雙軌維運成本。

**Non-Goals:**

- 不在這次變更中導入完整的多環境矩陣平台治理。
- 不把所有 Cloudflare 設定都強制搬到 Terraform state，尤其是敏感 secrets。
- 不重構 Worker、Dashboard 或 Telegram 功能本身。
- 不保證第一版就自動接管所有既有手動建立資源；既有環境可能仍需要一次性的 import / adopt 步驟。

## Decisions

### 1. 對外只保留單一 `deploy` 入口，對內拆成多階段流程

決策：使用者與 CI 對外只看見單一 `deploy` 入口；內部固定執行 `preflight -> provision -> deploy -> post-deploy`。

理由：

- 符合你希望的單一入口體驗。
- 也保留內部可測試、可觀測、可在 CI 重用的分階段結構。
- 比把所有邏輯直接塞進單一大腳本更容易維護。

替代方案：

- 保留 `setup` 與 `deploy` 兩條入口：會讓首次部署與日常部署持續分岔。
- 將 provision 完全獨立成另一個使用者命令：技術上可行，但不符合你要的操作體驗。

### 2. 採用混合式 IaC：Terraform 管長期資源，Wrangler / API 管 secrets 與程式部署

決策：以 Terraform 管理 D1、Pages project、Cloudflare Access / Zero Trust 等長期資源；Worker / Pages secrets 與實際程式發佈仍交給 Wrangler、Cloudflare API 或 GitHub Actions secrets。

理由：

- Terraform 適合建立與同步長期存在、可宣告的 Cloudflare 資源。
- Cloudflare 官方已明示 Workers secret 的舊 Terraform resource 不建議繼續使用，直接用 Wrangler / API 反而穩定。
- 這種分工可以避免把敏感 secrets 值留在 Terraform state。

替代方案：

- 全 CLI：入門容易，但規模一大就很難保證一致性。
- 全 Terraform：一致性高，但 secrets 與 deploy artifact 生命周期不吻合，且 state 風險較高。

### 3. `deploy` 在缺少資源時自動 provision，但對既有手動資源採取保守接管

決策：如果資源不存在，`deploy` 可以直接建立；如果資源已存在但尚未納入 IaC state，系統應回報需要 adopt / import，而不是直接假設可安全覆蓋。

理由：

- 新環境可以做到真正的「沒有就建」。
- 舊環境若直接硬套 IaC，最容易造成設定漂移或意外覆蓋。
- 這個決策讓自動化更安全，也符合 Cloudflare / Terraform 的實際運作方式。

替代方案：

- 發現資源存在就完全跳過 IaC：會讓長期狀態繼續分裂。
- 發現資源存在就強制覆蓋：風險太高。

### 4. 將 GitHub Actions 視為同一部署骨幹的執行者，而不是另一套流程

決策：GitHub Actions 不重新實作部署邏輯，而是重用同一條部署入口，透過 CI 專用參數與 secrets 來源完成自動化。

理由：

- 本機失敗與 CI 失敗才能用相同心智模型排查。
- 可以避免兩套腳本各自演化。
- 更適合之後加上 `plan`、`apply`、preview 或 production promotion。

替代方案：

- 讓 GitHub Actions 只執行簡單 shell commands：短期快，但容易與本機流程脫鉤。

### 5. Cloudflare Access 納入目標範圍，但需明確標示權限需求

決策：將 Cloudflare Access application / policy 納入 provisioning 規劃，但需要明確要求 CI / 本機使用的 API token 擁有對應權限，並在權限不足時停止流程。

理由：

- 目前 Access 是手動流程中最容易漏掉的一塊。
- 若不納入目標範圍，Dashboard 仍然無法真正做到從零建立到可用。
- 但 Access 權限比單純 Workers / Pages 更敏感，必須讓失敗訊息清楚可診斷。

替代方案：

- 先不碰 Access：導入成本較低，但流程仍不完整。

## Risks / Trade-offs

- [Terraform 與手動 Cloudflare 設定並存] → 明確規範哪些資源交給 IaC，並在文件中寫清 adopt / import 流程。
- [Secrets 不放進 IaC 會讓工具鏈變成混合式] → 接受工具數量略多，換取安全邊界與較低的 state 風險。
- [單一入口責任變大] → 內部分層為 preflight、provision、deploy、post-deploy，並提供清楚的階段化輸出。
- [GitHub Actions 權限不足或祕密未設好] → 在 workflow 起始就做權限與必要 secrets 檢查，避免執行到一半才失敗。
- [既有手動環境難以一次導入 IaC] → 將 import / adopt 視為 migration 的必要步驟，而不是隱式自動處理。

## Migration Plan

1. 定義 IaC 管理邊界，新增 `infra/` 或同等資料夾描述 Cloudflare 長期資源。
2. 將 `deploy` 重構為單一入口，內部分成 preflight、provision、deploy、post-deploy。
3. 為既有環境提供一次性的資源 adopt / import 指南或腳本。
4. 將 Worker / Pages secrets 同步邏輯整合進部署入口，但維持在 Terraform state 之外。
5. 新增 GitHub Actions workflow，重用同一條部署骨幹。
6. 更新 README 與維運說明，讓首次部署與後續部署都走相同入口。

## Open Questions

- 第一期是否要同時支援 `staging` 與 `production`，或先只把 production 流程做完整。
- Access policy 的最小可行預設值要到什麼程度，才能兼顧安全與可落地。
- 既有手動建立的 Pages project 與 Access app，是否需要提供半自動 import 工具。
