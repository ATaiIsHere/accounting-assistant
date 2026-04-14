# Infrastructure Provisioning

這個目錄使用 Terraform 管理 Cloudflare 的長期資源：

- D1 database
- Cloudflare Pages project
- Cloudflare Access application / policy

以下內容不放進 Terraform state：

- Worker secrets
- Pages secrets
- Worker / Pages deploy artifact

建議從 repo 根目錄執行：

```bash
npm run infra:plan
npm run infra:apply
```

如果要直接操作 Terraform：

```bash
cd infra/terraform
terraform init
terraform plan
terraform apply
```

## Required Environment Variables

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ACCESS_ALLOWED_EMAILS` 或 `CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS`

常用變數：

- `D1_DATABASE_NAME`
- `PAGES_PROJECT_NAME`
- `PAGES_PRODUCTION_BRANCH`
- `DASHBOARD_DOMAIN`

## Adopt / Import Existing Resources

如果 Cloudflare 上已經有既有資源，而 `npm run deploy` 偵測到 Terraform state 尚未接管，流程會停止並要求先 adopt / import。

基本流程：

1. 先準備好 `terraform.tfvars`，避免 `terraform import` 時逐項詢問變數
2. 確認現有資源的 Cloudflare ID
3. 執行對應的 `terraform import`
4. 再重新執行 `npm run deploy`

常見 Terraform addresses：

- `cloudflare_d1_database.primary[0]`
- `cloudflare_pages_project.dashboard[0]`
- `cloudflare_zero_trust_access_application.dashboard[0]`
- `cloudflare_zero_trust_access_policy.dashboard_allow[0]`

### D1 import 格式

D1 的 import ID 不是只填 database UUID，而是：

```text
<account_id>/<database_id>
```

例如：

```bash
terraform import cloudflare_d1_database.primary[0] <account_id>/<database_id>
```

如果 account ID 是 `abc123`，database ID 是 `149f8274-9f90-43ae-bb7a-ad30cd73b062`，命令會是：

```bash
terraform import cloudflare_d1_database.primary[0] abc123/149f8274-9f90-43ae-bb7a-ad30cd73b062
```

如果你想直接沿用根目錄 `.dev.vars`，也可以從 repo 根目錄執行：

```bash
npm run infra:import:d1 -- 149f8274-9f90-43ae-bb7a-ad30cd73b062
```

這個包裝指令會自動：

- 讀取根目錄 `.dev.vars`
- 組合 D1 的 Terraform import ID
- 帶入 Terraform 需要的 `-var-file`
- 執行 `terraform init` 與 `terraform import`

### Pages project import

Pages project 的 import ID 依 Cloudflare provider 規則處理；如果你不想 adopt 既有 project，也可以先刪掉既有 Pages project，再讓 Terraform 在下一次 `npm run deploy` 時重新建立。

## Safe Teardown

如果你要刪除這個專案的 Cloudflare 長期資源，建議使用 repo 內建的安全入口，而不是直接 `terraform destroy`：

```bash
npm run infra:destroy
```

預設會刪除：

- Pages project
- Cloudflare Access application / policy

並保留：

- D1 database

你也可以縮小範圍：

```bash
npm run infra:destroy -- pages
npm run infra:destroy -- access
```

安全規則：

- D1 在 Terraform 中已設定 `prevent_destroy = true`
- `infra:destroy` 會固定讓 `manage_d1 = true`
- 因此這條路徑不會刪掉 D1 資料庫

## terraform.tfvars

建議建立 `infra/terraform/terraform.tfvars`，內容可從 `terraform.tfvars.example` 複製後修改。例如：

```hcl
cloudflare_account_id = "your-account-id"
d1_database_name = "accounting-db"
pages_project_name = "accounting-dashboard"
pages_production_branch = "main"
dashboard_domain = "accounting-dashboard.pages.dev"
dashboard_access_application_name = "Accounting Assistant Dashboard"
dashboard_access_allowed_emails = [
  "you@example.com",
]
dashboard_access_allowed_email_domains = []
```
