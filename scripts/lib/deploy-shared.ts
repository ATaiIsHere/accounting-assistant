import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildResourcePlan,
  inferWorkerApiBaseUrl,
  renderAdoptGuidance,
  type DeployTarget,
  type DurableResourceIssue,
  type ResourcePlan,
} from './deploy-logic'

type WorkflowMode = 'deploy' | 'provision'

type CliOptions = {
  target: DeployTarget
  ci: boolean
  planOnly: boolean
  applyOnly: boolean
}

type DeployConfig = {
  mode: WorkflowMode
  target: DeployTarget
  ci: boolean
  planOnly: boolean
  applyOnly: boolean
  rootDir: string
  dashboardDir: string
  infraDir: string
  workerName: string
  d1DatabaseName: string
  pagesProjectName: string
  pagesProductionBranch: string
  dashboardDomain: string
  dashboardUrl: string
  manageDashboardAccess: boolean
  cloudflareAccountId?: string
  cloudflareApiToken?: string
  cloudflareAccessTeamDomain?: string
  cloudflareAccessAud?: string
  cloudflareAccessAllowedEmails: string[]
  cloudflareAccessAllowedEmailDomains: string[]
  telegramBotToken?: string
  geminiApiKey?: string
  allowedUserId?: string
  dashboardProxySecret?: string
  apiBaseUrl?: string
  resourcePlan: ResourcePlan
}

type TerraformOutputs = {
  d1_database_id?: { value: string | null }
  dashboard_access_aud?: { value: string | null }
  dashboard_url?: { value: string | null }
  pages_project_name?: { value: string | null }
}

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DASHBOARD_DIR = join(ROOT_DIR, 'dashboard')
const INFRA_DIR = join(ROOT_DIR, 'infra', 'terraform')
const ROOT_ENV_PATH = join(ROOT_DIR, '.dev.vars')
const DASHBOARD_ENV_PATH = join(DASHBOARD_DIR, '.dev.vars')
const WRANGLER_CONFIG_PATH = join(ROOT_DIR, 'wrangler.jsonc')
const DASHBOARD_WRANGLER_PATH = join(DASHBOARD_DIR, 'wrangler.toml')
const IMPORT_GUIDE_PATH = join(INFRA_DIR, 'README.md')

function logStage(phase: 'preflight' | 'provision' | 'deploy' | 'post-deploy', detail: string) {
  console.log(`\n[${phase}] ${detail}`)
}

function fail(message: string): never {
  throw new Error(message)
}

function normalizeUrl(value?: string | null) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function normalizeTeamDomain(value?: string) {
  const normalized = normalizeUrl(value)
  return normalized?.replace(/\/$/, '')
}

function isPagesDevDomain(value: string) {
  return value.trim().toLowerCase().endsWith('.pages.dev')
}

function parseCsv(value?: string | null) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {} as Record<string, string>

  const values: Record<string, string> = {}
  const content = readFileSync(filePath, 'utf-8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }

  return values
}

function upsertEnvFile(filePath: string, updates: Record<string, string | undefined>, quoted: boolean) {
  const original = existsSync(filePath) ? readFileSync(filePath, 'utf-8').split(/\r?\n/) : []
  const nextLines = [...original]

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue

    const rendered = `${key}=${quoted ? JSON.stringify(value) : value}`
    const index = nextLines.findIndex((line) => line.trim().startsWith(`${key}=`))
    if (index >= 0) {
      nextLines[index] = rendered
    } else {
      nextLines.push(rendered)
    }
  }

  writeFileSync(filePath, `${nextLines.join('\n').replace(/\n+$/, '')}\n`, 'utf-8')
}

function parseWranglerName(configPath: string) {
  const content = readFileSync(configPath, 'utf-8')
  return content.match(/"name"\s*:\s*"([^"]+)"/)?.[1]
}

function parseFirstD1DatabaseName(configPath: string) {
  const content = readFileSync(configPath, 'utf-8')
  return content.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1]
}

function parseTomlName(configPath: string) {
  const content = readFileSync(configPath, 'utf-8')
  return content.match(/^name\s*=\s*"([^"]+)"/m)?.[1]
}

