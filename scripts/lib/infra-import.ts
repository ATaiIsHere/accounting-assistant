import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export type InfraConfig = {
  rootDir: string
  infraDir: string
  cloudflareApiToken?: string
  cloudflareAccountId?: string
  workerName: string
  d1DatabaseName: string
  pagesProjectName: string
  pagesProductionBranch: string
  dashboardDomain: string
  dashboardAccessApplicationName: string
  dashboardAccessAllowedEmails: string[]
  dashboardAccessAllowedEmailDomains: string[]
}

export type TeardownTarget = 'dashboard' | 'pages' | 'access'

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const INFRA_DIR = join(ROOT_DIR, 'infra', 'terraform')
const ROOT_ENV_PATH = join(ROOT_DIR, '.dev.vars')

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

function writeTempJson(dirPath: string, fileName: string, value: unknown) {
  const filePath = join(dirPath, fileName)
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  return filePath
}

function resolveWranglerBin(rootDir: string) {
  const localCmd = join(rootDir, 'node_modules', '.bin', 'wrangler.cmd')
  const localBin = join(rootDir, 'node_modules', '.bin', 'wrangler')
  if (process.platform === 'win32' && existsSync(localCmd)) return { bin: localCmd, useCmd: true }
  if (existsSync(localBin)) return { bin: localBin, useCmd: false }
  return { bin: 'wrangler', useCmd: false }
}

function runStreamingCommand(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    encoding: 'utf-8',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }
}

function runWranglerCommand(args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const { bin, useCmd } = resolveWranglerBin(cwd)
  if (useCmd) {
    const quoted = [bin, ...args].map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', quoted], {
      cwd,
      env,
      stdio: 'inherit',
      encoding: 'utf-8',
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`wrangler ${args.join(' ')} failed`)
  } else {
    runStreamingCommand(bin, args, env, cwd)
  }
}

function createTempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix))
}

function buildTerraformVars(
  config: InfraConfig,
  overrides?: {
    manageD1?: boolean
    managePagesProject?: boolean
    manageDashboardAccess?: boolean
  },
) {
  return {
    cloudflare_account_id: config.cloudflareAccountId,
    manage_d1: overrides?.manageD1 ?? true,
    d1_database_name: config.d1DatabaseName,
    manage_pages_project: overrides?.managePagesProject ?? true,
    pages_project_name: config.pagesProjectName,
    pages_production_branch: config.pagesProductionBranch,
    manage_dashboard_access: overrides?.manageDashboardAccess ?? true,
    dashboard_domain: config.dashboardDomain,
    dashboard_access_application_name: config.dashboardAccessApplicationName,
    dashboard_access_allowed_emails: config.dashboardAccessAllowedEmails,
    dashboard_access_allowed_email_domains: config.dashboardAccessAllowedEmailDomains,
    dashboard_access_session_duration: '24h',
  }
}

function ensureConfigReady(config: InfraConfig) {
  const missing: string[] = []

  if (!existsSync(ROOT_ENV_PATH) && !process.env.CLOUDFLARE_API_TOKEN) {
    missing.push('.dev.vars or CLOUDFLARE_API_TOKEN')
  }
  if (!config.cloudflareApiToken) missing.push('CLOUDFLARE_API_TOKEN')
  if (!config.cloudflareAccountId) missing.push('CLOUDFLARE_ACCOUNT_ID')
  if (!existsSync(config.infraDir)) missing.push(`infra directory not found: ${config.infraDir}`)

  if (missing.length > 0) {
    throw new Error(['Infrastructure preflight failed:', ...missing.map((item) => `- ${item}`)].join('\n'))
  }
}

export function resolveD1ImportId(raw: string, accountId: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('Please provide a D1 database ID or a full account_id/database_id import ID.')
  }

  return trimmed.includes('/') ? trimmed : `${accountId}/${trimmed}`
}

