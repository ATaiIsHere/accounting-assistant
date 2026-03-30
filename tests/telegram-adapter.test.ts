import { describe, expect, it, vi } from 'vitest'
import { applyTelegramActions, resolveTelegramRequestAccount } from '../src/adapters/telegram'

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

describe('resolveTelegramRequestAccount', () => {
  it('resolves mapped telegram identities and falls back to the legacy allowed user bootstrap', async () => {
    const mappedDb = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(12),
      ensureLegacyTelegramAccount: vi.fn()
    }
    const legacyDb = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
      ensureLegacyTelegramAccount: vi.fn().mockResolvedValue(34)
    }

    await expect(
      resolveTelegramRequestAccount({
        chatType: 'private',
        externalUserId: '123',
        db: mappedDb as any,
        allowedUserId: '999'
      })
    ).resolves.toEqual({
      accountId: 12,
      externalUserId: '123'
    })

    await expect(
      resolveTelegramRequestAccount({
        chatType: 'private',
        externalUserId: '999',
        db: legacyDb as any,
        allowedUserId: '999'
      })
    ).resolves.toEqual({
      accountId: 34,
      externalUserId: '999'
    })

    expect(legacyDb.ensureLegacyTelegramAccount).toHaveBeenCalledWith('999')
  })

  it('rejects unsupported chats and unauthorized telegram identities', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
      ensureLegacyTelegramAccount: vi.fn()
    }

    await expect(
      resolveTelegramRequestAccount({
        chatType: 'group',
        externalUserId: '123',
        db: db as any,
        allowedUserId: '123'
      })
    ).resolves.toBeNull()

    await expect(
      resolveTelegramRequestAccount({
        chatType: 'private',
        externalUserId: '456',
        db: db as any,
        allowedUserId: '123'
      })
    ).resolves.toBeNull()

    expect(db.getAccountIdByIdentity).toHaveBeenCalledTimes(1)
    expect(db.ensureLegacyTelegramAccount).not.toHaveBeenCalled()
  })
})
