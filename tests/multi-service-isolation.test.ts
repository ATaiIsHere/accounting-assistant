import { describe, expect, it, vi } from 'vitest'
import { AccountingService } from '../src/core/accounting'

type ExpenseRecord = {
  id: number
  account_id: number
  user_id?: string
  date: string
  item: string
  amount: number
  category_id?: number
  raw_message?: string
  media_reference?: string
}

type PendingRecord = {
  draft_id: string
  account_id: number
  user_id?: string
  date: string
  item: string
  amount: number
  suggested_category: string
  raw_message?: string
  media_reference?: string
}

class InMemoryAccountingDb {
  private nextCategoryId = 1
  private nextExpenseId = 1
  private categories = new Map<number, { id: number; name: string }[]>()
  private expenses = new Map<number, ExpenseRecord[]>()
  private pendingExpenses = new Map<string, PendingRecord>()

  async getMonthlySummary(accountId: number, prefixDate: string): Promise<number> {
    return (this.expenses.get(accountId) || [])
      .filter((expense) => expense.date.startsWith(prefixDate))
      .reduce((total, expense) => total + expense.amount, 0)
  }

  async getCategories(accountId: number): Promise<{ id: number; name: string }[]> {
    return [...(this.categories.get(accountId) || [])]
  }

  async getAllExpenses(accountId: number): Promise<any[]> {
    const categoriesById = new Map((this.categories.get(accountId) || []).map((category) => [category.id, category.name]))
    return (this.expenses.get(accountId) || []).map((expense) => ({
      id: expense.id,
      date: expense.date,
      item: expense.item,
      amount: expense.amount,
      category_name: categoriesById.get(expense.category_id || -1) || '未分類',
      raw_message: expense.raw_message || null
    }))
  }

  async getExpense(id: number, accountId: number): Promise<ExpenseRecord | null> {
    return (this.expenses.get(accountId) || []).find((expense) => expense.id === id) || null
  }

  async deleteExpense(id: number, accountId: number): Promise<boolean> {
    const expenses = this.expenses.get(accountId) || []
    const nextExpenses = expenses.filter((expense) => expense.id !== id)
    this.expenses.set(accountId, nextExpenses)
    return nextExpenses.length !== expenses.length
  }

  async updateExpense(id: number, accountId: number, updates: Partial<ExpenseRecord>): Promise<boolean> {
    const expense = await this.getExpense(id, accountId)
    if (!expense) {
      return false
    }

    Object.assign(expense, updates)
    return true
  }

  async getCategoryByName(accountId: number, name: string): Promise<number | null> {
    return (this.categories.get(accountId) || []).find((category) => category.name === name)?.id || null
  }

  async createCategory(accountId: number, name: string): Promise<number> {
    const existingId = await this.getCategoryByName(accountId, name)
    if (existingId) {
      return existingId
    }

    const category = {
      id: this.nextCategoryId++,
      name
    }
    this.categories.set(accountId, [...(this.categories.get(accountId) || []), category])
    return category.id
  }

  async deleteCategoryAndReassign(accountId: number, oldCategoryId: number, newCategoryId: number | null): Promise<void> {
    let targetCategoryId = newCategoryId
    if (!targetCategoryId) {
      targetCategoryId = await this.createCategory(accountId, '未分類')
    }

    const expenses = this.expenses.get(accountId) || []
    expenses.forEach((expense) => {
      if (expense.category_id === oldCategoryId) {
        expense.category_id = targetCategoryId || undefined
      }
    })

    this.categories.set(
      accountId,
      (this.categories.get(accountId) || []).filter((category) => category.id !== oldCategoryId)
    )
  }

  async insertExpense(expense: Omit<ExpenseRecord, 'id'>): Promise<number> {
    const record = {
      ...expense,
      id: this.nextExpenseId++
    }
    this.expenses.set(expense.account_id, [...(this.expenses.get(expense.account_id) || []), record])
    return record.id
  }

