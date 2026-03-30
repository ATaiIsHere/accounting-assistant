import { describe, expect, it, vi } from 'vitest'
import { applyTelegramActions } from '../src/adapters/telegram'

describe('applyTelegramActions', () => {
  it('maps shared reply/edit/callback actions onto telegram context methods', async () => {
    const ctx = {
      reply: vi.fn().mockResolvedValue(undefined),
      replyWithDocument: vi.fn().mockResolvedValue(undefined),
      editMessageText: vi.fn().mockResolvedValue(undefined),
      answerCallbackQuery: vi.fn().mockResolvedValue(undefined)
    }

    await applyTelegramActions(ctx, [
      { type: 'reply-text', text: 'hello', parseMode: 'Markdown' },
      {
        type: 'reply-inline-options',
        text: 'choose one',
        options: [[{ text: 'a', data: 'pick:a' }]]
      },
      {
        type: 'reply-document',
        filename: 'expenses.csv',
        data: new Uint8Array([1, 2, 3])
      },
      { type: 'edit-text', text: 'edited' },
      { type: 'answer-callback', text: 'done', showAlert: true }
    ])

    expect(ctx.reply).toHaveBeenNthCalledWith(1, 'hello', { parse_mode: 'Markdown' })
    expect(ctx.reply).toHaveBeenNthCalledWith(
      2,
      'choose one',
      expect.objectContaining({
        reply_markup: expect.anything()
      })
    )
    expect(ctx.replyWithDocument).toHaveBeenCalledTimes(1)
    expect(ctx.editMessageText).toHaveBeenCalledWith('edited')
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({
      text: 'done',
      show_alert: true
    })
  })
})
