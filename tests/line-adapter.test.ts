import { describe, expect, it, vi } from 'vitest'
import {
  buildLineReplyMessages,
  handleLineEvent,
  parseLineBootstrapCommand,
  parseLinePairCommand,
  verifyLineSignature
} from '../src/adapters/line'

async function signLineBody(channelSecret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  let binary = ''
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

describe('LINE adapter', () => {
  it('verifies the unmodified webhook body against x-line-signature', async () => {
    const channelSecret = 'secret-key'
    const rawBody = JSON.stringify({
      destination: 'U123',
      events: [{ type: 'message', replyToken: 'token-1' }]
    })
    const signature = await signLineBody(channelSecret, rawBody)

    await expect(verifyLineSignature(channelSecret, rawBody, signature)).resolves.toBe(true)
    await expect(verifyLineSignature(channelSecret, rawBody, 'invalid-signature')).resolves.toBe(false)
  })

  it('maps inline options and export fallback into LINE reply messages', () => {
    const messages = buildLineReplyMessages([
      {
        type: 'reply-inline-options',
        text: 'choose',
        options: [
          Array.from({ length: 14 }, (_, index) => ({
            text: `option-${index + 1}`,
            data: `pick:${index + 1}`
          }))
        ]
      },
      {
        type: 'reply-document',
        filename: 'expenses.csv',
        data: new Uint8Array([1, 2, 3])
      }
    ])

    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('前 13 個選項')
    })
    expect(messages[0]?.quickReply?.items).toHaveLength(13)
    expect(messages[1]).toEqual({
      type: 'text',
      text: 'LINE 目前不支援直接下載 CSV 檔案，請改用 Telegram 的 /export。'
    })
  })

  it('parses LINE bootstrap commands with and without invite codes', () => {
    expect(parseLineBootstrapCommand('建立帳本 CODE-123')).toEqual({
      matched: true,
      code: 'CODE-123'
    })
    expect(parseLineBootstrapCommand('建立帳本')).toEqual({
      matched: true,
      code: null
    })
    expect(parseLineBootstrapCommand('/summary')).toEqual({
      matched: false,
      code: null
    })
  })

  it('parses LINE pair commands with and without target providers', () => {
    expect(parseLinePairCommand('配對 telegram')).toEqual({
      matched: true,
      targetProvider: 'telegram'
    })
    expect(parseLinePairCommand('配對')).toEqual({
      matched: true,
      targetProvider: null
    })
    expect(parseLinePairCommand('/summary')).toEqual({
      matched: false,
      targetProvider: null
    })
  })

  it('delegates text commands through the shared accounting service and replies to LINE', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(11),
      consumeBootstrapInvite: vi.fn(),
      consumePairingCode: vi.fn(),
      getDirectIdentityForAccount: vi.fn(),
      issuePairingCode: vi.fn()
    }
    const accounting = {
      handleCommand: vi.fn().mockResolvedValue([{ type: 'reply-text', text: 'summary-ok' }]),
      handleMessage: vi.fn(),
      handleCallback: vi.fn()
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    const result = await handleLineEvent({
      event: {
        type: 'message',
        replyToken: 'reply-token',
        source: { type: 'user', userId: 'U-line-user' },
        message: {
          id: 'msg-1',
          type: 'text',
          text: '/summary'
        }
      },
      db: db as any,
      accounting: accounting as any,
      lineAccessToken: 'line-token',
      fetchImpl
    })

    expect(result).toBe('replied')
    expect(accounting.handleCommand).toHaveBeenCalledWith('summary', {
      accountId: 11,
      ownerRef: 'U-line-user'
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/reply',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer line-token'
        })
      })
    )

    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    expect(requestBody).toEqual({
      replyToken: 'reply-token',
      messages: [{ type: 'text', text: 'summary-ok' }]
    })
  })

  it('replies with an authorization notice when the LINE identity is not provisioned', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
      consumeBootstrapInvite: vi.fn(),
      consumePairingCode: vi.fn(),
      getDirectIdentityForAccount: vi.fn(),
      issuePairingCode: vi.fn()
    }
    const accounting = {
      handleCommand: vi.fn(),
      handleMessage: vi.fn(),
      handleCallback: vi.fn()
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-unknown' },
          message: {
            id: 'msg-2',
            type: 'text',
            text: '午餐 120'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    expect(accounting.handleMessage).not.toHaveBeenCalled()
    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    expect(requestBody.messages).toEqual([
      { type: 'text', text: '這個 LINE 帳號尚未授權，請聯繫管理者綁定。' }
    ])
  })

  it('bootstraps a LINE account from a valid invite and returns usage guidance for missing codes', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null),
      consumePairingCode: vi
        .fn()
        .mockResolvedValueOnce({ status: 'linked', account_id: 31 })
        .mockResolvedValueOnce({ status: 'invalid' }),
      getDirectIdentityForAccount: vi.fn(),
      issuePairingCode: vi.fn(),
      consumeBootstrapInvite: vi
        .fn()
        .mockResolvedValueOnce({ status: 'created', account_id: 21 })
        .mockResolvedValueOnce({ status: 'expired' })
    }
    const accounting = {
      handleCommand: vi.fn(),
      handleMessage: vi.fn(),
      handleCallback: vi.fn()
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-bootstrap' },
          message: {
            id: 'msg-bootstrap-1',
            type: 'text',
            text: '建立帳本 INV-123'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-bootstrap' },
          message: {
            id: 'msg-bootstrap-2',
            type: 'text',
            text: '建立帳本'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-bootstrap' },
          message: {
            id: 'msg-bootstrap-3',
            type: 'text',
            text: '建立帳本 EXPIRED'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    expect(db.consumeBootstrapInvite).toHaveBeenNthCalledWith(1, 'line', 'U-bootstrap', 'INV-123')
    expect(db.consumeBootstrapInvite).toHaveBeenNthCalledWith(2, 'line', 'U-bootstrap', 'EXPIRED')

    const successBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    expect(successBody.messages).toEqual([
      {
        type: 'text',
        text: '✅ 已建立你的私人帳本！\n現在可以直接輸入「午餐 120」開始記帳。\n之後如果想綁定其他通訊軟體，再使用配對功能即可。'
      }
    ])

    const usageBody = JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)
    expect(usageBody.messages).toEqual([
      {
        type: 'text',
        text: '請使用「建立帳本 <邀請碼>」建立你的帳本。'
      }
    ])

    const expiredBody = JSON.parse(fetchImpl.mock.calls[2][1]?.body as string)
    expect(expiredBody.messages).toEqual([
      {
        type: 'text',
        text: '⌛ 邀請碼已過期，請向管理者索取新的建立帳本邀請碼。'
      }
    ])

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-bootstrap' },
          message: {
            id: 'msg-bind-1',
            type: 'text',
            text: '綁定 PAIR-123'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-bootstrap' },
          message: {
            id: 'msg-bind-2',
            type: 'text',
            text: '綁定 BAD-CODE'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    expect(db.consumePairingCode).toHaveBeenNthCalledWith(1, 'line', 'U-bootstrap', 'PAIR-123')
    expect(db.consumePairingCode).toHaveBeenNthCalledWith(2, 'line', 'U-bootstrap', 'BAD-CODE')

    const bindSuccessBody = JSON.parse(fetchImpl.mock.calls[3][1]?.body as string)
    expect(bindSuccessBody.messages).toEqual([
      {
        type: 'text',
        text: '✅ 已完成 LINE 配對！\n現在可以在這個通訊軟體使用同一本帳本了。'
      }
    ])

    const bindInvalidBody = JSON.parse(fetchImpl.mock.calls[4][1]?.body as string)
    expect(bindInvalidBody.messages).toEqual([
      {
        type: 'text',
        text: '❌ 配對碼無效，請回到已綁定的通訊軟體重新產生配對碼。'
      }
    ])
  })

  it('issues pairing codes for linked LINE users', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(12),
      consumeBootstrapInvite: vi.fn(),
      consumePairingCode: vi.fn(),
      getDirectIdentityForAccount: vi.fn().mockResolvedValue(null),
      issuePairingCode: vi.fn().mockResolvedValue(undefined)
    }
    const accounting = {
      handleCommand: vi.fn(),
      handleMessage: vi.fn(),
      handleCallback: vi.fn()
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-pair' },
          message: {
            id: 'msg-pair-1',
            type: 'text',
            text: '配對 telegram'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    expect(db.getDirectIdentityForAccount).toHaveBeenCalledWith(12, 'telegram')
    expect(db.issuePairingCode).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 12,
        target_provider: 'telegram',
        requested_via_provider: 'line',
        code: expect.any(String),
        expires_at: expect.any(String)
      })
    )

    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    expect(requestBody.messages[0].text).toContain('已建立 Telegram 配對碼')
  })

  it('fetches LINE image content before sending it into the shared service', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(12),
      consumeBootstrapInvite: vi.fn(),
      consumePairingCode: vi.fn(),
      getDirectIdentityForAccount: vi.fn(),
      issuePairingCode: vi.fn()
    }
    const accounting = {
      handleCommand: vi.fn(),
      handleMessage: vi.fn().mockResolvedValue([{ type: 'reply-text', text: 'image-ok' }]),
      handleCallback: vi.fn()
    }
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === 'https://api-data.line.me/v2/bot/message/img-1/content') {
        expect(init?.headers).toEqual({
          Authorization: 'Bearer line-token'
        })
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-type': 'image/jpeg'
          }
        })
      }

      return new Response(null, { status: 200 })
    })

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-image' },
          message: {
            id: 'img-1',
            type: 'image'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    expect(accounting.handleMessage).toHaveBeenCalledWith(
      {
        accountId: 12,
        ownerRef: 'U-image'
      },
      expect.objectContaining({
        text: null,
        imageMime: 'image/jpeg',
        mediaReference: 'img-1'
      })
    )
    expect((accounting.handleMessage as any).mock.calls[0][1].imageBuffer).toBeInstanceOf(ArrayBuffer)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('ignores unsupported group events and turns postback alerts into visible replies', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(13),
      consumeBootstrapInvite: vi.fn(),
      consumePairingCode: vi.fn(),
      getDirectIdentityForAccount: vi.fn(),
      issuePairingCode: vi.fn()
    }
    const accounting = {
      handleCommand: vi.fn(),
      handleMessage: vi.fn(),
      handleCallback: vi.fn().mockResolvedValue([
        { type: 'answer-callback', text: '草稿已過期或不存在！', showAlert: true }
      ])
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    await expect(
      handleLineEvent({
        event: {
          type: 'message',
          replyToken: 'reply-token',
          source: { type: 'group', groupId: 'G-1', userId: 'U-group' },
          message: {
            id: 'msg-3',
            type: 'text',
            text: '/summary'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('ignored')

    await expect(
      handleLineEvent({
        event: {
          type: 'postback',
          replyToken: 'reply-token',
          source: { type: 'user', userId: 'U-postback' },
          postback: {
            data: 'confirm_draft:draft-1'
          }
        },
        db: db as any,
        accounting: accounting as any,
        lineAccessToken: 'line-token',
        fetchImpl
      })
    ).resolves.toBe('replied')

    expect(accounting.handleCallback).toHaveBeenCalledWith(
      {
        accountId: 13,
        ownerRef: 'U-postback'
      },
      'confirm_draft:draft-1'
    )
    const requestBody = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)
    expect(requestBody.messages).toEqual([
      { type: 'text', text: '草稿已過期或不存在！' }
    ])
  })
})