export function loadInfraConfig(rootDir = ROOT_DIR): InfraConfig {
  const rootEnv = parseEnvFile(join(rootDir, '.dev.vars'))
  const workerName =
    process.env.WORKER_NAME?.trim() || parseWranglerName(join(rootDir, 'wrangler.jsonc')) || 'accounting-assistant'
  const d1DatabaseName =
    process.env.D1_DATABASE_NAME?.trim() || parseFirstD1DatabaseName(join(rootDir, 'wrangler.jsonc')) || 'accounting-db'
  const pagesProjectName =
    process.env.PAGES_PROJECT_NAME?.trim() ||
    parseTomlName(join(rootDir, 'dashboard', 'wrangler.toml')) ||
    'accounting-dashboard'
  const pagesProductionBranch = process.env.PAGES_PRODUCTION_BRANCH?.trim() || rootEnv.PAGES_PRODUCTION_BRANCH || 'main'
  const dashboardDomain = process.env.DASHBOARD_DOMAIN?.trim() || rootEnv.DASHBOARD_DOMAIN || `${pagesProjectName}.pages.dev`

  return {
    rootDir,
    infraDir: join(rootDir, 'infra', 'terraform'),
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || rootEnv.CLOUDFLARE_API_TOKEN,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || rootEnv.CLOUDFLARE_ACCOUNT_ID,
    workerName,
    d1DatabaseName,
    pagesProjectName,
    pagesProductionBranch,
    dashboardDomain,
    dashboardAccessApplicationName: 'Accounting Assistant Dashboard',
    dashboardAccessAllowedEmails: parseCsv(
      process.env.CLOUDFLARE_ACCESS_ALLOWED_EMAILS || rootEnv.CLOUDFLARE_ACCESS_ALLOWED_EMAILS,
    ),
    dashboardAccessAllowedEmailDomains: parseCsv(
      process.env.CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS || rootEnv.CLOUDFLARE_ACCESS_ALLOWED_EMAIL_DOMAINS,
    ),
  }
}

export async function runD1ImportWorkflow(argv: string[]) {
  const firstArg = argv.find((arg) => !arg.startsWith('--'))

  if (!firstArg || argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: npm run infra:import:d1 -- <database_id | account_id/database_id>')
    return
  }

  const config = loadInfraConfig()
  ensureConfigReady(config)

  const importId = resolveD1ImportId(firstArg, config.cloudflareAccountId!)
  const tempDir = createTempDir('accounting-assistant-import-')

  try {
    const tfvarsPath = writeTempJson(
      tempDir,
      'import.auto.tfvars.json',
      buildTerraformVars(config, {
        manageD1: true,
        managePagesProject: false,
        manageDashboardAccess: false,
      }),
    )

    const terraformEnv = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: config.cloudflareApiToken,
    }

    console.log(`[infra:import:d1] importing ${importId}`)
    await runStreamingCommand('terraform', ['init', '-input=false'], terraformEnv, config.infraDir)
    await runStreamingCommand(
      'terraform',
      ['import', '-input=false', `-var-file=${tfvarsPath}`, 'cloudflare_d1_database.primary[0]', importId],
      terraformEnv,
      config.infraDir,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function runInfraTeardownWorkflow(argv: string[]) {
  const target = (argv.find((arg) => !arg.startsWith('--')) ?? 'dashboard') as TeardownTarget

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: npm run infra:destroy -- [dashboard|pages|access]')
    return
  }

  if (!['dashboard', 'pages', 'access'].includes(target)) {
    throw new Error(`Unsupported teardown target: ${target}`)
  }

  const config = loadInfraConfig()
  ensureConfigReady(config)

  const tempDir = createTempDir('accounting-assistant-destroy-')
  try {
    const tfvarsPath = writeTempJson(
      tempDir,
      'destroy.auto.tfvars.json',
      buildTerraformVars(config, {
        manageD1: true,
        managePagesProject: target === 'access',
        manageDashboardAccess: target === 'pages',
      }),
    )

    const terraformEnv = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: config.cloudflareApiToken,
    }

    console.log(`[infra:destroy] target=${target}`)
    console.log('[infra:destroy] D1 is retained and protected from deletion.')
    runStreamingCommand('terraform', ['init', '-input=false'], terraformEnv, config.infraDir)
    runStreamingCommand(
      'terraform',
      ['apply', '-input=false', '-auto-approve', `-var-file=${tfvarsPath}`],
      terraformEnv,
      config.infraDir,
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }

  // 刪除 Cloudflare Worker（由 wrangler 管理，不在 Terraform 內）
  console.log(`[infra:destroy] Deleting Worker: ${config.workerName}`)
  try {
    runWranglerCommand(['delete', '--name', config.workerName, '--force'], process.env, config.rootDir)
    console.log(`[infra:destroy] Worker "${config.workerName}" deleted.`)
  } catch {
    console.warn(`[infra:destroy] Worker deletion failed or already gone — skipping.`)
  }
}
