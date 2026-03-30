import type { AccountingAction, AccountingCommand, AccountingService } from '../core/accounting'
import type { CoreDB } from '../core/db'

const LINE_REPLY_API_URL = 'https://api.line.me/v2/bot/message/reply'
const LINE_MESSAGE_CONTENT_API_BASE = 'https://api-data.line.me/v2/bot/message'
const MAX_LINE_REPLY_MESSAGES = 5
const MAX_LINE_QUICK_REPLY_ITEMS = 13

type LineFetch = typeof fetch

type LineAction = {
  type: 'postback'
  label: string
  data: string
  displayText: string
}

type LineQuickReplyItem = {
  type: 'action'
  action: LineAction
}

export type LineReplyMessage = {
  type: 'text'
  text: string
  quickReply?: {
    items: LineQuickReplyItem[]
  }
}

export type LineEventSource =
  | { type: 'user'; userId?: string }
  | { type: 'group'; groupId?: string; userId?: string }
  | { type: 'room'; roomId?: string; userId?: string }
  | { type: string; userId?: string }

export type LineWebhookEvent = {
  type: string
  replyToken?: string
  source?: LineEventSource
  message?: {
    id?: string
    type?: string
    text?: string
  }
  postback?: {
    data?: string
  }
}

export type LineWebhookPayload = {
  events?: LineWebhookEvent[]
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function truncateLabel(label: string, maxLength = 20): string {
  return Array.from(label).slice(0, maxLength).join('')
}

function extractAccountingCommand(text: string): AccountingCommand | null {
  const normalized = text.trim()
  switch (normalized) {
    case '/start':
      return 'start'
    case '/help':
      return 'help'
    case '/summary':
      return 'summary'
    case '/categories':
      return 'categories'
    case '/export':
      return 'export'
    default:
      return null
  }
}

export async function verifyLineSignature(
  channelSecret: string,
  rawBody: string,
  receivedSignature?: string | null
): Promise<boolean> {
  if (!receivedSignature) {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return toBase64(new Uint8Array(signature)) === receivedSignature
}

export function buildLineReplyMessages(actions: AccountingAction[]): LineReplyMessage[] {
  const messages: LineReplyMessage[] = []
  let callbackNotice: string | null = null

  for (const action of actions) {
    if (action.type === 'reply-text') {
      messages.push({ type: 'text', text: action.text })
      continue
    }

    if (action.type === 'reply-document') {
      messages.push({
        type: 'text',
        text: 'LINE 目前不支援直接下載 CSV 檔案，請改用 Telegram 的 /export。'
      })
      continue
    }

    if (action.type === 'reply-inline-options') {
      const flattenedOptions = action.options.flat()
      const items = flattenedOptions.slice(0, MAX_LINE_QUICK_REPLY_ITEMS).map((button) => ({
        type: 'action' as const,
        action: {
          type: 'postback' as const,
          label: truncateLabel(button.text),
          data: button.data,
          displayText: button.text
        }
      }))

      const suffix =
        flattenedOptions.length > MAX_LINE_QUICK_REPLY_ITEMS
          ? '\n\nLINE 僅顯示前 13 個選項；若需要更多選項，請改用 Telegram。'
          : ''

      messages.push({
        type: 'text',
        text: `${action.text}${suffix}`,
        ...(items.length > 0 ? { quickReply: { items } } : {})
      })
      continue
    }

    if (action.type === 'edit-text') {
      messages.push({ type: 'text', text: action.text })
      continue
    }

    if (action.type === 'answer-callback' && action.text) {
      callbackNotice = action.text
    }
  }

  if (messages.length === 0 && callbackNotice) {
    messages.push({ type: 'text', text: callbackNotice })
  }

  return messages.slice(0, MAX_LINE_REPLY_MESSAGES)
}

export async function replyLineMessages(
  accessToken: string,
  replyToken: string,
  actions: AccountingAction[],
  fetchImpl: LineFetch = fetch
): Promise<void> {
  const messages = buildLineReplyMessages(actions)
  if (messages.length === 0) {
    return
  }

  const response = await fetchImpl(LINE_REPLY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      replyToken,
      messages
    })
  })

  if (!response.ok) {
    throw new Error(`LINE reply failed with status ${response.status}`)
  }
}

export async function fetchLineMessageContent(
  accessToken: string,
  messageId: string,
  fetchImpl: LineFetch = fetch
): Promise<{ buffer: ArrayBuffer; mime: string | null }> {
  const response = await fetchImpl(`${LINE_MESSAGE_CONTENT_API_BASE}/${messageId}/content`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`LINE content fetch failed with status ${response.status}`)
  }

  return {
    buffer: await response.arrayBuffer(),
    mime: response.headers.get('content-type')
  }
}

export async function handleLineEvent({
  event,
  db,
  accounting,
  lineAccessToken,
  fetchImpl = fetch
}: {
  event: LineWebhookEvent
  db: Pick<CoreDB, 'getAccountIdByIdentity'>
  accounting: Pick<AccountingService, 'handleCommand' | 'handleMessage' | 'handleCallback'>
  lineAccessToken: string
  fetchImpl?: LineFetch
}): Promise<'ignored' | 'replied'> {
  const replyToken = event.replyToken
  const source = event.source
  const externalUserId = source?.type === 'user' ? source.userId ?? null : null

  if (!replyToken || !externalUserId) {
    return 'ignored'
  }

  const accountId = await db.getAccountIdByIdentity('line', externalUserId)
  if (!accountId) {
    await replyLineMessages(
      lineAccessToken,
      replyToken,
      [{ type: 'reply-text', text: '這個 LINE 帳號尚未授權，請聯繫管理者綁定。' }],
      fetchImpl
    )
    return 'replied'
  }

  const context = {
    accountId,
    ownerRef: externalUserId
  }

  if (event.type === 'postback' && event.postback?.data) {
    await replyLineMessages(
      lineAccessToken,
      replyToken,
      await accounting.handleCallback(context, event.postback.data),
      fetchImpl
    )
    return 'replied'
  }

  if (event.type !== 'message' || !event.message?.type) {
    return 'ignored'
  }

  if (event.message.type === 'text') {
    const text = event.message.text || ''
    const command = extractAccountingCommand(text)
    const actions = command
      ? await accounting.handleCommand(command, context)
      : await accounting.handleMessage(context, {
          text,
          imageBuffer: null,
          imageMime: null,
          mediaReference: null,
          replyAnchorText: null,
          replyText: null
        })

    await replyLineMessages(lineAccessToken, replyToken, actions, fetchImpl)
    return 'replied'
  }

  if (event.message.type === 'image' && event.message.id) {
    try {
      const content = await fetchLineMessageContent(lineAccessToken, event.message.id, fetchImpl)
      const actions = await accounting.handleMessage(context, {
        text: null,
        imageBuffer: content.buffer,
        imageMime: content.mime,
        mediaReference: event.message.id,
        replyAnchorText: null,
        replyText: null
      })

      await replyLineMessages(lineAccessToken, replyToken, actions, fetchImpl)
    } catch {
      await replyLineMessages(
        lineAccessToken,
        replyToken,
        [{ type: 'reply-text', text: '❌ 讀取 LINE 圖片失敗，請稍後再試。' }],
        fetchImpl
      )
    }
    return 'replied'
  }

  return 'ignored'
}
