import { randomUUID, createHash } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import prompts from 'prompts';

type TargetMode = 'local' | 'remote';
type EnvName = 'production' | 'staging';

type CliOptions = {
  targetMode?: TargetMode;
  env?: EnvName;
  accountSlug?: string;
  displayName?: string;
  code?: string;
  ttlHours?: number;
  dryRun: boolean;
};

type InviteAnswers = {
  targetMode: TargetMode;
  env: EnvName;
  accountSlug: string;
  displayName: string;
  code: string;
  ttlHours: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--remote':
        options.targetMode = 'remote';
        break;
      case '--local':
        options.targetMode = 'local';
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--env':
      case '-e':
        if (!next) throw new Error(`${arg} requires a value`);
        if (next !== 'production' && next !== 'staging') {
          throw new Error(`Unsupported env: ${next}`);
        }
        options.env = next;
        i++;
        break;
      case '--account-slug':
        if (!next) throw new Error(`${arg} requires a value`);
        options.accountSlug = next;
        i++;
        break;
      case '--display-name':
        if (!next) throw new Error(`${arg} requires a value`);
        options.displayName = next;
        i++;
        break;
      case '--code':
        if (!next) throw new Error(`${arg} requires a value`);
        options.code = next;
        i++;
        break;
      case '--ttl-hours':
        if (!next) throw new Error(`${arg} requires a value`);
        options.ttlHours = Number.parseInt(next, 10);
        i++;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  return options;
}

function sanitizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) {
    throw new Error('invite code 不能為空');
  }

  return normalized;
}

