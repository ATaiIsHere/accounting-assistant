import { describe, expect, it, vi } from 'vitest'
import { buildLineReplyMessages, handleLineEvent, verifyLineSignature } from '../src/adapters/line'

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

  it('delegates text commands through the shared accounting service and replies to LINE', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(11)
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
      getAccountIdByIdentity: vi.fn().mockResolvedValue(null)
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

  it('fetches LINE image content before sending it into the shared service', async () => {
    const db = {
      getAccountIdByIdentity: vi.fn().mockResolvedValue(12)
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
      getAccountIdByIdentity: vi.fn().mockResolvedValue(13)
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
