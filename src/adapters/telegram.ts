import { InlineKeyboard, InputFile } from 'grammy'
import type { AccountingAction } from '../core/accounting'
import type { CoreDB } from '../core/db'
import {
  buildBootstrapReplyActions,
  buildPairingConsumeReplyActions,
  consumePairingCodeActions,
  issuePairingCodeActions,
  parseBindCommand
} from '../core/onboarding'

export async function resolveTelegramRequestAccount({
  chatType,
  externalUserId,
  db,
  allowedUserId
}: {
  chatType?: string | null
  externalUserId?: string | null
  db: Pick<CoreDB, 'getAccountIdByIdentity' | 'ensureLegacyTelegramAccount'>
  allowedUserId?: string
}): Promise<{ accountId: number; externalUserId: string } | null> {
  if (chatType && chatType !== 'private') {
    return null
  }

  if (!externalUserId) {
    return null
  }

  let accountId = await db.getAccountIdByIdentity('telegram', externalUserId)
  if (!accountId && allowedUserId && externalUserId === allowedUserId) {
    accountId = await db.ensureLegacyTelegramAccount(externalUserId)
  }

  if (!accountId) {
    return null
  }

  return {
    accountId,
    externalUserId
  }
}

export async function handleTelegramBootstrapCommand({
  chatType,
  externalUserId,
  bootstrapCode,
  db,
  allowedUserId
}: {
  chatType?: string | null
  externalUserId?: string | null
  bootstrapCode?: string | null
  db: Pick<CoreDB, 'consumeBootstrapInvite' | 'getAccountIdByIdentity' | 'ensureLegacyTelegramAccount'>
  allowedUserId?: string
}): Promise<AccountingAction[] | null> {
  if (chatType && chatType !== 'private') {
    return null
  }

  if (!externalUserId) {
    return null
  }

  const trimmedCode = bootstrapCode?.trim()
  if (!trimmedCode) {
    return [
      {
        type: 'reply-text',
        text: '請使用 /create <邀請碼> 建立你的帳本。'
      }
    ]
  }

  const existingAccount = await resolveTelegramRequestAccount({
    chatType,
    externalUserId,
    db,
    allowedUserId
  })
  if (existingAccount) {
    return buildBootstrapReplyActions({
      status: 'identity-already-linked',
      account_id: existingAccount.accountId
    })
  }

  return buildBootstrapReplyActions(
    await db.consumeBootstrapInvite('telegram', externalUserId, trimmedCode)
  )
}

export async function handleTelegramPairCommand({
  chatType,
  accountId,
  rawTargetProvider,
  db
}: {
  chatType?: string | null
  accountId?: number | null
  rawTargetProvider?: string | null
  db: Pick<CoreDB, 'getDirectIdentityForAccount' | 'issuePairingCode'>
}): Promise<AccountingAction[] | null> {
  if (chatType && chatType !== 'private') {
    return null
  }

  if (!accountId) {
    return null
  }

  return issuePairingCodeActions({
    accountId,
    sourceProvider: 'telegram',
    rawTargetProvider,
    db
  })
}

export async function handleTelegramBindCommand({
  chatType,
  externalUserId,
  text,
  db,
  allowedUserId
}: {
  chatType?: string | null
  externalUserId?: string | null
  text?: string | null
  db: Pick<CoreDB, 'consumePairingCode' | 'getAccountIdByIdentity' | 'ensureLegacyTelegramAccount'>
  allowedUserId?: string
}): Promise<AccountingAction[] | null> {
  if (chatType && chatType !== 'private') {
    return null
  }

  if (!externalUserId || !text) {
    return null
  }

  const bindCommand = parseBindCommand(text)
  if (!bindCommand.matched) {
    return null
  }

  const existingAccount = await resolveTelegramRequestAccount({
    chatType,
    externalUserId,
    db,
    allowedUserId
  })
  if (existingAccount) {
    return buildPairingConsumeReplyActions(
      {
        status: 'identity-already-linked',
        account_id: existingAccount.accountId
      },
      'telegram'
    )
  }

  return consumePairingCodeActions({
    targetProvider: 'telegram',
    externalUserId,
    code: bindCommand.code,
    db
  })
}

export async function applyTelegramActions(ctx: any, actions: AccountingAction[]) {
  for (const action of actions) {
    if (action.type === 'reply-text') {
      await ctx.reply(action.text, action.parseMode ? { parse_mode: action.parseMode } : undefined)
      continue
    }

    if (action.type === 'reply-document') {
      await ctx.replyWithDocument(new InputFile(action.data, action.filename))
      continue
    }

    if (action.type === 'reply-inline-options') {
      const keyboard = new InlineKeyboard()
      action.options.forEach((row) => {
        row.forEach((button) => {
          keyboard.text(button.text, button.data)
        })
        keyboard.row()
      })
      await ctx.reply(action.text, { reply_markup: keyboard })
      continue
    }

    if (action.type === 'edit-text') {
      await ctx.editMessageText(action.text)
      continue
    }

    if (action.type === 'answer-callback') {
      await ctx.answerCallbackQuery(
        action.text || action.showAlert
          ? {
              text: action.text,
              show_alert: action.showAlert
            }
          : undefined
      )
    }
  }
}
