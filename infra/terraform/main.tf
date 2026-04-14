locals {
  dashboard_access_includes = concat(
    [
      for email in var.dashboard_access_allowed_emails : {
        email = {
          email = email
        }
      }
    ],
    [
      for domain in var.dashboard_access_allowed_email_domains : {
        email_domain = {
          domain = domain
        }
      }
    ]
  )
}

resource "cloudflare_d1_database" "primary" {
  count      = var.manage_d1 ? 1 : 0
  account_id = var.cloudflare_account_id
  name       = var.d1_database_name

  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_pages_project" "dashboard" {
  count             = var.manage_pages_project ? 1 : 0
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.pages_production_branch

  lifecycle {
    ignore_changes = all
  }
}

resource "cloudflare_zero_trust_access_policy" "dashboard_allow" {
  count      = var.manage_dashboard_access ? 1 : 0
  account_id = var.cloudflare_account_id
  name       = "${var.dashboard_access_application_name} Allow"
  decision   = "allow"
  include    = local.dashboard_access_includes
}

resource "cloudflare_zero_trust_access_application" "dashboard" {
  count                     = var.manage_dashboard_access ? 1 : 0
  account_id                = var.cloudflare_account_id
  type                      = "self_hosted"
  name                      = var.dashboard_access_application_name
  domain                    = var.dashboard_domain
  session_duration          = var.dashboard_access_session_duration

  policies = [
    {
      id         = cloudflare_zero_trust_access_policy.dashboard_allow[0].id
      precedence = 1
    }
  ]
}
