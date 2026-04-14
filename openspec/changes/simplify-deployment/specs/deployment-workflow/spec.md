## ADDED Requirements

### Requirement: Unified deploy entrypoint
系統 MUST 提供單一 `deploy` 入口，讓操作者或 CI 可從專案根目錄啟動完整流程，而不需要先判斷是否要分別執行初始化、資源建立與應用程式部署命令。

#### Scenario: Start deployment from one command
- **WHEN** 操作者從專案根目錄啟動正式部署
- **THEN** 系統必須以單一入口開始前置檢查、資源處理與應用程式部署流程

#### Scenario: Reuse the same entrypoint in CI
- **WHEN** GitHub Actions 觸發正式部署流程
- **THEN** 系統必須重用相同部署入口，而不是維護另一套獨立的部署主邏輯

### Requirement: Missing resources trigger provisioning
系統 MUST 在部署前檢查必要 Cloudflare 資源；若資源不存在，必須自動進入 provisioning 流程建立或同步這些資源，之後再繼續部署。

#### Scenario: Provision missing resources before deployment
- **WHEN** 部署流程發現必要的 D1、Pages project 或 Access 設定不存在
- **THEN** 系統必須先執行對應的 provisioning 步驟，並在成功後繼續後續部署

#### Scenario: Stop when provisioning fails
- **WHEN** 部署流程發現必要資源不存在，且 provisioning 失敗
- **THEN** 系統必須停止應用程式部署，並清楚回報失敗的資源類型與未完成狀態

### Requirement: Ordered deployment after provisioning
當 provisioning 與前置檢查成功後，系統 SHALL 依固定順序完成 Worker 部署、必要後部署同步與 Dashboard 部署；若任一步驟失敗，系統 MUST 停止後續步驟並輸出整體狀態摘要。

#### Scenario: Successful full deployment after provisioning
- **WHEN** 前置檢查與 provisioning 成功，且完整部署流程順利完成
- **THEN** 系統必須依序完成 Worker 部署、後部署同步、Dashboard 設定同步與 Dashboard 部署，並輸出完整成功摘要

#### Scenario: Worker deployment fails after provisioning
- **WHEN** provisioning 成功，但 Worker 部署或其必要後部署同步失敗
- **THEN** 系統必須停止 Dashboard 部署，並清楚回報失敗步驟與當前狀態
