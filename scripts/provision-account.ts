import { execFileSync, execSync } from 'child_process';
import prompts from 'prompts';

type TargetMode = 'local' | 'remote';
type EnvName = 'production' | 'staging';

type CliOptions = {
  targetMode?: TargetMode;
  env?: EnvName;
  accountSlug?: string;
  displayName?: string;
  status?: string;
  telegramUserId?: string;
  lineUserId?: string;
  dryRun: boolean;
};

type ProvisionAnswers = {
  targetMode: TargetMode;
  env: EnvName;
  accountSlug: string;
  displayName: string;
  status: string;
  telegramUserId?: string;
  lineUserId?: string;
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
      case '--status':
        if (!next) throw new Error(`${arg} requires a value`);
        options.status = next;
        i++;
        break;
      case '--telegram-user-id':
        if (!next) throw new Error(`${arg} requires a value`);
        options.telegramUserId = next;
        i++;
        break;
      case '--line-user-id':
        if (!next) throw new Error(`${arg} requires a value`);
        options.lineUserId = next;
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

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function sanitizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isTelegramNumericUserId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function buildIdentityUpsertSql(accountSlug: string, provider: string, externalUserId: string): string {
  const slug = escapeSql(accountSlug);
  const externalId = escapeSql(externalUserId.trim());
  const providerName = escapeSql(provider);

  return `
INSERT INTO account_identities (
    account_id,
    provider,
    external_user_id,
    chat_scope,
    is_active
)
SELECT
    id,
    '${providerName}',
    '${externalId}',
    'direct',
    1
FROM accounts
WHERE slug = '${slug}'
ON CONFLICT(provider, external_user_id) DO UPDATE SET
    chat_scope = excluded.chat_scope,
    is_active = excluded.is_active
WHERE account_id = excluded.account_id;`.trim();
}

function buildProvisionSql(answers: ProvisionAnswers): { statements: string[]; sql: string } {
  const slug = escapeSql(answers.accountSlug);
  const displayName = escapeSql(answers.displayName);
  const status = escapeSql(answers.status);

  const statements: string[] = [
    `
INSERT INTO accounts (slug, display_name, status)
VALUES ('${slug}', '${displayName}', '${status}')
ON CONFLICT(slug) DO UPDATE SET
    display_name = excluded.display_name,
    status = excluded.status;`.trim()
  ];

  if (answers.telegramUserId) {
    statements.push(buildIdentityUpsertSql(answers.accountSlug, 'telegram', answers.telegramUserId));
  }

  if (answers.lineUserId) {
    statements.push(buildIdentityUpsertSql(answers.accountSlug, 'line', answers.lineUserId));
  }

  statements.push(`
SELECT
    id,
    slug,
    display_name,
    status
FROM accounts
WHERE slug = '${slug}';`.trim());
  statements.push(`
SELECT
    ai.provider,
    ai.external_user_id,
    ai.chat_scope,
    ai.is_active
FROM account_identities ai
JOIN accounts a ON a.id = ai.account_id
WHERE a.slug = '${slug}'
ORDER BY ai.provider ASC, ai.external_user_id ASC;`.trim());

  return {
    statements,
    sql: `${statements.join('\n\n')}\n`
  };
}

function hasCommand(command: string): boolean {
  try {
    execSync(`command -v ${command}`, {
      encoding: 'utf-8',
      stdio: 'ignore',
      shell: '/bin/zsh'
    });
    return true;
  } catch {
    return false;
  }
}

function getWranglerCommandPrefix(): string[] {
  if (hasCommand('bunx')) {
    return ['bunx', 'wrangler'];
  }

  if (hasCommand('npx')) {
    return ['npx', 'wrangler'];
  }

  if (hasCommand('wrangler')) {
    return ['wrangler'];
  }

  throw new Error('找不到 wrangler 執行方式，請先安裝 bunx、npx 或 wrangler。');
}

function buildWranglerCommandArgs(sql: string, answers: ProvisionAnswers): string[] {
  const args = [...getWranglerCommandPrefix(), 'd1', 'execute', 'DB'];

  if (answers.targetMode === 'remote') {
    args.push('--remote');
  } else {
    args.push('--local');
  }

  if (answers.env === 'staging') {
    args.push('-e', 'staging');
  }

  args.push('--command', sql.trim());

  return args;
}

function runWranglerStatement(sql: string, answers: ProvisionAnswers): string {
  const commandArgs = buildWranglerCommandArgs(sql, answers);
  return runWranglerSql(commandArgs);
}

function runWranglerStatements(statements: string[], answers: ProvisionAnswers): string {
  return statements.map((statement) => runWranglerStatement(statement, answers)).join('\n');
}

async function collectAnswers(options: CliOptions): Promise<ProvisionAnswers> {
  const hasCliIdentity = options.telegramUserId !== undefined || options.lineUserId !== undefined;

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
        message: '請輸入 account slug（例如 amy 或 shao-family）:',
        validate: (value: string) => sanitizeSlug(value).length > 0 || 'account slug 不能為空'
      },
      {
        type: options.displayName ? null : 'text',
        name: 'displayName',
        message: '請輸入顯示名稱:',
        validate: (value: string) => value.trim().length > 0 || 'display name 不能為空'
      },
      {
        type: hasCliIdentity || options.telegramUserId ? null : 'text',
        name: 'telegramUserId',
        message: 'Telegram 數字 user id（可留空）:'
      },
      {
        type: hasCliIdentity || options.lineUserId ? null : 'text',
        name: 'lineUserId',
        message: 'LINE user id（可留空）:'
      }
    ],
    {
      onCancel: () => {
        throw new Error('Provisioning cancelled');
      }
    }
  );

  const targetMode = options.targetMode ?? answers.targetMode ?? 'remote';
  const env = options.env ?? answers.env ?? 'production';
  const accountSlug = sanitizeSlug(options.accountSlug ?? answers.accountSlug ?? '');
  const displayName = (options.displayName ?? answers.displayName ?? '').trim();
  const status = (options.status ?? 'active').trim();
  const telegramUserId = (options.telegramUserId ?? answers.telegramUserId ?? '').trim() || undefined;
  const lineUserId = (options.lineUserId ?? answers.lineUserId ?? '').trim() || undefined;

  if (!accountSlug) {
    throw new Error('account slug 不能為空');
  }

  if (!displayName) {
    throw new Error('display name 不能為空');
  }

  if (!telegramUserId && !lineUserId) {
    throw new Error('至少要提供一個 Telegram 或 LINE identity');
  }

  if (status !== 'active' && status !== 'inactive') {
    throw new Error(`Unsupported status: ${status}`);
  }

  if (telegramUserId && !isTelegramNumericUserId(telegramUserId)) {
    throw new Error('telegram-user-id 必須是 Telegram 的數字 user id，不是 username。');
  }

  return {
    targetMode,
    env,
    accountSlug,
    displayName,
    status,
    telegramUserId,
    lineUserId
  };
}

