import type { AccountingAction } from './accounting'
import type { BootstrapInviteConsumeResult, PairingCodeConsumeResult, CoreDB } from './db'

const PAIRING_CODE_TTL_MINUTES = 10

function getProviderLabel(provider: string): string {
  return provider === 'telegram' ? 'Telegram' : provider === 'line' ? 'LINE' : provider
}

function getPairCommandUsage(sourceProvider: string): string {
  return sourceProvider === 'telegram'
    ? '請使用 /pair <telegram|line> 產生配對碼。'
    : '請使用「配對 <telegram|line>」產生配對碼。'
}

function getBindInstruction(targetProvider: string, code: string): string {
  if (targetProvider === 'telegram') {
    return `請到 Telegram 私訊 bot 傳送：綁定 ${code}`
  }

  return `請到 LINE 官方帳號傳送：綁定 ${code}`
}

function buildPairingCode(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
}

export function normalizeSupportedProvider(rawValue: string | null | undefined): 'telegram' | 'line' | null {
  if (!rawValue) {
    return null
  }

  const normalized = rawValue.trim().toLowerCase()
  if (normalized === 'telegram' || normalized === 'tg') {
    return 'telegram'
  }
  if (normalized === 'line') {
    return 'line'
  }

  return null
}

export function parseBindCommand(text: string): { matched: boolean; code: string | null } {
  const normalized = text.trim()
  if (normalized === '綁定') {
    return { matched: true, code: null }
  }

  const match = normalized.match(/^綁定\s+(.+)$/u)
  if (!match) {
    return { matched: false, code: null }
  }

  return {
    matched: true,
    code: match[1].trim() || null
  }
}

export function buildBootstrapReplyActions(result: BootstrapInviteConsumeResult): AccountingAction[] {
  switch (result.status) {
    case 'created':
      return [
        {
          type: 'reply-text',
          text: '✅ 已建立你的私人帳本！\n現在可以直接輸入「午餐 120」開始記帳。\n之後如果想綁定其他通訊軟體，再使用配對功能即可。'
        }
      ]
    case 'identity-already-linked':
      return [
        {
          type: 'reply-text',
          text: 'ℹ️ 你已經建立過帳本了，可以直接開始記帳。'
        }
      ]
    case 'expired':
      return [
        {
          type: 'reply-text',
          text: '⌛ 邀請碼已過期，請向管理者索取新的建立帳本邀請碼。'
        }
      ]
    case 'used':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組邀請碼已被使用，請向管理者索取新的建立帳本邀請碼。'
        }
      ]
    case 'revoked':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組邀請碼已失效，請向管理者索取新的建立帳本邀請碼。'
        }
      ]
    case 'account-slug-conflict':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組邀請碼目前無法使用，請聯繫管理者重新建立。'
        }
      ]
    case 'invalid':
    default:
      return [
        {
          type: 'reply-text',
          text: '❌ 邀請碼無效，請向管理者確認或索取新的建立帳本邀請碼。'
        }
      ]
  }
}

export function buildPairingConsumeReplyActions(
  result: PairingCodeConsumeResult,
  targetProvider: string
): AccountingAction[] {
  const providerLabel = getProviderLabel(targetProvider)

  switch (result.status) {
    case 'linked':
      return [
        {
          type: 'reply-text',
          text: `✅ 已完成 ${providerLabel} 配對！\n現在可以在這個通訊軟體使用同一本帳本了。`
        }
      ]
    case 'identity-already-linked':
      return [
        {
          type: 'reply-text',
          text: `ℹ️ 這個 ${providerLabel} 帳號已經綁定過帳本，可以直接開始記帳。`
        }
      ]
    case 'provider-already-linked':
      return [
        {
          type: 'reply-text',
          text: `⚠️ 你的帳本已經綁定另一個 ${providerLabel} 帳號，目前不能直接覆蓋。請聯繫管理者處理。`
        }
      ]
    case 'expired':
      return [
        {
          type: 'reply-text',
          text: '⌛ 配對碼已過期，請回到已綁定的通訊軟體重新產生配對碼。'
        }
      ]
    case 'used':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組配對碼已被使用，請回到已綁定的通訊軟體重新產生配對碼。'
        }
      ]
    case 'revoked':
      return [
        {
          type: 'reply-text',
          text: '⚠️ 這組配對碼已失效，請回到已綁定的通訊軟體重新產生配對碼。'
        }
      ]
    case 'invalid':
    default:
      return [
        {
          type: 'reply-text',
          text: '❌ 配對碼無效，請回到已綁定的通訊軟體重新產生配對碼。'
        }
      ]
  }
}

export async function issuePairingCodeActions({
  accountId,
  sourceProvider,
  rawTargetProvider,
  db,
  now = new Date(),
  generateCode = buildPairingCode
}: {
  accountId: number
  sourceProvider: 'telegram' | 'line'
  rawTargetProvider: string | null | undefined
  db: Pick<CoreDB, 'getDirectIdentityForAccount' | 'issuePairingCode'>
  now?: Date
  generateCode?: () => string
}): Promise<AccountingAction[]> {
  const targetProvider = normalizeSupportedProvider(rawTargetProvider)
  if (!targetProvider) {
    return [{ type: 'reply-text', text: getPairCommandUsage(sourceProvider) }]
  }

  const existingTargetIdentity = await db.getDirectIdentityForAccount(accountId, targetProvider)
  if (existingTargetIdentity) {
    return [
      {
        type: 'reply-text',
        text: `ℹ️ 你的帳本已經綁定 ${getProviderLabel(targetProvider)}，不用再配對一次。`
      }
    ]
  }

  const code = generateCode()
  const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MINUTES * 60 * 1000).toISOString()
  await db.issuePairingCode({
    account_id: accountId,
    target_provider: targetProvider,
    requested_via_provider: sourceProvider,
    code,
    expires_at: expiresAt
  })

  return [
    {
      type: 'reply-text',
      text: `🔗 已建立 ${getProviderLabel(targetProvider)} 配對碼！\n配對碼：${code}\n有效時間：${PAIRING_CODE_TTL_MINUTES} 分鐘\n${getBindInstruction(targetProvider, code)}\n這組配對碼只能使用一次。`
    }
  ]
}

export async function consumePairingCodeActions({
  targetProvider,
  externalUserId,
  code,
  db
}: {
  targetProvider: 'telegram' | 'line'
  externalUserId: string
  code: string | null | undefined
  db: Pick<CoreDB, 'consumePairingCode'>
}): Promise<AccountingAction[]> {
  const trimmedCode = code?.trim()
  if (!trimmedCode) {
    return [
      {
        type: 'reply-text',
        text: '請使用「綁定 <配對碼>」完成帳本配對。'
      }
    ]
  }

  return buildPairingConsumeReplyActions(
    await db.consumePairingCode(targetProvider, externalUserId, trimmedCode),
    targetProvider
  )
}
