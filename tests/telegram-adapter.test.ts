import { describe, expect, it, vi } from 'vitest'
import {
  applyTelegramActions,
  handleTelegramBindCommand,
  handleTelegramBootstrapCommand,
  handleTelegramPairCommand,
  resolveTelegramRequestAccount
} from '../src/adapters/telegram'

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

describe('handleTelegramBootstrapCommand', () => {
  it('returns usage text when the invite code is missing', async () => {
    const actions = await handleTelegramBootstrapCommand({
      chatType: 'private',
      externalUserId: '123',
      bootstrapCode: '',
      db: {
        getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
        ensureLegacyTelegramAccount: vi.fn(),
        consumeBootstrapInvite: vi.fn()
      } as any
    })

    expect(actions).toEqual([
      {
        type: 'reply-text',
        text: '請使用 /create <邀請碼> 建立你的帳本。'
      }
    ])
  })

  it('creates a telegram account from a valid bootstrap invite', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
      ensureLegacyTelegramAccount: vi.fn(),
      consumeBootstrapInvite: vi.fn().mockResolvedValue({
        status: 'created',
        account_id: 42
      })
    }

    const actions = await handleTelegramBootstrapCommand({
      chatType: 'private',
      externalUserId: '123',
      bootstrapCode: 'INV-123',
      db: db as any
    })

    expect(db.consumeBootstrapInvite).toHaveBeenCalledWith('telegram', '123', 'INV-123')
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'reply-text',
        text: expect.stringContaining('已建立你的私人帳本')
      })
    ])
  })

  it('treats an already-linked telegram identity as initialized before consuming an invite', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
      ensureLegacyTelegramAccount: vi.fn().mockResolvedValue(34),
      consumeBootstrapInvite: vi.fn()
    }

    const actions = await handleTelegramBootstrapCommand({
      chatType: 'private',
      externalUserId: '999',
      bootstrapCode: 'INV-999',
      db: db as any,
      allowedUserId: '999'
    })

    expect(db.ensureLegacyTelegramAccount).toHaveBeenCalledWith('999')
    expect(db.consumeBootstrapInvite).not.toHaveBeenCalled()
    expect(actions).toEqual([
      {
        type: 'reply-text',
        text: 'ℹ️ 你已經建立過帳本了，可以直接開始記帳。'
      }
    ])
  })
})

describe('handleTelegramPairCommand', () => {
  it('issues a pairing code for a supported target provider', async () => {
    const db = {
      getDirectIdentityForAccount: vi.fn().mockResolvedValue(null),
      issuePairingCode: vi.fn().mockResolvedValue(undefined)
    }

    const actions = await handleTelegramPairCommand({
      chatType: 'private',
      accountId: 12,
      rawTargetProvider: 'line',
      db: db as any
    })

    expect(db.getDirectIdentityForAccount).toHaveBeenCalledWith(12, 'line')
    expect(db.issuePairingCode).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 12,
        target_provider: 'line',
        requested_via_provider: 'telegram',
        code: expect.any(String),
        expires_at: expect.any(String)
      })
    )
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'reply-text',
        text: expect.stringContaining('已建立 LINE 配對碼')
      })
    ])
  })

  it('returns usage text or already-linked text for unsupported or duplicate targets', async () => {
    const usageActions = await handleTelegramPairCommand({
      chatType: 'private',
      accountId: 12,
      rawTargetProvider: '',
      db: {
        getDirectIdentityForAccount: vi.fn(),
        issuePairingCode: vi.fn()
      } as any
    })

    expect(usageActions).toEqual([
      {
        type: 'reply-text',
        text: '請使用 /pair <telegram|line> 產生配對碼。'
      }
    ])

    const duplicateActions = await handleTelegramPairCommand({
      chatType: 'private',
      accountId: 12,
      rawTargetProvider: 'line',
      db: {
        getDirectIdentityForAccount: vi.fn().mockResolvedValue({ id: 1 }),
        issuePairingCode: vi.fn()
      } as any
    })

    expect(duplicateActions).toEqual([
      {
        type: 'reply-text',
        text: 'ℹ️ 你的帳本已經綁定 LINE，不用再配對一次。'
      }
    ])
  })
})

describe('handleTelegramBindCommand', () => {
  it('binds an unlinked telegram identity with a valid pairing code', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
      ensureLegacyTelegramAccount: vi.fn(),
      consumePairingCode: vi.fn().mockResolvedValue({
        status: 'linked',
        account_id: 55
      })
    }

    const actions = await handleTelegramBindCommand({
      chatType: 'private',
      externalUserId: 'tg-new',
      text: '綁定 PAIR-123',
      db: db as any
    })

    expect(db.consumePairingCode).toHaveBeenCalledWith('telegram', 'tg-new', 'PAIR-123')
    expect(actions).toEqual([
      {
        type: 'reply-text',
        text: '✅ 已完成 Telegram 配對！\n現在可以在這個通訊軟體使用同一本帳本了。'
      }
    ])
  })

  it('returns usage text for missing codes and already-linked text for initialized identities', async () => {
    const usageActions = await handleTelegramBindCommand({
      chatType: 'private',
      externalUserId: 'tg-new',
      text: '綁定',
      db: {
        getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
        ensureLegacyTelegramAccount: vi.fn(),
        consumePairingCode: vi.fn()
      } as any
    })

    expect(usageActions).toEqual([
      {
        type: 'reply-text',
        text: '請使用「綁定 <配對碼>」完成帳本配對。'
      }
    ])

    const linkedActions = await handleTelegramBindCommand({
      chatType: 'private',
      externalUserId: '999',
      text: '綁定 PAIR-999',
      db: {
        getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
        ensureLegacyTelegramAccount: vi.fn().mockResolvedValue(34),
        consumePairingCode: vi.fn()
      } as any,
      allowedUserId: '999'
    })

    expect(linkedActions).toEqual([
      {
        type: 'reply-text',
        text: 'ℹ️ 這個 Telegram 帳號已經綁定過帳本，可以直接開始記帳。'
      }
    ])
  })
})