function formatInviteCode(value: string): string {
  const normalized = normalizeCode(value);
  if (normalized.length <= 5) {
    return normalized;
  }

  return `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
}

function generateInviteCode(): string {
  return formatInviteCode(randomUUID().replace(/-/g, '').slice(0, 10));
}

function hashCode(value: string): string {
  return createHash('sha256').update(normalizeCode(value)).digest('hex');
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function buildInviteSql(answers: InviteAnswers): { sql: string; expiresAt: string; codeHash: string } {
  const expiresAt = new Date(Date.now() + answers.ttlHours * 60 * 60 * 1000).toISOString();
  const codeHash = hashCode(answers.code);
  const slug = escapeSql(answers.accountSlug);
  const displayName = escapeSql(answers.displayName);
  const escapedHash = escapeSql(codeHash);
  const escapedExpiresAt = escapeSql(expiresAt);

  const statements = [
    'BEGIN TRANSACTION;',
    `
UPDATE account_bootstrap_codes
SET status = 'revoked'
WHERE account_slug = '${slug}'
  AND status = 'pending';`.trim(),
    `
INSERT INTO account_bootstrap_codes (
    account_slug,
    display_name,
    code_hash,
    status,
    expires_at
) VALUES (
    '${slug}',
    '${displayName}',
    '${escapedHash}',
    'pending',
    '${escapedExpiresAt}'
);`.trim(),
    'COMMIT;',
    `
SELECT
    account_slug,
    display_name,
    status,
    expires_at,
    created_at
FROM account_bootstrap_codes
WHERE code_hash = '${escapedHash}'
ORDER BY id DESC
LIMIT 1;`.trim()
  ];

  return {
    sql: `${statements.join('\n\n')}\n`,
    expiresAt,
    codeHash
  };
}

function buildWranglerCommand(sqlFilePath: string, answers: InviteAnswers): string {
  const args = ['npx', 'wrangler', 'd1', 'execute', 'DB'];

  if (answers.targetMode === 'remote') {
    args.push('--remote');
  } else {
    args.push('--local');
  }

  if (answers.env === 'staging') {
    args.push('-e', 'staging');
  }

  args.push(`--file=${sqlFilePath}`);

  return args.join(' ');
}

async function collectAnswers(options: CliOptions): Promise<InviteAnswers> {
  const answers = await prompts(
    [
      {
        type: options.targetMode ? null : 'select',
        name: 'targetMode',
        message: '要操作哪個 D1 目標？',
        choices: [
          { title: 'remote (Recommended)', value: 'remote' },
          { title: 'local', value: 'local' }
        ],
        initial: 0
      },
      {
        type: options.env ? null : 'select',
        name: 'env',
        message: '使用哪個 Wrangler 環境？',
        choices: [
          { title: 'production (預設 DB binding)', value: 'production' },
          { title: 'staging', value: 'staging' }
        ],
        initial: 0
      },
      {
        type: options.accountSlug ? null : 'text',
        name: 'accountSlug',
        message: '請輸入 account slug（例如 amy 或 account-a）:',
        validate: (value: string) => sanitizeSlug(value).length > 0 || 'account slug 不能為空'
      },
      {
        type: options.displayName ? null : 'text',
        name: 'displayName',
        message: '請輸入顯示名稱:',
        validate: (value: string) => value.trim().length > 0 || 'display name 不能為空'
      },
      {
        type: options.code ? null : 'text',
        name: 'code',
        message: '自訂邀請碼（可留空自動產生）:'
      },
      {
        type: options.ttlHours !== undefined ? null : 'number',
        name: 'ttlHours',
        message: '邀請碼有效時間（小時，預設 24）:',
        initial: 24
      }
    ],
    {
      onCancel: () => {
        throw new Error('Bootstrap invite creation cancelled');
      }
    }
  );

  const accountSlug = sanitizeSlug(options.accountSlug ?? answers.accountSlug ?? '');
  const displayName = (options.displayName ?? answers.displayName ?? '').trim();
  const ttlHours = options.ttlHours ?? answers.ttlHours ?? 24;
  const rawCode = (options.code ?? answers.code ?? '').trim();
  const code = rawCode ? formatInviteCode(rawCode) : generateInviteCode();

  if (!accountSlug) {
    throw new Error('account slug 不能為空');
  }

  if (!displayName) {
    throw new Error('display name 不能為空');
  }

  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error('ttl-hours 必須是大於 0 的整數');
  }

  return {
    targetMode: options.targetMode ?? answers.targetMode ?? 'remote',
    env: options.env ?? answers.env ?? 'production',
    accountSlug,
    displayName,
    code,
    ttlHours
  };
}

function runWranglerSql(command: string): string {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
  } catch (error: any) {
    const output = [error.stdout?.toString(), error.stderr?.toString()].filter(Boolean).join('\n');

    if (output.includes('no such table: account_bootstrap_codes')) {
      throw new Error(
        '找不到 account_bootstrap_codes 資料表。請先套用 bootstrap/pairing migration，再執行 create-bootstrap-invite。'
      );
    }

    throw new Error(output || 'wrangler d1 execute failed');
  }
}

async function run() {
  console.log('🎟️ 開始建立 bootstrap invite...\n');

  try {
    const options = parseArgs(process.argv.slice(2));
    const answers = await collectAnswers(options);
    const { sql, expiresAt } = buildInviteSql(answers);

    console.log(`📍 目標：${answers.targetMode} / ${answers.env}`);
    console.log(`👤 account: ${answers.accountSlug} (${answers.displayName})`);
    console.log(`🎫 invite code: ${answers.code}`);
    console.log(`⏳ expires at: ${expiresAt}\n`);

    if (options.dryRun) {
      console.log('--- SQL PREVIEW ---');
      console.log(sql);
      return;
    }

    const tempFilePath = path.join(os.tmpdir(), `create-bootstrap-invite-${Date.now()}.sql`);
    fs.writeFileSync(tempFilePath, sql);

    try {
      const command = buildWranglerCommand(tempFilePath, answers);
      const output = runWranglerSql(command);
      console.log('✅ Bootstrap invite 建立完成！\n');
      console.log(`請把這組邀請碼提供給使用者：${answers.code}\n`);
      console.log(output);
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  } catch (error) {
    console.error('❌ Bootstrap invite 建立失敗:', error);
    process.exitCode = 1;
  }
}

run();
