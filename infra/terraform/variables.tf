variable "cloudflare_account_id" {
  description = "Cloudflare account ID."
  type        = string
}

variable "manage_d1" {
  description = "Whether to manage the D1 database with Terraform."
  type        = bool
  default     = true
}

variable "d1_database_name" {
  description = "D1 database name."
  type        = string
}

variable "manage_pages_project" {
  description = "Whether to manage the Pages project with Terraform."
  type        = bool
  default     = true
}

variable "pages_project_name" {
  description = "Cloudflare Pages project name."
  type        = string
}

variable "pages_production_branch" {
  description = "Cloudflare Pages production branch."
  type        = string
  default     = "main"
}

variable "manage_dashboard_access" {
  description = "Whether to manage the dashboard Access application and policy."
  type        = bool
  default     = true
}

variable "dashboard_domain" {
  description = "Dashboard hostname protected by Cloudflare Access. Leave empty to auto-detect from the Pages project subdomain, or set a custom domain to enable Zero Trust protection."
  type        = string
  default     = ""
}

variable "dashboard_access_application_name" {
  description = "Cloudflare Access application name."
  type        = string
}

variable "dashboard_access_session_duration" {
  description = "Cloudflare Access session duration."
  type        = string
  default     = "24h"
}

variable "dashboard_access_allowed_emails" {
  description = "Allow-list email addresses for dashboard access."
  type        = list(string)
  default     = []
}

variable "dashboard_access_allowed_email_domains" {
  description = "Allow-list email domains for dashboard access."
  type        = list(string)
  default     = []
}