function resolveExecutable(command: string) {
  if (command === 'wrangler') {
    const localBin = join(ROOT_DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler')
    if (existsSync(localBin)) return localBin
  }

  if (process.platform === 'win32' && /^(npm|npx)$/i.test(command)) {
    return `${command}.cmd`
  }

  return command
}

function quoteWindowsArg(value: string) {
  if (!/[\s"]/g.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

function spawnProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string
    input?: string
    env?: NodeJS.ProcessEnv
    encoding?: BufferEncoding
    stdio?: 'pipe' | ['pipe', 'inherit', 'inherit']
  } = {},
) {
  const executable = resolveExecutable(command)
  const isCmdWrapper = process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')

  if (isCmdWrapper) {
    const cmdArgs = ['/d', '/s', '/c', `${quoteWindowsArg(executable)} ${args.map(quoteWindowsArg).join(' ')}`]
    return spawnSync(process.env.ComSpec || 'cmd.exe', cmdArgs, {
      cwd: options.cwd ?? ROOT_DIR,
      input: options.input,
      env: options.env,
      encoding: options.encoding ?? 'utf-8',
      stdio: options.stdio ?? 'pipe',
    })
  }

  return spawnSync(executable, args, {
    cwd: options.cwd ?? ROOT_DIR,
    input: options.input,
    env: options.env,
    encoding: options.encoding ?? 'utf-8',
    stdio: options.stdio ?? 'pipe',
  })
}

function ensureTool(command: string, args: string[], displayName: string) {
  const result = spawnProcess(command, args)
  if (result.status !== 0) {
    fail(`${displayName} is not available. Please install it or check PATH.`)
  }
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string
    input?: string
    env?: NodeJS.ProcessEnv
    allowFailure?: boolean
  } = {},
) {
  const result = spawnProcess(command, args, {
    cwd: options.cwd ?? ROOT_DIR,
    input: options.input,
    env: options.env,
    encoding: 'utf-8',
    stdio: 'pipe',
  })

  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const combined = `${stdout}${stderr}`

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(combined.trim() || `${command} ${args.join(' ')} failed`)
  }

  return { ...result, stdout, stderr, combined }
}

function runStreamingCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string
    input?: string
    env?: NodeJS.ProcessEnv
    allowFailure?: boolean
  } = {},
) {
  const result = spawnProcess(command, args, {
    cwd: options.cwd ?? ROOT_DIR,
    input: options.input,
    env: options.env,
    encoding: 'utf-8',
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }

  return result
}

function createTempDir() {
  return mkdtempSync(join(tmpdir(), 'accounting-assistant-deploy-'))
}

function writeTempJson(dirPath: string, fileName: string, value: unknown) {
  const filePath = join(dirPath, fileName)
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  return filePath
}

function parseCliArgs(argv: string[]): CliOptions {
  let target: DeployTarget = 'all'
  let ci = Boolean(process.env.CI)
  let planOnly = false
  let applyOnly = false

  for (const arg of argv) {
    if (arg === 'worker' || arg === 'dashboard' || arg === 'all') {
      target = arg
      continue
    }

    if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length)
      if (value === 'worker' || value === 'dashboard' || value === 'all') {
        target = value
      }
      continue
    }

    if (arg === '--ci') {
      ci = true
      continue
    }

    if (arg === '--plan') {
      planOnly = true
      continue
    }

    if (arg === '--apply') {
      applyOnly = true
    }
  }

  return { target, ci, planOnly, applyOnly }
}