  async savePendingExpense(pending: PendingRecord): Promise<void> {
    this.pendingExpenses.set(`${pending.account_id}:${pending.draft_id}`, pending)
  }

  async getPendingExpense(draftId: string, accountId: number): Promise<PendingRecord | null> {
    return this.pendingExpenses.get(`${accountId}:${draftId}`) || null
  }

  async deletePendingExpense(draftId: string, accountId: number): Promise<void> {
    this.pendingExpenses.delete(`${accountId}:${draftId}`)
  }

  async queryExpenses(
    accountId: number,
    filters: {
      start_date?: string
      end_date?: string
      category_name?: string | null
    }
  ): Promise<string> {
    const categoriesById = new Map((this.categories.get(accountId) || []).map((category) => [category.id, category.name]))
    const filtered = (this.expenses.get(accountId) || []).filter((expense) => {
      if (filters.start_date && expense.date < filters.start_date) return false
      if (filters.end_date && expense.date > filters.end_date) return false
      if (filters.category_name && categoriesById.get(expense.category_id || -1) !== filters.category_name) return false
      return true
    })

    if (filtered.length === 0) {
      return '指定區間內沒有任何消費紀錄喔！'
    }

    const total = filtered.reduce((sum, expense) => sum + expense.amount, 0)
    return `📋 查詢結果：\n共 ${filtered.length} 筆消費，總計：$${total}`
  }
}

function createService(db: InMemoryAccountingDb, parseExpenseResult: any) {
  return new AccountingService(
    db as any,
    {
      geminiApiKey: 'mock-key',
      timezoneOffsetMs: 8 * 60 * 60 * 1000
    },
    {
      parseExpense: vi.fn().mockResolvedValue(parseExpenseResult),
      parseExpenseUpdate: vi.fn().mockResolvedValue({}),
      generateDraftId: () => 'draft-fixed'
    }
  )
}