function runWranglerSql(commandArgs: string[]): string {
  const [command, ...args] = commandArgs;

  try {
    return execFileSync(command, args, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
  } catch (error: any) {
    const output = [error.stdout?.toString(), error.stderr?.toString()].filter(Boolean).join('\n');

    if (output.includes('no such table: accounts') || output.includes('no such table: account_identities')) {
      throw new Error(
        '找不到 accounts/account_identities 資料表。請先套用 multi-account migration，再執行 provision-account。'
      );
    }

    if (output.includes('UNIQUE constraint failed: account_identities.provider, account_identities.external_user_id')) {
      throw new Error(
        '指定的 provider identity 已經綁定到其他 account。為避免誤綁，腳本已停止，請先檢查 account_identities。'
      );
    }

    throw new Error(output || 'wrangler d1 execute failed');
  }
}

async function run() {
  console.log('🧩 開始建立或更新 multi-account 帳號綁定...\n');

  try {
    const options = parseArgs(process.argv.slice(2));
    const answers = await collectAnswers(options);
    const { statements, sql } = buildProvisionSql(answers);

    console.log(`📍 目標：${answers.targetMode} / ${answers.env}`);
    console.log(`👤 account: ${answers.accountSlug} (${answers.displayName})`);
    console.log(`🔗 telegram: ${answers.telegramUserId || '(none)'}`);
    console.log(`🔗 line: ${answers.lineUserId || '(none)'}\n`);

    if (options.dryRun) {
      console.log('--- SQL PREVIEW ---');
      console.log(sql);
      return;
    }

    const output = runWranglerStatements(statements, answers);
    console.log('✅ Provisioning 完成！\n');
    console.log(output);
  } catch (error) {
    console.error('❌ Provisioning 失敗:', error);
    process.exitCode = 1;
  }
}

run();