function loadConfig(mode: WorkflowMode, options: CliOptions): DeployConfig {
  const rootEnv = parseEnvFile(ROOT_ENV_PATH)
  const dashboardEnv = parseEnvFile(DASHBOARD_ENV_PATH)

  const workerName = process.env.WORKER_NAME?.trim() || parseWranglerName(WRANGLER_CONFIG_PATH) || 'accounting-assistant'
  const d1DatabaseName =
    process.env.D1_DATABASE_NAME?.trim() || parseFirstD1DatabaseName(WRANGLER_CONFIG_PATH) || 'accounting-db'
  const pagesProjectName =
    process.env.PAGES_PROJECT_NAME?.trim() || parseTomlName(DASHBOARD_WRANGLER_PATH) || 'accounting-dashboard'
  const pagesProductionBranch = process.env.PAGES_PRODUCTION_BRANCH?.trim() || rootEnv.PAGES_PRODUCTION_BRANCH || 'main'
  const dashboardDomain = process.env.DASHBOARD_DOMAIN?.trim() || rootEnv.DASHBOARD_DOMAIN || `${pagesProjectName}.pages.dev`

  const cloudflareAccessAllowedEmails = parseCsv(
    process.env.CLOUDFLARE_ACCESS_ALLOWED_EMAILS || rootEnv.CLOUDFLARE_ACCESS_ALLOWED_EMAILS,
  )
  const cloudflareAccessAllowedEmailDomains = parseCsv(
    process.env.CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS || rootEnv.CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS,
  )

  const resourcePlan = buildResourcePlan(options.target)
  const hasAccessIdentities = cloudflareAccessAllowedEmails.length > 0 || cloudflareAccessAllowedEmailDomains.length > 0
  const manageDashboardAccess = resourcePlan.manageAccess && hasAccessIdentities
  const dashboardProxySecret =
    process.env.DASHBOARD_PROXY_SECRET?.trim() ||
    rootEnv.DASHBOARD_PROXY_SECRET ||
    dashboardEnv.DASHBOARD_PROXY_SECRET ||
    (!options.ci ? randomBytes(32).toString('hex') : undefined)

  const cloudflareAccessTeamDomain =
    normalizeTeamDomain(process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN) ||
    normalizeTeamDomain(rootEnv.CLOUDFLARE_ACCESS_TEAM_DOMAIN) ||
    normalizeTeamDomain(dashboardEnv.CLOUDFLARE_ACCESS_TEAM_DOMAIN)

  return {
    mode,
    target: options.target,
    ci: options.ci,
    planOnly: options.planOnly,
    applyOnly: options.applyOnly,
    rootDir: ROOT_DIR,
    dashboardDir: DASHBOARD_DIR,
    infraDir: INFRA_DIR,
    workerName,
    d1DatabaseName,
    pagesProjectName,
    pagesProductionBranch,
    dashboardDomain,
    dashboardUrl: normalizeUrl(process.env.DASHBOARD_URL) || normalizeUrl(rootEnv.DASHBOARD_URL) || `https://${dashboardDomain}`,
    manageDashboardAccess,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || rootEnv.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || rootEnv.CLOUDFLARE_API_TOKEN,
    cloudflareAccessTeamDomain,
    cloudflareAccessAud:
      process.env.CLOUDFLARE_ACCESS_AUD?.trim() ||
      rootEnv.CLOUDFLARE_ACCESS_AUD ||
      dashboardEnv.CLOUDFLARE_ACCESS_AUD,
    cloudflareAccessAllowedEmails,
    cloudflareAccessAllowedEmailDomains,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || rootEnv.TELEGRAM_BOT_TOKEN,
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || rootEnv.GEMINI_API_KEY,
    allowedUserId: process.env.ALLOWED_USER_ID?.trim() || rootEnv.ALLOWED_USER_ID,
    dashboardProxySecret,
    apiBaseUrl:
      normalizeUrl(process.env.API_BASE_URL) ||
      normalizeUrl(rootEnv.API_BASE_URL) ||
      normalizeUrl(dashboardEnv.API_BASE_URL),
    resourcePlan,
  }
}

