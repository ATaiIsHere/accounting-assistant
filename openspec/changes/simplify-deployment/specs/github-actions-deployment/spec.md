## ADDED Requirements

### Requirement: GitHub Actions uses the shared deployment backbone
系統 MUST 提供 GitHub Actions 可呼叫的部署流程，使 CI 與本機共用相同的部署骨幹、階段名稱與失敗語意，而不是各自維護不同邏輯。

#### Scenario: Run deployment from GitHub Actions
- **WHEN** GitHub Actions 觸發正式部署工作流程
- **THEN** workflow 必須呼叫共用的部署入口，並依相同階段執行 preflight、provision、deploy 與 post-deploy

### Requirement: CI validates required credentials before deployment
系統 MUST 在 GitHub Actions 的部署開始前驗證必要 secrets、API token 權限與環境設定；若檢查失敗，workflow 必須在部署前中止。

#### Scenario: Missing GitHub Actions secret
- **WHEN** GitHub Actions 缺少必要的 Cloudflare token、Terraform 憑證或部署所需 secret
- **THEN** workflow 必須在正式部署前停止，並回報缺少的設定類型

### Requirement: CI supports staged automation
系統 SHALL 允許 GitHub Actions 將驗證、provision 與正式部署拆成可觀測的階段，以支援未來加入 `plan`、審查或不同環境的發佈策略。

#### Scenario: Separate validation and deployment stages
- **WHEN** 專案需要在正式發佈前先執行驗證或 IaC plan
- **THEN** workflow 必須能以獨立階段呈現這些步驟，且不破壞共用部署骨幹
