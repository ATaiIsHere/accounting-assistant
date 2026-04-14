## ADDED Requirements

### Requirement: Durable Cloudflare resources are managed declaratively
系統 MUST 以宣告式方式管理長期存在的 Cloudflare 資源，至少涵蓋 D1 database、Pages project 與 Cloudflare Access / Zero Trust 應用程式相關設定，讓新環境可由同一流程建立並維持一致性。

#### Scenario: Create durable resources for a new environment
- **WHEN** 部署流程面對尚未建立任何 Cloudflare 資源的新環境
- **THEN** 系統必須能建立 D1 database、Pages project 與必要的 Access 設定，讓後續應用程式部署可繼續進行

### Requirement: Sensitive secrets stay outside IaC state
系統 MUST 將敏感 secrets 與 deploy artifact 發佈邏輯排除在 Terraform state 之外，並使用較適合的機制管理，例如 Wrangler、Cloudflare API 或 CI secrets。

#### Scenario: Manage secrets without storing values in IaC state
- **WHEN** 部署流程需要寫入 Worker 或 Pages 的敏感 secret 值
- **THEN** 系統必須使用非 Terraform state 的方式同步這些 secrets，且不得要求將敏感值明文寫入 IaC state

### Requirement: Existing unmanaged resources require explicit adoption
若 Cloudflare 資源已存在但尚未納入 IaC 管理，系統 MUST 回報需要 adopt / import 的狀態與處理指引，而不得直接假設可以安全覆蓋既有設定。

#### Scenario: Encounter existing resource outside IaC state
- **WHEN** 部署流程發現目標資源已存在，但未被當前 IaC state 管理
- **THEN** 系統必須停止自動覆蓋，並提供需要 adopt / import 的明確提示
