import { Hono } from 'hono'
import { Bot, InlineKeyboard, InputFile } from 'grammy'
import { CoreDB } from './core/db'
import { AccountingService, type AccountingAction } from './core/accounting'
import type { D1Database } from '@cloudflare/workers-types'

export type Bindings = {
  TELEGRAM_BOT_TOKEN: string
  GEMINI_API_KEY: string
  ALLOWED_USER_ID?: string
  DB: D1Database
}

type RequestAccount = {
  accountId: number
  externalUserId: string
}

const app = new Hono<{ Bindings: Bindings }>()

function setRequestAccount(ctx: any, account: RequestAccount) {
  ctx.requestAccount = account
}

function getRequestAccount(ctx: any): RequestAccount {
  const account = ctx.requestAccount as RequestAccount | undefined
  if (!account) {
    throw new Error('Missing request account context')
  }

  return account
}

async function applyTelegramActions(ctx: any, actions: AccountingAction[]) {
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

app.get('/', (c) => c.text('Accounting Assistant Webhook is running!'))

// ─── Dashboard REST API ───────────────────────────────────────────────────────
// Cloudflare Access 驗證 middleware
// Access 會將 JWT Token 注入到 Cf-Access-Jwt-Assertion header
// 在暫時气候，我們用簡張輕量宣告式檢查: 檢查 header 是否存在 + sub (email) 是否匹配 ALLOWED_USER_ID
// Production 尤 應运用 jose verifyJWT 進行完整公鑰驗證
const apiAuth = async (c: any, next: any) => {
  const expectedSecret = c.env.DASHBOARD_PROXY_SECRET
  const providedSecret = c.req.header('X-Dashboard-Proxy-Secret')

  if (!expectedSecret) {
    return c.json({ error: 'Dashboard proxy secret is not configured' }, 500)
  }

  if (providedSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
  return

  const jwt = c.req.header('Cf-Access-Jwt-Assertion')
  // No JWT → reject (protect from direct curl access)
  if (!jwt) return c.json({ error: 'Unauthorized' }, 401)
  await next()
}

const api = app.basePath('/api')

api.use('*', apiAuth)

// GET /api/expenses?start=&end=&category=
api.get('/expenses', async (c) => {
  const db = new CoreDB(c.env.DB)
  const { start, end, category } = c.req.query()
  const expenses = await db.listExpenses(c.env.ALLOWED_USER_ID, {
    start_date: start,
    end_date: end,
    category_name: category
  })
  return c.json(expenses)
})

// DELETE /api/expenses/:id
api.delete('/expenses/:id', async (c) => {
  const db = new CoreDB(c.env.DB)
  const id = parseInt(c.req.param('id'))
  await db.deleteExpense(id, c.env.ALLOWED_USER_ID)
  return c.json({ ok: true })
})

// GET /api/summary?year=&month=
api.get('/summary', async (c) => {
  const db = new CoreDB(c.env.DB)
  const { year, month } = c.req.query()
  const result = await db.getCategorySummaryByMonth(
    c.env.ALLOWED_USER_ID,
    year ?? '',
    month ?? ''
  )
  return c.json(result)
})

// GET /api/categories
api.get('/categories', async (c) => {
  const db = new CoreDB(c.env.DB)
  const cats = await db.getCategories(c.env.ALLOWED_USER_ID)
  return c.json(cats)
})

// DELETE /api/categories/:id?replace=
api.delete('/categories/:id', async (c) => {
  const db = new CoreDB(c.env.DB)
  const id = parseInt(c.req.param('id'))
  const replaceId = parseInt(c.req.query('replace') ?? '0')
  if (!replaceId) return c.json({ error: 'replace param required' }, 400)
  await db.deleteCategoryAndReassign(id, replaceId, c.env.ALLOWED_USER_ID)
  return c.json({ ok: true })
})
// ─── End Dashboard API ────────────────────────────────────────────────────────

app.post('/webhook/telegram', async (c) => {
  // 0. Security: Validate Telegram Webhook Secret Token
  // 用 Bot Token 去除非英數字元作為 Webhook 的專屬通行證，阻擋直接來自網際網路的惡意假請求
  const expectedSecret = c.env.TELEGRAM_BOT_TOKEN.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 256)
  const providedSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token')
  if (providedSecret !== expectedSecret) {
    return c.text('Unauthorized', 401)
  }

  const bot = new Bot(c.env.TELEGRAM_BOT_TOKEN, {
    botInfo: {
      id: 1,
      is_bot: true,
      first_name: "Accounting Assistant",
      username: "accountant_bot",
      can_join_groups: true,
      can_read_all_group_messages: true,
      supports_inline_queries: false,
    } as any
  })
  const db = new CoreDB(c.env.DB)
  const accounting = new AccountingService(db, {
    geminiApiKey: c.env.GEMINI_API_KEY,
    timezoneOffsetMs: 8 * 60 * 60 * 1000
  })
  
  // 1. Authentication
  bot.use(async (ctx, next) => {
    if (ctx.chat?.type && ctx.chat.type !== 'private') return

    const externalUserId = ctx.from?.id?.toString()
    if (!externalUserId) return

    let accountId = await db.getAccountIdByIdentity('telegram', externalUserId)
    if (!accountId && c.env.ALLOWED_USER_ID && externalUserId === c.env.ALLOWED_USER_ID) {
      accountId = await db.ensureLegacyTelegramAccount(externalUserId)
    }

    if (!accountId) return

    setRequestAccount(ctx, { accountId, externalUserId })
    await next()
  })

  // 2. Simple Commands
  bot.command('start', async (ctx) => {
    const account = getRequestAccount(ctx)
    await applyTelegramActions(
      ctx,
      await accounting.handleCommand('start', { accountId: account.accountId, ownerRef: account.externalUserId })
    )
  })

  bot.command('help', async (ctx) => {
    const account = getRequestAccount(ctx)
    await applyTelegramActions(
      ctx,
      await accounting.handleCommand('help', { accountId: account.accountId, ownerRef: account.externalUserId })
    )
  })

  bot.command('summary', async (ctx) => {
    const account = getRequestAccount(ctx)
    await applyTelegramActions(
      ctx,
      await accounting.handleCommand('summary', { accountId: account.accountId, ownerRef: account.externalUserId })
    )
  })

  bot.command('categories', async (ctx) => {
    const account = getRequestAccount(ctx)
    await applyTelegramActions(
      ctx,
      await accounting.handleCommand('categories', { accountId: account.accountId, ownerRef: account.externalUserId })
    )
  })

  bot.command('export', async (ctx) => {
    const account = getRequestAccount(ctx)
    await applyTelegramActions(
      ctx,
      await accounting.handleCommand('export', { accountId: account.accountId, ownerRef: account.externalUserId })
    )
  })

  // 3. Core Text & Photo Logic
  bot.on(['message:text', 'message:photo'], async (ctx) => {
    const account = getRequestAccount(ctx)
    const textInput = ctx.message.text || ctx.message.caption || null
    let imageBuffer: ArrayBuffer | null = null
    let imageMime: string | null = null
    let mediaRef: string | null = null

    // Image fetching integration
    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1]
      mediaRef = photo.file_id
      const file = await ctx.api.getFile(photo.file_id)
      const fileUrl = `https://api.telegram.org/file/bot${c.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`
      const res = await fetch(fileUrl)
      imageBuffer = await res.arrayBuffer()
      imageMime = 'image/jpeg' 
    }

    await applyTelegramActions(
      ctx,
      await accounting.handleMessage(
        { accountId: account.accountId, ownerRef: account.externalUserId },
        {
          text: textInput,
          imageBuffer,
          imageMime,
          mediaReference: mediaRef,
          replyAnchorText: ctx.message?.reply_to_message?.text || null,
          replyText: ctx.message?.text || null
        }
      )
    )
  })

  // 4. Inline Keyboard Callback Integration
  bot.on('callback_query:data', async (ctx) => {
    const account = getRequestAccount(ctx)
    await applyTelegramActions(
      ctx,
      await accounting.handleCallback(
        { accountId: account.accountId, ownerRef: account.externalUserId },
        ctx.callbackQuery.data
      )
    )
  })

  // 5. Cloudflare Workers safe background execution pattern
  const update = await c.req.json()
  c.executionCtx.waitUntil(bot.handleUpdate(update))
  return c.json({ ok: true })
})

export default app