describe('multi-service account isolation', () => {
  it('shares the same ledger across telegram and line when both identities resolve to one account', async () => {
    const db = new InMemoryAccountingDb()
    await db.createCategory(1, 'Food')
    const service = createService(db, {
      action: 'insert',
      data: {
        date: '2026-03-28',
        item: 'Lunch',
        amount: 120,
        suggested_category: 'Food'
      }
    })

    await service.handleMessage(
      { accountId: 1, ownerRef: 'telegram:123' },
      {
        text: '午餐 120',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null
      }
    )

    const summaryActions = await service.handleCommand('summary', {
      accountId: 1,
      ownerRef: 'line:U123'
    })
    const exportActions = await service.handleCommand('export', {
      accountId: 1,
      ownerRef: 'line:U123'
    })

    expect(summaryActions).toEqual([
      {
        type: 'reply-text',
        text: '📊 本月 (2026-03) 累積花費：$120'
      }
    ])
    expect(exportActions[0]).toMatchObject({
      type: 'reply-document',
      filename: 'expenses.csv'
    })
    expect(new TextDecoder().decode((exportActions[0] as any).data)).toContain('Lunch')
  })

  it('shares pending drafts and categories within the same account across providers', async () => {
    const db = new InMemoryAccountingDb()
    const service = createService(db, {
      action: 'insert',
      data: {
        date: '2026-03-28',
        item: 'Tea',
        amount: 65,
        suggested_category: 'Drinks'
      }
    })

    const draftActions = await service.handleMessage(
      { accountId: 1, ownerRef: 'line:U123' },
      {
        text: '飲料 65',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null
      }
    )
    const confirmActions = await service.handleCallback(
      { accountId: 1, ownerRef: 'telegram:123' },
      'confirm_draft:draft-fixed'
    )
    const categoryActions = await service.handleCommand('categories', {
      accountId: 1,
      ownerRef: 'line:U123'
    })
    const summaryActions = await service.handleCommand('summary', {
      accountId: 1,
      ownerRef: 'telegram:123'
    })

    expect(draftActions[0]).toMatchObject({ type: 'reply-inline-options' })
    expect(confirmActions[0]).toMatchObject({
      type: 'edit-text',
      text: expect.stringContaining('已記錄支出並建立新分類')
    })
    expect(categoryActions).toEqual([
      {
        type: 'reply-text',
        text: '📂 你的所有分類如下：\n- Drinks'
      }
    ])
    expect(summaryActions).toEqual([
      {
        type: 'reply-text',
        text: '📊 本月 (2026-03) 累積花費：$65'
      }
    ])
  })

  it('keeps different accounts isolated for categories, pending drafts, and exports', async () => {
    const db = new InMemoryAccountingDb()
    const service = createService(db, {
      action: 'insert',
      data: {
        date: '2026-03-28',
        item: 'Late Snack',
        amount: 50,
        suggested_category: 'DraftOnly'
      }
    })

    const mealsCategoryId = await db.createCategory(1, 'Meals')
    await db.insertExpense({
      account_id: 1,
      user_id: 'telegram:123',
      date: '2026-03-28',
      item: 'Dinner',
      amount: 280,
      category_id: mealsCategoryId
    })

    await service.handleMessage(
      { accountId: 1, ownerRef: 'telegram:123' },
      {
        text: '宵夜 50',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null
      }
    )

    const accountTwoDraftConfirm = await service.handleCallback(
      { accountId: 2, ownerRef: 'line:U999' },
      'confirm_draft:draft-fixed'
    )
    const accountTwoCategories = await service.handleCommand('categories', {
      accountId: 2,
      ownerRef: 'line:U999'
    })
    const accountTwoExport = await service.handleCommand('export', {
      accountId: 2,
      ownerRef: 'telegram:999'
    })
    const accountOneCategories = await service.handleCommand('categories', {
      accountId: 1,
      ownerRef: 'telegram:123'
    })

    expect(accountTwoDraftConfirm).toEqual([
      {
        type: 'answer-callback',
        text: '草稿已過期或不存在！',
        showAlert: true
      }
    ])
    expect(accountTwoCategories).toEqual([
      {
        type: 'reply-text',
        text: '📂 目前沒有任何帳目分類喔！'
      }
    ])
    expect(accountTwoExport).toEqual([
      {
        type: 'reply-text',
        text: '目前沒有任何記帳紀錄。'
      }
    ])
    expect(accountOneCategories).toEqual([
      {
        type: 'reply-text',
        text: '📂 你的所有分類如下：\n- Meals'
      }
    ])
  })

  it('does not let account b edit or delete account a expenses by reply id', async () => {
    const db = new InMemoryAccountingDb()
    const mealsCategoryId = await db.createCategory(1, 'Meals')
    const expenseId = await db.insertExpense({
      account_id: 1,
      user_id: 'telegram:123',
      date: '2026-03-28',
      item: 'Dinner',
      amount: 280,
      category_id: mealsCategoryId
    })

    const service = createService(db, {
      action: 'error',
      message: 'NOT_EXPENSE'
    })

    const editActions = await service.handleMessage(
      { accountId: 2, ownerRef: 'line:U999' },
      {
        text: '金額改成 999',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null,
        replyAnchorText: `✅ 已記錄支出！ (ID: #${expenseId})`,
        replyText: '金額改成 999'
      }
    )
    const deleteActions = await service.handleMessage(
      { accountId: 2, ownerRef: 'line:U999' },
      {
        text: '刪掉',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null,
        replyAnchorText: `✅ 已記錄支出！ (ID: #${expenseId})`,
        replyText: '刪掉'
      }
    )

    expect(editActions).toEqual([
      {
        type: 'reply-text',
        text: `❌ 找不到指定的帳目 #${expenseId}！`
      }
    ])
    expect(deleteActions).toEqual([
      {
        type: 'reply-text',
        text: `❌ 找不到指定的帳目 #${expenseId}！`
      }
    ])
    expect(await db.getExpense(expenseId, 1)).toMatchObject({
      item: 'Dinner',
      amount: 280
    })
  })
})
