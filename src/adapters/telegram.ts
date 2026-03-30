import { InlineKeyboard, InputFile } from 'grammy'
import type { AccountingAction } from '../core/accounting'

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
