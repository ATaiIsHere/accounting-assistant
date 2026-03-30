import type { D1Database } from '@cloudflare/workers-types';

export interface ExpenseData {
  id?: number;
  account_id: number;
  user_id?: string;
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
  account_id: number;
  user_id?: string;
  date: string;
  item: string;
  amount: number;
  suggested_category: string;
  raw_message?: string;
  media_reference?: string;
}

function buildLegacyUserId(accountId: number, userId?: string): string {
  return userId?.trim() || `account:${accountId}`;
}

export class CoreDB {
  constructor(private db: D1Database) {}

  async getAccountIdByIdentity(provider: string, externalUserId: string): Promise<number | null> {
    const result = await this.db.prepare(`
      SELECT a.id as account_id
      FROM account_identities ai
      JOIN accounts a ON a.id = ai.account_id
      WHERE ai.provider = ?
        AND ai.external_user_id = ?
        AND ai.is_active = 1
        AND a.status = 'active'
      LIMIT 1
    `).bind(provider, externalUserId).first<{ account_id: number }>();

    return result?.account_id ?? null;
  }

  async ensureLegacyTelegramAccount(externalUserId: string): Promise<number> {
    const slug = `legacy-${externalUserId}`;
    const displayName = `Legacy Account ${externalUserId}`;

    await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO accounts (slug, display_name, status)
        VALUES (?, ?, 'active')
      `).bind(slug, displayName),
      this.db.prepare(`
        INSERT OR IGNORE INTO account_identities (
          account_id,
          provider,
          external_user_id,
          chat_scope,
          is_active
        )
        SELECT id, 'telegram', ?, 'direct', 1
        FROM accounts
        WHERE slug = ?
      `).bind(externalUserId, slug)
    ]);

    const accountId = await this.getAccountIdByIdentity('telegram', externalUserId);
    if (!accountId) {
      throw new Error(`Failed to resolve legacy Telegram account for ${externalUserId}`);
    }

    return accountId;
  }

  async getCategories(accountId: number): Promise<{ id: number; name: string }[]> {
    const { results } = await this.db.prepare(
      'SELECT id, name FROM categories WHERE account_id = ?'
    ).bind(accountId).all();
    return (results || []) as { id: number; name: string }[];
  }

  async getCategoryByName(accountId: number, name: string): Promise<number | null> {
    const category = await this.db.prepare(
      'SELECT id FROM categories WHERE account_id = ? AND name = ?'
    ).bind(accountId, name).first();
    return category ? (category.id as number) : null;
  }

  async createCategory(accountId: number, name: string, userId?: string): Promise<number> {
    const { meta } = await this.db.prepare(
      'INSERT INTO categories (user_id, account_id, name) VALUES (?, ?, ?)'
    ).bind(buildLegacyUserId(accountId, userId), accountId, name).run();
    return meta.last_row_id as number;
  }

  async deleteCategoryAndReassign(accountId: number, oldCatId: number, newCatId: number | null, userId?: string): Promise<void> {
    let targetCatId = newCatId
    if (!targetCatId) {
      let uncat = await this.getCategoryByName(accountId, '未分類')
      if (!uncat) {
        uncat = await this.createCategory(accountId, '未分類', userId)
      }
      targetCatId = uncat
    }

    // Cloudflare D1 batch simulation of transaction
    await this.db.batch([
      this.db.prepare('UPDATE expenses SET category_id = ? WHERE category_id = ? AND account_id = ?').bind(targetCatId, oldCatId, accountId),
      this.db.prepare('DELETE FROM categories WHERE id = ? AND account_id = ?').bind(oldCatId, accountId)
    ])
  }

  async insertExpense(expense: ExpenseData): Promise<number> {
    const { meta } = await this.db.prepare(
      'INSERT INTO expenses (user_id, account_id, date, item, amount, category_id, raw_message, media_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      buildLegacyUserId(expense.account_id, expense.user_id),
      expense.account_id,
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
      'INSERT INTO pending_expenses (draft_id, user_id, account_id, date, item, amount, suggested_category, raw_message, media_reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      pending.draft_id,
      buildLegacyUserId(pending.account_id, pending.user_id),
      pending.account_id,
      pending.date,
      pending.item,
      pending.amount,
      pending.suggested_category,
      pending.raw_message || null,
      pending.media_reference || null
    ).run();
  }

  async getPendingExpense(draftId: string, accountId: number): Promise<PendingExpense | null> {
    const result = await this.db.prepare(
      'SELECT * FROM pending_expenses WHERE draft_id = ? AND account_id = ?'
    ).bind(draftId, accountId).first();
    return result as PendingExpense | null;
  }

  async deletePendingExpense(draftId: string, accountId: number): Promise<void> {
    await this.db.prepare(
      'DELETE FROM pending_expenses WHERE draft_id = ? AND account_id = ?'
    ).bind(draftId, accountId).run();
  }

  async updateExpenseAmount(id: number, amount: number, accountId: number): Promise<boolean> {
    const { meta } = await this.db.prepare(
      'UPDATE expenses SET amount = ? WHERE id = ? AND account_id = ?'
    ).bind(amount, id, accountId).run();
    return meta.changes ? meta.changes > 0 : false;
  }

  async updateExpense(id: number, accountId: number, updates: Partial<ExpenseData>): Promise<boolean> {
    const sets: string[] = []
    const params: any[] = []

    if (updates.date !== undefined) { sets.push('date = ?'); params.push(updates.date) }
    if (updates.item !== undefined) { sets.push('item = ?'); params.push(updates.item) }
    if (updates.amount !== undefined) { sets.push('amount = ?'); params.push(updates.amount) }
    if (updates.category_id !== undefined) { sets.push('category_id = ?'); params.push(updates.category_id) }

    if (sets.length === 0) return false;

    const sql = `UPDATE expenses SET ${sets.join(', ')} WHERE id = ? AND account_id = ?`
    params.push(id, accountId)

    const { meta } = await this.db.prepare(sql).bind(...params).run()
    return meta.changes ? meta.changes > 0 : false;
  }

  async getExpense(id: number, accountId: number): Promise<ExpenseData | null> {
    const result = await this.db.prepare(
      'SELECT * FROM expenses WHERE id = ? AND account_id = ?'
    ).bind(id, accountId).first();
    return result as ExpenseData | null;
  }

  async deleteExpense(id: number, accountId: number): Promise<boolean> {
    const { meta } = await this.db.prepare(
      'DELETE FROM expenses WHERE id = ? AND account_id = ?'
    ).bind(id, accountId).run();
    return meta.changes ? meta.changes > 0 : false;
  }

  async getMonthlySummary(accountId: number, prefixDate: string): Promise<number> {
    const result = await this.db.prepare(
      "SELECT SUM(amount) as total FROM expenses WHERE account_id = ? AND date LIKE ?"
    ).bind(accountId, `${prefixDate}%`).first();
    return (result?.total as number) || 0;
  }

  async getAllExpenses(accountId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT e.id, e.date, e.item, e.amount, c.name as category_name, e.raw_message 
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      WHERE e.account_id = ?
      ORDER BY e.date DESC, e.id DESC
    `).bind(accountId).all();
    return results || [];
  }

  async queryExpenses(accountId: number, filters: QueryFilters): Promise<string> {
    const conditions = ['e.account_id = ?']
    const params: any[] = [accountId]

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
      const cat = await this.db.prepare('SELECT id FROM categories WHERE account_id = ? AND name = ?')
        .bind(accountId, filters.category_name)
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