function validateConfig(config: DeployConfig) {
  ensureTool('wrangler', ['--version'], 'Wrangler')

  const missing: string[] = []

  if (config.resourcePlan.manageD1 || config.resourcePlan.managePagesProject || config.manageDashboardAccess) {
    if (!config.cloudflareAccountId) missing.push('CLOUDFLARE_ACCOUNT_ID')
    if (!config.cloudflareApiToken) missing.push('CLOUDFLARE_API_TOKEN')
    ensureTool('terraform', ['version'], 'Terraform')
  }

  if (config.mode === 'deploy' && (config.target === 'worker' || config.target === 'all')) {
    if (!config.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN')
    if (!config.geminiApiKey) missing.push('GEMINI_API_KEY')
    if (!config.allowedUserId) missing.push('ALLOWED_USER_ID')
    if (!config.dashboardProxySecret) missing.push('DASHBOARD_PROXY_SECRET')
  }

  if (config.mode === 'deploy' && (config.target === 'dashboard' || config.target === 'all')) {
    if (!config.dashboardProxySecret) missing.push('DASHBOARD_PROXY_SECRET')
    if (config.manageDashboardAccess && !config.cloudflareAccessTeamDomain) {
      missing.push('CLOUDFLARE_ACCESS_TEAM_DOMAIN')
    }
    if (config.manageDashboardAccess) {
      if (
        config.cloudflareAccessAllowedEmails.length === 0 &&
        config.cloudflareAccessAllowedEmailDomains.length === 0
      ) {
        missing.push('CLOUDFLARE_ACCESS_ALLOWED_EMAILS or CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS')
      }
    }
  }

  if (missing.length > 0) {
    fail(
      [
        '部署前置檢查失敗，缺少必要設定：',
        ...missing.map((item) => `- ${item}`),
        '',
        '可將這些值放在下列任一位置：',
        '- 目前 shell 的環境變數',
        '- 根目錄 .dev.vars',
        '- dashboard/.dev.vars（僅 Dashboard / Access 相關欄位）',
      ].join('\n'),
    )
  }

}

function syncLocalEnvFiles(config: DeployConfig) {
  if (config.ci) return

  upsertEnvFile(
    ROOT_ENV_PATH,
    {
      TELEGRAM_BOT_TOKEN: config.telegramBotToken,
      GEMINI_API_KEY: config.geminiApiKey,
      ALLOWED_USER_ID: config.allowedUserId,
      DASHBOARD_PROXY_SECRET: config.dashboardProxySecret,
      DASHBOARD_URL: config.dashboardUrl,
      API_BASE_URL: inferWorkerApiBaseUrl(config.workerName, config.apiBaseUrl),
      CLOUDFLARE_ACCOUNT_ID: config.cloudflareAccountId,
      CLOUDFLARE_API_TOKEN: config.cloudflareApiToken,
      CLOUDFLARE_ACCESS_ALLOWED_EMAILS: config.cloudflareAccessAllowedEmails.join(','),
      CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS: config.cloudflareAccessAllowedEmailDomains.join(','),
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: config.cloudflareAccessTeamDomain,
      CLOUDFLARE_ACCESS_AUD: config.cloudflareAccessAud,
    },
    true,
  )

  upsertEnvFile(
    DASHBOARD_ENV_PATH,
    {
      API_BASE_URL: inferWorkerApiBaseUrl(config.workerName, config.apiBaseUrl),
      DASHBOARD_PROXY_SECRET: config.dashboardProxySecret,
      CLOUDFLARE_ACCESS_TEAM_DOMAIN: config.cloudflareAccessTeamDomain,
      CLOUDFLARE_ACCESS_AUD: config.cloudflareAccessAud,
    },
    false,
  )
}

async function cloudflareApiRequest<T>(config: DeployConfig, path: string) {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) {
    fail('Cloudflare API configuration is incomplete.')
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/${path}`, {
    headers: {
      Authorization: `Bearer ${config.cloudflareApiToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Cloudflare API request failed: ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { success: boolean; errors?: Array<{ message?: string }>; result: T }
  if (!payload.success) {
    const message = payload.errors?.map((error) => error.message).filter(Boolean).join('; ')
    throw new Error(message || 'Cloudflare API reported an error.')
  }

  return payload.result
}

function readTerraformState(config: DeployConfig) {
  const result = runCommand('terraform', ['state', 'list'], {
    cwd: config.infraDir,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: config.cloudflareApiToken },
    allowFailure: true,
  })

  if (result.status !== 0) return new Set<string>()

  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

async function detectUnmanagedResources(config: DeployConfig) {
  const stateResources = readTerraformState(config)
  const issues: DurableResourceIssue[] = []

  if (config.resourcePlan.manageD1 && !stateResources.has('cloudflare_d1_database.primary[0]')) {
    const databases = await cloudflareApiRequest<Array<{ uuid: string; name: string }>>(
      config,
      `accounts/${config.cloudflareAccountId}/d1/database`,
    )
    const existing = databases.find((database) => database.name === config.d1DatabaseName)
    if (existing) {
      issues.push({
        resource: 'D1 database',
        identifier: config.d1DatabaseName,
        terraformAddress: 'cloudflare_d1_database.primary[0]',
        cloudflareId: existing.uuid,
        terraformImportId: `${config.cloudflareAccountId}/${existing.uuid}`,
      })
    }
  }

  if (config.resourcePlan.managePagesProject && !stateResources.has('cloudflare_pages_project.dashboard[0]')) {
    const projects = await cloudflareApiRequest<Array<{ name: string }>>(
      config,
      `accounts/${config.cloudflareAccountId}/pages/projects`,
    )
    const existing = projects.find((project) => project.name === config.pagesProjectName)
    if (existing) {
      issues.push({
        resource: 'Pages project',
        identifier: config.pagesProjectName,
        terraformAddress: 'cloudflare_pages_project.dashboard[0]',
        cloudflareId: existing.name,
      })
    }
  }

  if (config.manageDashboardAccess && !stateResources.has('cloudflare_zero_trust_access_application.dashboard[0]')) {
    const apps = await cloudflareApiRequest<Array<{ id: string; domain?: string }>>(
      config,
      `accounts/${config.cloudflareAccountId}/access/apps`,
    ).catch(() => [] as Array<{ id: string; domain?: string }>)

    const existing = apps.find((app) => app.domain === config.dashboardDomain)
    if (existing) {
      issues.push({
        resource: 'Access application',
        identifier: config.dashboardDomain,
        terraformAddress: 'cloudflare_zero_trust_access_application.dashboard[0]',
        cloudflareId: existing.id,
      })
    }
  }

  if (issues.length > 0) {
    fail(renderAdoptGuidance(issues, IMPORT_GUIDE_PATH))
  }
}

function buildTerraformVars(config: DeployConfig, overrides?: { manageDashboardAccess?: boolean }) {
  return {
    cloudflare_account_id: config.cloudflareAccountId,
    manage_d1: config.resourcePlan.manageD1,
    d1_database_name: config.d1DatabaseName,
    manage_pages_project: config.resourcePlan.managePagesProject,
    pages_project_name: config.pagesProjectName,
    pages_production_branch: config.pagesProductionBranch,
    manage_dashboard_access: overrides?.manageDashboardAccess ?? config.manageDashboardAccess,
    dashboard_domain: config.dashboardDomain,
    dashboard_access_application_name: 'Accounting Assistant Dashboard',
    dashboard_access_allowed_emails: config.cloudflareAccessAllowedEmails,
    dashboard_access_allowed_email_domains: config.cloudflareAccessAllowedEmailDomains,
    dashboard_access_session_duration: '24h',
  }
}

function updateWranglerD1DatabaseId(databaseId: string) {
  const current = readFileSync(WRANGLER_CONFIG_PATH, 'utf-8')
  const next = current.replace(/"database_id"\s*:\s*"[^"]*"/, `"database_id": "${databaseId}"`)
  writeFileSync(WRANGLER_CONFIG_PATH, next, 'utf-8')
}

function readTerraformOutputs(config: DeployConfig) {
  const result = runCommand('terraform', ['output', '-json'], {
    cwd: config.infraDir,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: config.cloudflareApiToken },
    allowFailure: true,
  })

  if (result.status !== 0 || !result.stdout.trim()) {
    return {} as TerraformOutputs
  }

  return JSON.parse(result.stdout) as TerraformOutputs
}

function syncRemoteSchema(config: DeployConfig) {
  if (!config.resourcePlan.manageD1) return

  runStreamingCommand('wrangler', ['d1', 'execute', 'DB', '--remote', '--file=./schema.sql'], {
    cwd: config.rootDir,
    env: process.env,
  })
}

function syncPagesSecrets(config: DeployConfig, workerApiBaseUrl: string) {
  const secrets = [
    ['API_BASE_URL', workerApiBaseUrl],
    ['DASHBOARD_PROXY_SECRET', config.dashboardProxySecret ?? ''],
    ['CLOUDFLARE_ACCESS_TEAM_DOMAIN', config.manageDashboardAccess ? config.cloudflareAccessTeamDomain ?? '' : ''],
    ['CLOUDFLARE_ACCESS_AUD', config.manageDashboardAccess ? config.cloudflareAccessAud?.trim() ?? '' : ''],
  ] as const

  for (const [key, value] of secrets) {
    runStreamingCommand('wrangler', ['pages', 'secret', 'put', key, '--project-name', config.pagesProjectName], {
      cwd: config.rootDir,
      input: value,
      env: process.env,
    })
  }
}

function deployWorker(config: DeployConfig) {
  const tempDir = createTempDir()

  try {
    const secretsFile = writeTempJson(tempDir, 'worker-secrets.json', {
      TELEGRAM_BOT_TOKEN: config.telegramBotToken,
      GEMINI_API_KEY: config.geminiApiKey,
      ALLOWED_USER_ID: config.allowedUserId,
      DASHBOARD_PROXY_SECRET: config.dashboardProxySecret,
      DASHBOARD_URL: config.dashboardUrl,
    })

    const result = runCommand(
      'wrangler',
      ['deploy', '--minify', '--name', config.workerName, '--secrets-file', secretsFile],
      { cwd: config.rootDir, env: process.env },
    )

    const workerUrl = result.combined.match(/https:\/\/[^\s]+?\.workers\.dev/)?.[0]
    return workerUrl ?? inferWorkerApiBaseUrl(config.workerName, config.apiBaseUrl)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

async function configureTelegram(workerUrl: string, telegramBotToken: string) {
  const webhookEndpoint = `${workerUrl}/webhook/telegram`
  const secretToken = telegramBotToken.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 256)

  const webhookResponse = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/setWebhook?url=${webhookEndpoint}&secret_token=${secretToken}`,
  )
  const webhookPayload = (await webhookResponse.json()) as { ok?: boolean; description?: string }
  if (!webhookPayload.ok) {
    throw new Error(`Telegram webhook setup failed: ${webhookPayload.description ?? 'unknown error'}`)
  }

  const commandsResponse = await fetch(`https://api.telegram.org/bot${telegramBotToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commands: [
        { command: 'start', description: '啟動記帳助手' },
        { command: 'help', description: '顯示使用說明' },
        { command: 'summary', description: '查看本月摘要' },
        { command: 'categories', description: '列出分類' },
        { command: 'dashboard', description: '開啟 Dashboard' },
        { command: 'export', description: '匯出 CSV' },
      ],
    }),
  })
  const commandsPayload = (await commandsResponse.json()) as { ok?: boolean; description?: string }
  if (!commandsPayload.ok) {
    throw new Error(`Telegram command setup failed: ${commandsPayload.description ?? 'unknown error'}`)
  }
}

