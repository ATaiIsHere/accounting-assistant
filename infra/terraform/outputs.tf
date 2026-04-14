output "d1_database_id" {
  value = var.manage_d1 ? cloudflare_d1_database.primary[0].id : null
}

output "pages_project_name" {
  value = var.manage_pages_project ? cloudflare_pages_project.dashboard[0].name : var.pages_project_name
}

output "dashboard_url" {
  value = var.manage_pages_project ? "https://${cloudflare_pages_project.dashboard[0].subdomain}" : (
    var.dashboard_domain != "" ? "https://${var.dashboard_domain}" : null
  )
}

output "dashboard_access_aud" {
  value = var.manage_dashboard_access ? cloudflare_zero_trust_access_application.dashboard[0].aud : null
}
