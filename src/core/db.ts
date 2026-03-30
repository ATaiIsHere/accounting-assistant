import type { D1Database } from '@cloudflare/workers-types';

export interface ExpenseData {
  id?: number;
  user_id: string;
  date: string;
  item: string;
  amount: number;
  category_id?: number;
  raw_message?: string;
  media_reference?: string;
}

export interface QueryFilters {
  start_date?: string;
  end_date?: string;
  category_name?: string | null;
}

export interface PendingExpense {
  draft_id: string;
  user_id: string;
  date: string;
  item: string;
  amount: number;
  suggested_category: string;
  raw_message?: string;
  media_reference?: string;
}

export interface ExpenseRow {
  id: number;
  date: string;
  item: string;
  amount: number;
  category_name: string;
}

export interface CategorySummaryRow {
  category_name: string;
  total: number;
}

export class CoreDB {
  constructor(private db: D1Database) {}

  async getCategories(userId: string): Promise<{ id: number; name: string }[]> {
    const { results } = await this.db.prepare(
      'SELECT id, name FROM categories WHERE user_id = ?'
    ).bind(userId).all();
    return (results || []) as { id: number; name: string }[];
  }

  async getCategoryByName(userId: string, name: string): Promise<number | null> {
    const category = await this.db.prepare(
      'SELECT id FROM categories WHERE user_id = ? AND name = ?'
    ).bind(userId, name).first();
    return category ? (category.id as number) : null;
  }

  async createCategory(userId: string, name: string): Promise<number> {
    const { meta } = await this.db.prepare(
      'INSERT INTO categories (user_id, name) VALUES (?, ?)'
    ).bind(userId, name).run();
    return meta.last_row_id as number;
  }

  async deleteCategoryAndReassign(userId: string, oldCatId: number, newCatId: number | null): Promise<void> {
    let targetCatId = newCatId
    if (!targetCatId) {
      let uncat = await this.getCategoryByName(userId, '未分類')
      if (!uncat) {
        uncat = await this.createCategory(userId, '未分類')
      }
      targetCatId = uncat
    }

    // Cloudflare D1 batch simulation of transaction
    await this.db.batch([
      this.db.prepare('UPDATE expenses SET category_id = ? WHERE category_id = ? AND user_id = ?').bind(targetCatId, oldCatId, userId),
      this.db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').bind(oldCatId, userId)
    ])
  }

  async insertExpense(expense: ExpenseData): Promise<number> {
    const { meta } = await this.db.prepare(
      'INSERT INTO expenses (user_id, date, item, amount, category_id, raw_message, media_reference) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      expense.user_id,
      expense.date,
      expense.item,
      expense.amount,
      expense.category_id,
      expense.raw_message || null,
      expense.media_reference || null
    ).run();
    return meta.last_row_id as number;
  }

  async savePendingExpense(pending: PendingExpense): Promise<void> {
    await this.db.prepare(
      'INSERT INTO pending_expenses (draft_id, user_id, date, item, amount, suggested_category, raw_message, media_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      pending.draft_id,
      pending.user_id,
      pending.date,
      pending.item,
      pending.amount,
      pending.suggested_category,
      pending.raw_message || null,
      pending.media_reference || null
    ).run();
  }

  async getPendingExpense(draftId: string): Promise<PendingExpense | null> {
    const result = await this.db.prepare(
      'SELECT * FROM pending_expenses WHERE draft_id = ?'
    ).bind(draftId).first();
    return result as PendingExpense | null;
  }