function deployDashboard(config: DeployConfig) {
  runStreamingCommand('npm', ['run', 'build'], { cwd: config.dashboardDir, env: process.env })
  runStreamingCommand(
    'wrangler',
    ['pages', 'deploy', 'dist', '--project-name', config.pagesProjectName, '--branch', config.pagesProductionBranch],
    {
      cwd: config.dashboardDir,
      env: process.env,
    },
  )
}

function printSummary(config: DeployConfig, workerUrl: string) {
  console.log('\nDeployment summary')
  console.log(`- target: ${config.target}`)
  console.log(`- worker: ${config.workerName}`)
  console.log(`- pages project: ${config.pagesProjectName}`)
  console.log(`- dashboard url: ${config.dashboardUrl}`)
  console.log(`- worker api url: ${workerUrl}`)
}

async function runProvision(config: DeployConfig) {
  logStage('provision', 'Initialize Terraform, check unmanaged resources, and provision durable Cloudflare resources')

  if (!existsSync(config.infraDir)) {
    fail(`IaC directory not found: ${config.infraDir}`)
  }

  await detectUnmanagedResources(config)

  const tempDir = createTempDir()
  try {
    // Phase 1: 建立基礎設施，不建立 Access（此時 dashboard domain 尚未確定）
    const tfvarsPath = writeTempJson(tempDir, 'deploy.auto.tfvars.json', buildTerraformVars(config, { manageDashboardAccess: false }))
    const terraformEnv = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: config.cloudflareApiToken,
    }

    runStreamingCommand('terraform', ['init', '-input=false'], {
      cwd: config.infraDir,
      env: terraformEnv,
    })

    const planPath = join(tempDir, 'deploy.tfplan')
    const planResult = runCommand(
      'terraform',
      ['plan', '-input=false', '-no-color', '-detailed-exitcode', `-var-file=${tfvarsPath}`, `-out=${planPath}`],
      {
        cwd: config.infraDir,
        env: terraformEnv,
        allowFailure: true,
      },
    )

    if (planResult.status === 1) {
      throw new Error(planResult.combined.trim() || 'Terraform plan failed')
    }

    if (config.planOnly) {
      console.log(planResult.stdout)
      return
    }

    if (planResult.status === 2 || config.applyOnly) {
      runStreamingCommand('terraform', ['apply', '-input=false', '-auto-approve', planPath], {
        cwd: config.infraDir,
        env: terraformEnv,
      })
    }

    // 讀取 Phase 1 outputs：取得 Cloudflare 分配的真實 dashboard domain
    const outputs = readTerraformOutputs(config)
    const d1DatabaseId = outputs.d1_database_id?.value ?? undefined
    const dashboardUrl = outputs.dashboard_url?.value ?? undefined

    if (d1DatabaseId) updateWranglerD1DatabaseId(d1DatabaseId)
    if (dashboardUrl) {
      config.dashboardUrl = dashboardUrl
      try { config.dashboardDomain = new URL(dashboardUrl).hostname } catch { /* keep original */ }
    }

    // Phase 2: 用真實 domain 建立 Cloudflare Access（若有設定 email 允許名單）
    if (config.manageDashboardAccess) {
      logStage('provision', `Setting up Cloudflare Access for ${config.dashboardDomain}`)
      const accessVarsPath = writeTempJson(tempDir, 'access.auto.tfvars.json', buildTerraformVars(config))
      runStreamingCommand(
        'terraform',
        ['apply', '-input=false', '-auto-approve', `-var-file=${accessVarsPath}`],
        { cwd: config.infraDir, env: terraformEnv },
      )
      const accessOutputs = readTerraformOutputs(config)
      const accessAud = accessOutputs.dashboard_access_aud?.value ?? undefined
      if (accessAud) config.cloudflareAccessAud = accessAud
    }

    syncLocalEnvFiles(config)
    syncRemoteSchema(config)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function runProvisionWorkflow(argv: string[]) {
  const options = parseCliArgs(argv)
  const config = loadConfig('provision', options)

  logStage('preflight', '檢查 provisioning 所需工具與設定')
  validateConfig(config)
  syncLocalEnvFiles(config)
  await runProvision(config)
  console.log('\nProvisioning complete')
}

export async function runDeployWorkflow(argv: string[]) {
  const options = parseCliArgs(argv)
  const config = loadConfig('deploy', options)

  logStage('preflight', '檢查 deploy / provision 共用設定')
  validateConfig(config)
  syncLocalEnvFiles(config)

  await runProvision(config)

  let workerUrl = inferWorkerApiBaseUrl(config.workerName, config.apiBaseUrl)

  logStage('deploy', '按固定順序部署 Worker / Dashboard')
  if (config.target === 'worker' || config.target === 'all') {
    workerUrl = deployWorker(config)
  }

  if (config.target === 'dashboard' || config.target === 'all') {
    const effectiveWorkerUrl =
      config.target === 'dashboard' ? inferWorkerApiBaseUrl(config.workerName, config.apiBaseUrl) : workerUrl
    config.apiBaseUrl = effectiveWorkerUrl
    syncPagesSecrets(config, effectiveWorkerUrl)
    syncLocalEnvFiles(config)
    deployDashboard(config)
  }

  logStage('post-deploy', '同步 Telegram 與部署摘要')
  if ((config.target === 'worker' || config.target === 'all') && config.telegramBotToken) {
    await configureTelegram(workerUrl, config.telegramBotToken)
  }

  printSummary(config, workerUrl)
}

export { buildResourcePlan, inferWorkerApiBaseUrl, renderAdoptGuidance }
