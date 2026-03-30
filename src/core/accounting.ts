import { CoreDB } from './db'
import { processExpenseUpdateWithGemini, processExpenseWithGemini } from './gemini'

export type AccountingActionButton = {
  text: string
  data: string
}

export type AccountingAction =
  | {
      type: 'reply-text'
      text: string
      parseMode?: 'Markdown'
    }
  | {
      type: 'reply-inline-options'
      text: string
      options: AccountingActionButton[][]
    }
  | {
      type: 'reply-document'
      filename: string
      data: Uint8Array
    }
  | {
      type: 'edit-text'
      text: string
    }
  | {
      type: 'answer-callback'
      text?: string
      showAlert?: boolean
    }

export type AccountingCommand = 'start' | 'help' | 'summary' | 'categories' | 'export'

export type AccountingRequestContext = {
  accountId: number
  ownerRef: string
}

export type NormalizedMessageInput = {
  text: string | null
  imageBuffer: ArrayBuffer | null
  imageMime: string | null
  mediaReference: string | null
  replyAnchorText?: string | null
  replyText?: string | null
}

const HELP_TEXT = `
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

export class AccountingService {
  constructor(
    private db: CoreDB,
    private options: {
      geminiApiKey: string
      timezoneOffsetMs: number
    }
  ) {}

  async handleCommand(command: AccountingCommand, context: AccountingRequestContext): Promise<AccountingAction[]> {
    switch (command) {
      case 'start':
        return [
          {
            type: 'reply-text',
            text: '👋 歡迎使用 Edge AI 記帳助手！\n\n直接傳送文字（如：午餐 150）或上傳發票照片即可自動記帳。您可以隨時輸入 /help 查看完整教學。'
          }
        ]
      case 'help':
        return [
          {
            type: 'reply-text',
            text: HELP_TEXT,
            parseMode: 'Markdown'
          }
        ]
      case 'summary': {
        const now = new Date(Date.now() + this.options.timezoneOffsetMs)
        const monthPrefix = now.toISOString().slice(0, 7)
        const total = await this.db.getMonthlySummary(context.accountId, monthPrefix)
        return [{ type: 'reply-text', text: `📊 本月 (${monthPrefix}) 累積花費：$${total}` }]
      }
      case 'categories': {
        const categories = await this.db.getCategories(context.accountId)
        if (categories.length === 0) {
          return [{ type: 'reply-text', text: '📂 目前沒有任何帳目分類喔！' }]
        }

        const text = '📂 你的所有分類如下：\n' + categories.map((category) => `- ${category.name}`).join('\n')
        return [{ type: 'reply-text', text }]
      }
      case 'export': {
        const expenses = await this.db.getAllExpenses(context.accountId)
        if (expenses.length === 0) {
          return [{ type: 'reply-text', text: '目前沒有任何記帳紀錄。' }]
        }

        const header = '\uFEFFID,Date,Item,Amount,Category,RawMessage\n'
        const rows = expenses.map((expense) =>
          `${expense.id},${expense.date},"${expense.item.replace(/"/g, '""')}",${expense.amount},"${expense.category_name}","${(expense.raw_message || '').replace(/"/g, '""')}"`
        )
        const csvContent = header + rows.join('\n')
        return [
          {
            type: 'reply-document',
            filename: 'expenses.csv',
            data: new TextEncoder().encode(csvContent)
          }
        ]
      }
    }
  }

  async handleMessage(context: AccountingRequestContext, input: NormalizedMessageInput): Promise<AccountingAction[]> {
    const replyEditActions = await this.handleReplyEditFlow(context, input)
    if (replyEditActions) {
      return replyEditActions
    }

    const categories = await this.db.getCategories(context.accountId)
    const categoryNames = categories.map((category) => category.name)

    const parsed = await processExpenseWithGemini(
      this.options.geminiApiKey,
      categoryNames,
      input.text,
      input.imageBuffer,
      input.imageMime,
      this.options.timezoneOffsetMs
    )

    if (parsed.action === 'error') {
      if (parsed.message === 'NOT_EXPENSE') {
        return [{ type: 'reply-text', text: '🤔 這看似與記帳或查詢指令無關，請重試！' }]
      }

      return [{ type: 'reply-text', text: `🤔 解析失敗：${parsed.message || '未知錯誤'}` }]
    }

    if (parsed.action === 'query') {
      const report = await this.db.queryExpenses(context.accountId, parsed.filters || {})
      return [{ type: 'reply-text', text: report }]
    }

    if (parsed.action === 'delete_category' && parsed.category_name) {
      return this.buildDeleteCategoryActions(context, categories, parsed.category_name)
    }

    if (parsed.action === 'insert' && parsed.data) {
      return this.buildInsertActions(context, parsed.data, input.text, input.mediaReference)
    }

    return [{ type: 'reply-text', text: '🤔 無法判斷輸入內容，請重試！' }]
  }

  async handleCallback(context: AccountingRequestContext, data: string): Promise<AccountingAction[]> {
    const parts = data.split(':')
    const action = parts[0]

    if (action === 'cancel_draft') {
      await this.db.deletePendingExpense(parts[1], context.accountId)
      return [
        { type: 'edit-text', text: '❌ 已取消記帳草稿。' },
        { type: 'answer-callback' }
      ]
    }

    if (action === 'confirm_draft') {
      const draftId = parts[1]
      const draft = await this.db.getPendingExpense(draftId, context.accountId)
      if (!draft) {
        return [{ type: 'answer-callback', text: '草稿已過期或不存在！', showAlert: true }]
      }

      let categoryId = await this.db.getCategoryByName(context.accountId, draft.suggested_category)
      if (!categoryId) {
        categoryId = await this.db.createCategory(context.accountId, draft.suggested_category, context.ownerRef)
      }

      const expenseId = await this.db.insertExpense({
        account_id: context.accountId,
        user_id: context.ownerRef,
        date: draft.date,
        item: draft.item,
        amount: draft.amount,
        category_id: categoryId,
        raw_message: draft.raw_message,
        media_reference: draft.media_reference
      })

      await this.db.deletePendingExpense(draftId, context.accountId)

      return [
        {
          type: 'edit-text',
          text: `✅ 已記錄支出並建立新分類！\n──────────\n📅 日期：${draft.date}\n🏷️ 項目：${draft.item}\n📂 分類：${draft.suggested_category}\n💰 金額：$${draft.amount}\n──────────\n(ID: #${expenseId})`
        },
        { type: 'answer-callback' }
      ]
    }

    if (action === 'cancel_delete') {
      return [
        { type: 'edit-text', text: '❌ 已取消刪除分類。' },
        { type: 'answer-callback' }
      ]
    }

    if (action === 'reassign') {
      const oldCategoryId = parseInt(parts[1])
      const newCategoryId = parts[2] === 'uncat' ? null : parseInt(parts[2])

      await this.db.deleteCategoryAndReassign(context.accountId, oldCategoryId, newCategoryId, context.ownerRef)
      return [
        { type: 'edit-text', text: '✅ 已成功將關聯紀錄移轉並刪除舊分類！' },
        { type: 'answer-callback' }
      ]
    }

    return [{ type: 'answer-callback' }]
  }

  private async handleReplyEditFlow(
    context: AccountingRequestContext,
    input: NormalizedMessageInput
  ): Promise<AccountingAction[] | null> {
    if (!input.replyAnchorText || !input.replyText) {
      return null
    }

    const match = input.replyAnchorText.match(/\(ID: #(\d+)\)/)
    if (!match) {
      return null
    }

    const expenseId = parseInt(match[1])
    const text = input.replyText
    if (text.includes('刪除') || text.includes('delete') || text === '刪掉') {
      await this.db.deleteExpense(expenseId, context.accountId)
      return [{ type: 'reply-text', text: `🗑️ 帳目 #${expenseId} 已刪除！` }]
    }

    const oldExpense = await this.db.getExpense(expenseId, context.accountId)
    if (!oldExpense) {
      return [{ type: 'reply-text', text: `❌ 找不到指定的帳目 #${expenseId}！` }]
    }

    const categories = await this.db.getCategories(context.accountId)
    const categoryNames = categories.map((category) => category.name)
    const processResult = await processExpenseUpdateWithGemini(this.options.geminiApiKey, categoryNames, text, oldExpense)

    if (Object.keys(processResult).length === 0) {
      return [{ type: 'reply-text', text: '無法判斷您要修改的內容。請具體說明要修改哪個欄位（如：金額改為 200）。' }]
    }

    const dbUpdates: {
      amount?: number
      date?: string
      item?: string
      category_id?: number
    } = {}
    const replyLines: string[] = []

    if (processResult.amount !== undefined) {
      dbUpdates.amount = processResult.amount
      replyLines.push(`💰 金額改為：$${processResult.amount}`)
    }
    if (processResult.date !== undefined) {
      dbUpdates.date = processResult.date
      replyLines.push(`📅 日期改為：${processResult.date}`)
    }
    if (processResult.item !== undefined) {
      dbUpdates.item = processResult.item
      replyLines.push(`🏷️ 項目改為：${processResult.item}`)
    }
    if (processResult.suggested_category !== undefined) {
      let categoryId = await this.db.getCategoryByName(context.accountId, processResult.suggested_category)
      if (!categoryId) {
        categoryId = await this.db.createCategory(context.accountId, processResult.suggested_category, context.ownerRef)
      }
      dbUpdates.category_id = categoryId
      replyLines.push(`📂 分類改為：${processResult.suggested_category}`)
    }

    if (Object.keys(dbUpdates).length === 0) {
      return [{ type: 'reply-text', text: '無法判斷您要修改的內容。請具體說明要修改哪個欄位（如：金額改為 200）。' }]
    }

    await this.db.updateExpense(expenseId, context.accountId, dbUpdates)
    return [{ type: 'reply-text', text: `🔄 帳目 #${expenseId} 已更新！\n──────────\n${replyLines.join('\n')}` }]
  }

  private async buildDeleteCategoryActions(
    context: AccountingRequestContext,
    categories: { id: number; name: string }[],
    categoryName: string
  ): Promise<AccountingAction[]> {
    const categoryId = await this.db.getCategoryByName(context.accountId, categoryName)
    if (!categoryId) {
      return [{ type: 'reply-text', text: `找不到名為「${categoryName}」的分類！` }]
    }

    const otherCategories = categories.filter((category) => category.id !== categoryId)
    if (otherCategories.length === 0) {
      await this.db.deleteCategoryAndReassign(context.accountId, categoryId, null, context.ownerRef)
      return [
        {
          type: 'reply-text',
          text: `🗑️ 已刪除分類「${categoryName}」，因無其他分類，關聯帳目已直接移至系統底層「未分類」。`
        }
      ]
    }

    const options = [
      ...otherCategories.map((category) => [
        { text: `👉 移至【${category.name}】`, data: `reassign:${categoryId}:${category.id}` }
      ]),
      [{ text: '⚠️ 移至系統底層【未分類】', data: `reassign:${categoryId}:uncat` }],
      [{ text: '❌ 取消刪除', data: 'cancel_delete:0:0' }]
    ]

    return [
      {
        type: 'reply-inline-options',
        text: `🗑️ 準備刪除分類「${categoryName}」。\n請問原有的記帳紀錄要移轉至哪個分類？`,
        options
      }
    ]
  }

  private async buildInsertActions(
    context: AccountingRequestContext,
    data: {
      date: string
      item: string
      amount: number
      suggested_category: string
    },
    rawMessage: string | null,
    mediaReference: string | null
  ): Promise<AccountingAction[]> {
    const { date, item, amount, suggested_category: suggestedCategory } = data
    let categoryId = await this.db.getCategoryByName(context.accountId, suggestedCategory)

    if (categoryId) {
      const expenseId = await this.db.insertExpense({
        account_id: context.accountId,
        user_id: context.ownerRef,
        date,
        item,
        amount,
        category_id: categoryId,
        raw_message: rawMessage || undefined,
        media_reference: mediaReference || undefined
      })

      return [
        {
          type: 'reply-text',
          text: `✅ 已記錄支出！\n──────────\n📅 日期：${date}\n🏷️ 項目：${item}\n📂 分類：${suggestedCategory}\n💰 金額：$${amount}\n──────────\n(ID: #${expenseId})`
        }
      ]
    }

    const draftId = crypto.randomUUID().slice(0, 8)
    await this.db.savePendingExpense({
      draft_id: draftId,
      account_id: context.accountId,
      user_id: context.ownerRef,
      date,
      item,
      amount,
      suggested_category: suggestedCategory,
      raw_message: rawMessage || undefined,
      media_reference: mediaReference || undefined
    })

    return [
      {
        type: 'reply-inline-options',
        text: `找不到合適分類，AI 建議為【${suggestedCategory}】，是否建立新分類並記帳？\n📅 ${date} | 🏷 ${item} | 💰 $${amount}`,
        options: [
          [
            { text: '✅ 建立並記帳', data: `confirm_draft:${draftId}` },
            { text: '❌ 取消', data: `cancel_draft:${draftId}` }
          ]
        ]
      }
    ]
  }
}
