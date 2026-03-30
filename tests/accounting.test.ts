import { describe, expect, it, vi } from 'vitest'
import { AccountingService } from '../src/core/accounting'

function createService(overrides: Partial<Record<string, any>> = {}) {
  const db = {
    getMonthlySummary: vi.fn().mockResolvedValue(456),
    getCategories: vi.fn().mockResolvedValue([{ id: 1, name: 'Food' }]),
    getAllExpenses: vi.fn().mockResolvedValue([
      {
        id: 1,
        date: '2026-03-28',
        item: 'Lunch',
        amount: 120,
        category_name: 'Food',
        raw_message: 'lunch 120'
      }
    ]),
    getExpense: vi.fn().mockResolvedValue({
      id: 9,
      account_id: 1,
      date: '2026-03-28',
      item: 'Lunch',
      amount: 120,
      category_id: 1
    }),
    deleteExpense: vi.fn().mockResolvedValue(true),
    updateExpense: vi.fn().mockResolvedValue(true),
    getCategoryByName: vi.fn().mockResolvedValue(1),
    createCategory: vi.fn().mockResolvedValue(2),
    deleteCategoryAndReassign: vi.fn().mockResolvedValue(undefined),
    insertExpense: vi.fn().mockResolvedValue(77),
    savePendingExpense: vi.fn().mockResolvedValue(undefined),
    getPendingExpense: vi.fn().mockResolvedValue({
      draft_id: 'draft-1',
      account_id: 1,
      user_id: '123',
      date: '2026-03-28',
      item: 'Tea',
      amount: 65,
      suggested_category: 'Drinks',
      raw_message: 'tea 65'
    }),
    deletePendingExpense: vi.fn().mockResolvedValue(undefined),
    queryExpenses: vi.fn().mockResolvedValue('📋 查詢結果：\n共 1 筆消費，總計：$120'),
    ...overrides
  }

  const parseExpense = vi.fn()
  const parseExpenseUpdate = vi.fn()

  const service = new AccountingService(
    db as any,
    {
      geminiApiKey: 'mock-key',
      timezoneOffsetMs: 8 * 60 * 60 * 1000
    },
    {
      parseExpense,
      parseExpenseUpdate,
      generateDraftId: () => 'draft-fixed'
    }
  )

  return { service, db, parseExpense, parseExpenseUpdate }
}

describe('AccountingService', () => {
  it('returns document action for export command', async () => {
    const { service } = createService()

    const actions = await service.handleCommand('export', {
      accountId: 1,
      ownerRef: '123'
    })

    expect(actions).toHaveLength(1)
    expect(actions[0]?.type).toBe('reply-document')
    expect(actions[0]).toMatchObject({ filename: 'expenses.csv' })
  })

  it('creates direct insert action when suggested category exists', async () => {
    const { service, db, parseExpense } = createService()
    parseExpense.mockResolvedValue({
      action: 'insert',
      data: {
        date: '2026-03-28',
        item: 'Lunch',
        amount: 120,
        suggested_category: 'Food'
      }
    })

    const actions = await service.handleMessage(
      { accountId: 1, ownerRef: '123' },
      {
        text: '午餐 120',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null
      }
    )

    expect(db.insertExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: 1,
        user_id: '123',
        item: 'Lunch',
        amount: 120
      })
    )
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'reply-text'
      })
    ])
  })

  it('creates draft confirmation action when suggested category does not exist', async () => {
    const { service, db, parseExpense } = createService({
      getCategoryByName: vi.fn().mockResolvedValue(null)
    })
    parseExpense.mockResolvedValue({
      action: 'insert',
      data: {
        date: '2026-03-28',
        item: 'Tea',
        amount: 65,
        suggested_category: 'Drinks'
      }
    })

    const actions = await service.handleMessage(
      { accountId: 1, ownerRef: '123' },
      {
        text: '飲料 65',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null
      }
    )

    expect(db.savePendingExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        draft_id: 'draft-fixed',
        account_id: 1,
        suggested_category: 'Drinks'
      })
    )
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'reply-inline-options'
      })
    ])
  })

  it('updates replied expense through shared edit flow', async () => {
    const { service, db, parseExpenseUpdate } = createService()
    parseExpenseUpdate.mockResolvedValue({
      amount: 200
    })

    const actions = await service.handleMessage(
      { accountId: 1, ownerRef: '123' },
      {
        text: '金額改成 200',
        imageBuffer: null,
        imageMime: null,
        mediaReference: null,
        replyAnchorText: '✅ 已記錄支出！ (ID: #9)',
        replyText: '金額改成 200'
      }
    )

    expect(db.updateExpense).toHaveBeenCalledWith(9, 1, expect.objectContaining({ amount: 200 }))
    expect(actions).toEqual([
      expect.objectContaining({
        type: 'reply-text'
      })
    ])
  })

  it('returns safe callback alert when draft no longer exists', async () => {
    const { service } = createService({
      getPendingExpense: vi.fn().mockResolvedValue(null)
    })

    const actions = await service.handleCallback(
      { accountId: 1, ownerRef: '123' },
      'confirm_draft:missing'
    )

    expect(actions).toEqual([
      {
        type: 'answer-callback',
        text: '草稿已過期或不存在！',
        showAlert: true
      }
    ])
  })
})
