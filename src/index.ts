import { Hono } from 'hono'
import { Bot, InlineKeyboard, InputFile } from 'grammy'
import { CoreDB } from './core/db'
import { processExpenseWithGemini, processExpenseUpdateWithGemini } from './core/gemini'
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
  const TIMEZONE_OFFSET = 8 * 60 * 60 * 1000 // UTC+8
  
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
  bot.command('start', (ctx) => ctx.reply('👋 歡迎使用 Edge AI 記帳助手！\n\n直接傳送文字（如：午餐 150）或上傳發票照片即可自動記帳。您可以隨時輸入 /help 查看完整教學。'))

  bot.command('help', async (ctx) => {
    const helpText = `
🤖 **Edge AI 記帳助手使用指南**

📌 **基本指令**
/start - 啟動機器人
/help - 顯示此說明
/summary - 查看本月花費總結
/categories - 列出建立的所有分類
/export - 將完整帳目匯出為 CSV 檔案

💬 **自然語言記帳 & 查詢**
- **記帳**：直接輸入「午餐 150」、「搭車 50」，或傳送發票照片。
- **查詢**：直接輸入「這個月吃飯花多少？」、「今天花了多少錢？」。
- **刪除分類**：直接輸入「幫我刪掉早餐分類」，系統會引導轉移舊帳目。

✏️ **編輯舊帳目**
對著過去的「帳目成功紀錄」**長按並點擊 Reply (回覆)**，接著輸入想修改的內容：
- 「金額改成 200」
- 「其實是昨天的晚餐」
- 「刪掉這筆」
系統就會自動幫你精準修改該筆紀錄！
    `.trim()
    await ctx.reply(helpText, { parse_mode: "Markdown" })
  })

  bot.command('summary', async (ctx) => {
    const account = getRequestAccount(ctx)
    const now = new Date(Date.now() + TIMEZONE_OFFSET)
    const monthPrefix = now.toISOString().slice(0, 7)
    const total = await db.getMonthlySummary(account.accountId, monthPrefix)
    await ctx.reply(`📊 本月 (${monthPrefix}) 累積花費：$${total}`)
  })

  bot.command('categories', async (ctx) => {
    const account = getRequestAccount(ctx)
    const categories = await db.getCategories(account.accountId)
    if (categories.length === 0) {
      await ctx.reply('📂 目前沒有任何帳目分類喔！')
      return
    }
    const text = '📂 你的所有分類如下：\n' + categories.map(c => `- ${c.name}`).join('\n')
    await ctx.reply(text)
  })

  bot.command('export', async (ctx) => {
    const account = getRequestAccount(ctx)
    const expenses = await db.getAllExpenses(account.accountId)
    if (expenses.length === 0) {
      await ctx.reply('目前沒有任何記帳紀錄。')
      return
    }
    const header = '\uFEFFID,Date,Item,Amount,Category,RawMessage\n' 
    const rows = expenses.map(e => `${e.id},${e.date},"${e.item.replace(/"/g, '""')}",${e.amount},"${e.category_name}","${(e.raw_message || '').replace(/"/g, '""')}"`)
    const csvContent = header + rows.join('\n')
    
    const buffer = new TextEncoder().encode(csvContent)
    await ctx.replyWithDocument(new InputFile(buffer, 'expenses.csv'))
  })

  // 3. Core Text & Photo Logic
  bot.on(['message:text', 'message:photo'], async (ctx) => {
    const account = getRequestAccount(ctx)

    // 3.1 Reply-and-modify/delete Anchor Logic
    if (ctx.message?.reply_to_message?.text && ctx.message.text) {
      const match = ctx.message.reply_to_message.text.match(/\(ID: #(\d+)\)/)
      if (match) {
        const id = parseInt(match[1])
        const text = ctx.message.text
        if (text.includes('刪除') || text.includes('delete') || text === '刪掉') {
          await db.deleteExpense(id, account.accountId)
          await ctx.reply(`🗑️ 帳目 #${id} 已刪除！`)
        } else {
          const oldExp = await db.getExpense(id, account.accountId)
          if (!oldExp) {
            await ctx.reply(`❌ 找不到指定的帳目 #${id}！`)
            return
          }
          
          const categories = await db.getCategories(account.accountId)
          const catNames = categories.map(c => c.name)

          const processRes = await processExpenseUpdateWithGemini(c.env.GEMINI_API_KEY, catNames, text, oldExp)
          
          if (Object.keys(processRes).length > 0) {
            const dbUpdates: any = {}
            const replyMsg: string[] = []
            
            if (processRes.amount !== undefined) { dbUpdates.amount = processRes.amount; replyMsg.push(`💰 金額改為：$${processRes.amount}`) }
            if (processRes.date !== undefined) { dbUpdates.date = processRes.date; replyMsg.push(`📅 日期改為：${processRes.date}`) }
            if (processRes.item !== undefined) { dbUpdates.item = processRes.item; replyMsg.push(`🏷️ 項目改為：${processRes.item}`) }
            if (processRes.suggested_category !== undefined) {
               let catId = await db.getCategoryByName(account.accountId, processRes.suggested_category)
               if (!catId) catId = await db.createCategory(account.accountId, processRes.suggested_category, account.externalUserId)
               dbUpdates.category_id = catId
               replyMsg.push(`📂 分類改為：${processRes.suggested_category}`)
            }

            if (Object.keys(dbUpdates).length > 0) {
              await db.updateExpense(id, account.accountId, dbUpdates)
              await ctx.reply(`🔄 帳目 #${id} 已更新！\n──────────\n${replyMsg.join('\n')}`)
            } else {
              await ctx.reply('無法判斷您要修改的內容。請具體說明要修改哪個欄位（如：金額改為 200）。')
            }
          } else {
            await ctx.reply('無法判斷您要修改的內容。請具體說明要修改哪個欄位（如：金額改為 200）。')
          }
        }
        return
      }
    }

    // 3.2 Main Expense Parsing
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

    const categories = await db.getCategories(account.accountId)
    const catNames = categories.map(c => c.name)

    const parsed = await processExpenseWithGemini(
      c.env.GEMINI_API_KEY, catNames, textInput, imageBuffer, imageMime, TIMEZONE_OFFSET
    )

    if (parsed.action === 'error') {
      if (parsed.message === 'NOT_EXPENSE') {
         await ctx.reply('🤔 這看似與記帳或查詢指令無關，請重試！')
      } else {
         await ctx.reply(`🤔 解析失敗：${parsed.message || '未知錯誤'}`)
      }
      return
    }

    if (parsed.action === 'query') {
      const report = await db.queryExpenses(account.accountId, parsed.filters || {})
      await ctx.reply(report)
      return
    }

    if (parsed.action === 'delete_category' && parsed.category_name) {
      const catId = await db.getCategoryByName(account.accountId, parsed.category_name)
      if (!catId) {
        await ctx.reply(`找不到名為「${parsed.category_name}」的分類！`)
        return
      }
      
      const otherCats = categories.filter(c => c.id !== catId)
      if (otherCats.length === 0) {
        // Edge case: only category
        await db.deleteCategoryAndReassign(account.accountId, catId, null, account.externalUserId)
        await ctx.reply(`🗑️ 已刪除分類「${parsed.category_name}」，因無其他分類，關聯帳目已直接移至系統底層「未分類」。`)
        return
      }

      // Show inline keyboard to select target category for reassignment
      const keyboard = new InlineKeyboard()
      otherCats.forEach(c => {
         keyboard.text(`👉 移至【${c.name}】`, `reassign:${catId}:${c.id}`).row()
      })
      keyboard.text(`⚠️ 移至系統底層【未分類】`, `reassign:${catId}:uncat`).row()
      keyboard.text('❌ 取消刪除', `cancel_delete:0:0`)
      
      await ctx.reply(`🗑️ 準備刪除分類「${parsed.category_name}」。\n請問原有的記帳紀錄要移轉至哪個分類？`, { reply_markup: keyboard })
      return
    }

    if (parsed.action === 'insert' && parsed.data) {
      const { date, item, amount, suggested_category } = parsed.data
      let categoryId = await db.getCategoryByName(account.accountId, suggested_category)
      
      if (categoryId) {
        // Direct insertion
        const id = await db.insertExpense({
          account_id: account.accountId, user_id: account.externalUserId, date, item, amount, category_id: categoryId,
          raw_message: textInput || undefined, media_reference: mediaRef || undefined
        })
        await ctx.reply(`✅ 已記錄支出！\n──────────\n📅 日期：${date}\n🏷️ 項目：${item}\n📂 分類：${suggested_category}\n💰 金額：$${amount}\n──────────\n(ID: #${id})`)
      } else {
        // Dynamic Category Interaction Setup
        const draftId = crypto.randomUUID().slice(0, 8)
        await db.savePendingExpense({
          draft_id: draftId, account_id: account.accountId, user_id: account.externalUserId, date, item, amount, suggested_category,
          raw_message: textInput || undefined, media_reference: mediaRef || undefined
        })
        const keyboard = new InlineKeyboard()
          .text('✅ 建立並記帳', `confirm_draft:${draftId}`)
          .text('❌ 取消', `cancel_draft:${draftId}`)
        
        await ctx.reply(`找不到合適分類，AI 建議為【${suggested_category}】，是否建立新分類並記帳？\n📅 ${date} | 🏷 ${item} | 💰 $${amount}`, { reply_markup: keyboard })
      }
    }
  })

  // 4. Inline Keyboard Callback Integration
  bot.on('callback_query:data', async (ctx) => {
    const account = getRequestAccount(ctx)
    const data = ctx.callbackQuery.data
    const parts = data.split(':')
    const action = parts[0]
    
    if (action === 'cancel_draft') {
      await db.deletePendingExpense(parts[1], account.accountId)
      await ctx.editMessageText('❌ 已取消記帳草稿。')
      await ctx.answerCallbackQuery()
      return
    }

    if (action === 'confirm_draft') {
      const draftId = parts[1]
      const draft = await db.getPendingExpense(draftId, account.accountId)
      if (!draft) {
        await ctx.answerCallbackQuery({ text: '草稿已過期或不存在！', show_alert: true })
        return
      }

      let catId = await db.getCategoryByName(account.accountId, draft.suggested_category)
      if (!catId) catId = await db.createCategory(account.accountId, draft.suggested_category, account.externalUserId)
      
      const id = await db.insertExpense({
        account_id: account.accountId, user_id: account.externalUserId, date: draft.date, item: draft.item, amount: draft.amount,
        category_id: catId, raw_message: draft.raw_message, media_reference: draft.media_reference
      })
      await db.deletePendingExpense(draftId, account.accountId)

      await ctx.editMessageText(`✅ 已記錄支出並建立新分類！\n──────────\n📅 日期：${draft.date}\n🏷️ 項目：${draft.item}\n📂 分類：${draft.suggested_category}\n💰 金額：$${draft.amount}\n──────────\n(ID: #${id})`)
      await ctx.answerCallbackQuery()
      return
    }

    if (action === 'cancel_delete') {
      await ctx.editMessageText('❌ 已取消刪除分類。')
      await ctx.answerCallbackQuery()
      return
    }

    if (action === 'reassign') {
      const oldCatId = parseInt(parts[1])
      const newCatIdStr = parts[2]
      const newCatId = newCatIdStr === 'uncat' ? null : parseInt(newCatIdStr)
      
      await db.deleteCategoryAndReassign(account.accountId, oldCatId, newCatId, account.externalUserId)
      await ctx.editMessageText('✅ 已成功將關聯紀錄移轉並刪除舊分類！')
      await ctx.answerCallbackQuery()
      return
    }
  })

  // 5. Cloudflare Workers safe background execution pattern
  const update = await c.req.json()
  c.executionCtx.waitUntil(bot.handleUpdate(update))
  return c.json({ ok: true })
})

export default app