  async deletePendingExpense(draftId: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM pending_expenses WHERE draft_id = ?'
    ).bind(draftId).run();
  }

  async updateExpenseAmount(id: number, amount: number, userId: string): Promise<boolean> {
    const { meta } = await this.db.prepare(
      'UPDATE expenses SET amount = ? WHERE id = ? AND user_id = ?'
    ).bind(amount, id, userId).run();
    return meta.changes ? meta.changes > 0 : false;
  }

  async updateExpense(id: number, userId: string, updates: Partial<ExpenseData>): Promise<boolean> {
    const sets: string[] = []
    const params: any[] = []

    if (updates.date !== undefined) { sets.push('date = ?'); params.push(updates.date) }
    if (updates.item !== undefined) { sets.push('item = ?'); params.push(updates.item) }
    if (updates.amount !== undefined) { sets.push('amount = ?'); params.push(updates.amount) }
    if (updates.category_id !== undefined) { sets.push('category_id = ?'); params.push(updates.category_id) }

    if (sets.length === 0) return false;

    const sql = `UPDATE expenses SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
    params.push(id, userId)

    const { meta } = await this.db.prepare(sql).bind(...params).run()
    return meta.changes ? meta.changes > 0 : false;
  }

  async getExpense(id: number, userId: string): Promise<ExpenseData | null> {
    const result = await this.db.prepare(
      'SELECT * FROM expenses WHERE id = ? AND user_id = ?'
    ).bind(id, userId).first();
    return result as ExpenseData | null;
  }

  async deleteExpense(id: number, userId: string): Promise<boolean> {
    const { meta } = await this.db.prepare(
      'DELETE FROM expenses WHERE id = ? AND user_id = ?'
    ).bind(id, userId).run();
    return meta.changes ? meta.changes > 0 : false;
  }

  async getMonthlySummary(userId: string, prefixDate: string): Promise<number> {
    const result = await this.db.prepare(
      "SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date LIKE ?"
    ).bind(userId, `${prefixDate}%`).first();
    return (result?.total as number) || 0;
  }

  async getAllExpenses(userId: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT e.id, e.date, e.item, e.amount, c.name as category_name, e.raw_message 
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ?
      ORDER BY e.date DESC, e.id DESC
    `).bind(userId).all();
    return results || [];
  }

  async listExpenses(userId: string, filters: QueryFilters): Promise<ExpenseRow[]> {
    const conditions = ['e.user_id = ?']
    const params: Array<string | number> = [userId]

    if (filters.start_date) {
      conditions.push('e.date >= ?')
      params.push(filters.start_date)
    }

    if (filters.end_date) {
      conditions.push('e.date <= ?')
      params.push(filters.end_date)
    }

    if (filters.category_name) {
      conditions.push('c.name = ?')
      params.push(filters.category_name)
    }

    const sql = `
      SELECT
        e.id,
        e.date,
        e.item,
        e.amount,
        c.name AS category_name
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.date DESC, e.id DESC
    `

    const { results } = await this.db.prepare(sql).bind(...params).all<ExpenseRow>()
    return (results || []) as ExpenseRow[]
  }

  async getCategorySummaryByMonth(userId: string, year: string, month: string): Promise<CategorySummaryRow[]> {
    const prefix = `${year}-${month.padStart(2, '0')}`
    const { results } = await this.db.prepare(`
      SELECT
        c.name AS category_name,
        SUM(e.amount) AS total
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.user_id = ? AND e.date LIKE ?
      GROUP BY c.id, c.name
      ORDER BY total DESC, c.name ASC
    `).bind(userId, `${prefix}%`).all<CategorySummaryRow>()

    return (results || []) as CategorySummaryRow[]
  }

  async queryExpenses(userId: string, filters: QueryFilters): Promise<string> {
    const conditions = ['e.user_id = ?']
    const params: any[] = [userId]

    if (filters.start_date) {
      conditions.push('e.date >= ?')
      params.push(filters.start_date)
    }
    if (filters.end_date) {
      conditions.push('e.date <= ?')
      params.push(filters.end_date)
    }
    
    let categoryPrefix = ''
    if (filters.category_name) {
      const cat = await this.db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?')
        .bind(userId, filters.category_name)
        .first<{ id: number }>()
      if (cat) {
        conditions.push('e.category_id = ?')
        params.push(cat.id)
        categoryPrefix = `【${filters.category_name}】`
      } else {
        return `找不到分類「${filters.category_name}」的相關紀錄喔。`
      }
    }

    const whereClause = conditions.join(' AND ')
    const sql = `
      SELECT SUM(e.amount) as total, COUNT(e.id) as count
      FROM expenses e
      WHERE ${whereClause}
    `
    const result = await this.db.prepare(sql).bind(...params).first<{total: number; count: number}>()
    
    const total = result?.total || 0
    const count = result?.count || 0
    if (count === 0) return '指定區間內沒有任何消費紀錄喔！'

    let groupReport = ''
    if (!filters.category_name) {
      const groupSql = `
        SELECT c.name as category_name, SUM(e.amount) as subtotal
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        WHERE ${whereClause}
        GROUP BY e.category_id
        ORDER BY subtotal DESC
      `
      const groups = await this.db.prepare(groupSql).bind(...params).all<{category_name: string, subtotal: number}>()
      if (groups.results && groups.results.length > 0) {
         groupReport = '\\n\\n📊 分類統計：\\n' + groups.results.map((g: any) => `- ${g.category_name || '未分類'}: $${g.subtotal}`).join('\\n')
      }
    }

    let title = '📋 查詢結果：\\n'
    if (filters.start_date && filters.end_date && filters.start_date === filters.end_date) title = `📋 ${filters.start_date} ${categoryPrefix}查詢結果：\\n`
    else if (filters.start_date || filters.end_date) title = `📋 ${filters.start_date || '?'} 至 ${filters.end_date || '?'} ${categoryPrefix}查詢結果：\\n`
    else if (filters.category_name) title = `📋 所有時間 ${categoryPrefix}查詢結果：\\n`

    return `${title}共 ${count} 筆消費，總計：$${total}${groupReport}`
  }
}
