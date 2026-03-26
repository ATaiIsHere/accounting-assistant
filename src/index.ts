import { Hono } from 'hono'
import { Bot, InlineKeyboard, InputFile } from 'grammy'
import { CoreDB } from './core/db'
import { processExpenseWithGemini, extractAmountOnly, processExpenseUpdateWithGemini } from './core/gemini'
import type { D1Database } from '@cloudflare/workers-types'

export type Bindings = {
  TELEGRAM_BOT_TOKEN: string
  GEMINI_API_KEY: string
  ALLOWED_USER_ID: string
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('Accounting Assistant Webhook is running!'))

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
    if (ctx.from?.id.toString() !== c.env.ALLOWED_USER_ID) return
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
    const now = new Date(Date.now() + TIMEZONE_OFFSET)
    const monthPrefix = now.toISOString().slice(0, 7)
    const total = await db.getMonthlySummary(c.env.ALLOWED_USER_ID, monthPrefix)
    await ctx.reply(`📊 本月 (${monthPrefix}) 累積花費：$${total}`)
  })

  bot.command('categories', async (ctx) => {
    const categories = await db.getCategories(c.env.ALLOWED_USER_ID)
    if (categories.length === 0) {
      await ctx.reply('📂 目前沒有任何帳目分類喔！')
      return
    }
    const text = '📂 你的所有分類如下：\n' + categories.map(c => `- ${c.name}`).join('\n')
    await ctx.reply(text)
  })

  bot.command('export', async (ctx) => {
    const expenses = await db.getAllExpenses(c.env.ALLOWED_USER_ID)
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
    // 3.1 Reply-and-modify/delete Anchor Logic
    if (ctx.message?.reply_to_message?.text && ctx.message.text) {
      const match = ctx.message.reply_to_message.text.match(/\(ID: #(\d+)\)/)
      if (match) {
        const id = parseInt(match[1])
        const text = ctx.message.text
        if (text.includes('刪除') || text.includes('delete') || text === '刪掉') {
          await db.deleteExpense(id, c.env.ALLOWED_USER_ID)
          await ctx.reply(`🗑️ 帳目 #${id} 已刪除！`)
        } else {
          const oldExp = await db.getExpense(id, c.env.ALLOWED_USER_ID)
          if (!oldExp) {
            await ctx.reply(`❌ 找不到指定的帳目 #${id}！`)
            return
          }
          
          const categories = await db.getCategories(c.env.ALLOWED_USER_ID)
          const catNames = categories.map(c => c.name)

          const processRes = await processExpenseUpdateWithGemini(c.env.GEMINI_API_KEY, catNames, text, oldExp)
          
          if (Object.keys(processRes).length > 0) {
            const dbUpdates: any = {}
            const replyMsg: string[] = []
            
            if (processRes.amount !== undefined) { dbUpdates.amount = processRes.amount; replyMsg.push(`💰 金額改為：$${processRes.amount}`) }
            if (processRes.date !== undefined) { dbUpdates.date = processRes.date; replyMsg.push(`📅 日期改為：${processRes.date}`) }
            if (processRes.item !== undefined) { dbUpdates.item = processRes.item; replyMsg.push(`🏷️ 項目改為：${processRes.item}`) }
            if (processRes.suggested_category !== undefined) {
               let catId = await db.getCategoryByName(c.env.ALLOWED_USER_ID, processRes.suggested_category)
               if (!catId) catId = await db.createCategory(c.env.ALLOWED_USER_ID, processRes.suggested_category)
               dbUpdates.category_id = catId
               replyMsg.push(`📂 分類改為：${processRes.suggested_category}`)
            }

            if (Object.keys(dbUpdates).length > 0) {
              await db.updateExpense(id, c.env.ALLOWED_USER_ID, dbUpdates)
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

    const categories = await db.getCategories(c.env.ALLOWED_USER_ID)
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
      const report = await db.queryExpenses(c.env.ALLOWED_USER_ID, parsed.filters || {})
      await ctx.reply(report)
      return
    }

    if (parsed.action === 'delete_category' && parsed.category_name) {
      const catId = await db.getCategoryByName(c.env.ALLOWED_USER_ID, parsed.category_name)
      if (!catId) {
        await ctx.reply(`找不到名為「${parsed.category_name}」的分類！`)
        return
      }
      
      const otherCats = categories.filter(c => c.id !== catId)
      if (otherCats.length === 0) {
        // Edge case: only category
        await db.deleteCategoryAndReassign(c.env.ALLOWED_USER_ID, catId, null)
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
      let categoryId = await db.getCategoryByName(c.env.ALLOWED_USER_ID, suggested_category)
      
      if (categoryId) {
        // Direct insertion
        const id = await db.insertExpense({
          user_id: c.env.ALLOWED_USER_ID, date, item, amount, category_id: categoryId,
          raw_message: textInput || undefined, media_reference: mediaRef || undefined
        })
        await ctx.reply(`✅ 已記錄支出！\n──────────\n📅 日期：${date}\n🏷️ 項目：${item}\n📂 分類：${suggested_category}\n💰 金額：$${amount}\n──────────\n(ID: #${id})`)
      } else {
        // Dynamic Category Interaction Setup
        const draftId = crypto.randomUUID().slice(0, 8)
        await db.savePendingExpense({
          draft_id: draftId, user_id: c.env.ALLOWED_USER_ID, date, item, amount, suggested_category,
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
    const data = ctx.callbackQuery.data
    const parts = data.split(':')
    const action = parts[0]
    
    if (action === 'cancel_draft') {
      await db.deletePendingExpense(parts[1])
      await ctx.editMessageText('❌ 已取消記帳草稿。')
      await ctx.answerCallbackQuery()
      return
    }

    if (action === 'confirm_draft') {
      const draftId = parts[1]
      const draft = await db.getPendingExpense(draftId)
      if (!draft) {
        await ctx.answerCallbackQuery({ text: '草稿已過期或不存在！', show_alert: true })
        return
      }

      let catId = await db.getCategoryByName(c.env.ALLOWED_USER_ID, draft.suggested_category)
      if (!catId) catId = await db.createCategory(c.env.ALLOWED_USER_ID, draft.suggested_category)
      
      const id = await db.insertExpense({
        user_id: c.env.ALLOWED_USER_ID, date: draft.date, item: draft.item, amount: draft.amount,
        category_id: catId, raw_message: draft.raw_message, media_reference: draft.media_reference
      })
      await db.deletePendingExpense(draftId)

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
      
      await db.deleteCategoryAndReassign(c.env.ALLOWED_USER_ID, oldCatId, newCatId)
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
