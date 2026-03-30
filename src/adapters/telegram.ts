import { InlineKeyboard, InputFile } from 'grammy'
import type { AccountingAction } from '../core/accounting'
import type { CoreDB } from '../core/db'

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
