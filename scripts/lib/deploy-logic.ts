export type DeployTarget = 'worker' | 'dashboard' | 'all'

export type ResourcePlan = {
  manageD1: boolean
  managePagesProject: boolean
  manageAccess: boolean
}

export type DurableResourceIssue = {
  resource: 'D1 database' | 'Pages project' | 'Access application'
  identifier: string
  terraformAddress: string
  cloudflareId?: string
  terraformImportId?: string
}

export function buildResourcePlan(target: DeployTarget): ResourcePlan {
  return { manageD1: true, managePagesProject: true, manageAccess: true }
}

export function inferWorkerApiBaseUrl(workerName: string, explicit?: string) {
  const value = explicit?.trim()
  if (value) {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`
  }

  return `https://${workerName}.workers.dev`
}

export function renderAdoptGuidance(issues: DurableResourceIssue[], importGuidePath: string) {
  const lines = [
    '偵測到 Cloudflare 上已有資源，但 Terraform state 尚未接管。為避免直接覆蓋，這次部署已停止。',
    '',
    '請先依照下列資源執行 adopt / import：',
  ]

  for (const issue of issues) {
    lines.push(`- ${issue.resource}: ${issue.identifier}`)
    lines.push(`  Terraform address: ${issue.terraformAddress}`)
    if (issue.cloudflareId) {
      lines.push(`  Cloudflare ID: ${issue.cloudflareId}`)
    }
    if (issue.terraformImportId) {
      lines.push(`  Terraform import ID: ${issue.terraformImportId}`)
    }
  }

  lines.push('')
  lines.push(`導入說明請參考 ${importGuidePath}`)
  return lines.join('\n')
}
