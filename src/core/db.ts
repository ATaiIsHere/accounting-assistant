import type { D1Database } from '@cloudflare/workers-types';

export type CodeStatus = 'pending' | 'used' | 'expired' | 'revoked';

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

export interface AccountIdentity {
  id: number;
  account_id: number;
  provider: string;
  external_user_id: string;
  chat_scope: string;
  is_active: number;
  created_at: string;
}

export interface AccountBootstrapCode {
  id: number;
  account_slug: string;
  display_name: string;
  code_hash: string;
  status: CodeStatus;
  expires_at: string;
  claimed_account_id: number | null;
  claimed_provider: string | null;
  claimed_external_user_id: string | null;
  created_at: string;
  claimed_at: string | null;
}

export interface IdentityPairingCode {
  id: number;
  account_id: number;
  target_provider: string;
  code_hash: string;
  status: CodeStatus;
  expires_at: string;
  used_at: string | null;
  used_by_provider: string | null;
  used_by_external_user_id: string | null;
  requested_via_provider: string;
  created_at: string;
}

export interface BootstrapInviteInput {
  account_slug: string;
  display_name: string;
  code: string;
  expires_at: string;
}

export interface PairingCodeInput {
  account_id: number;
  target_provider: string;
  requested_via_provider: string;
  code: string;
  expires_at: string;
}

export type BootstrapInviteConsumeResult =
  | { status: 'created'; account_id: number }
  | { status: 'identity-already-linked'; account_id: number }
  | { status: 'account-slug-conflict' | 'invalid' | 'expired' | 'used' | 'revoked' };

export type PairingCodeConsumeResult =
  | { status: 'linked'; account_id: number }
  | { status: 'identity-already-linked'; account_id: number }
  | { status: 'provider-already-linked'; account_id: number }
  | { status: 'invalid' | 'expired' | 'used' | 'revoked' };

function buildLegacyUserId(accountId: number, userId?: string): string {
  return userId?.trim() || `account:${accountId}`;
}

function normalizeProviderName(provider: string): string {
  return provider.trim().toLowerCase();
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeIdentityCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) {
    throw new Error('Identity code cannot be empty');
  }

  return normalized;
}

export async function hashIdentityCode(code: string): Promise<string> {
  const normalized = normalizeIdentityCode(code);
  const payload = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return hexEncode(digest);
}

export class CoreDB {
  constructor(private db: D1Database) {}

  async getAccountIdByIdentity(provider: string, externalUserId: string): Promise<number | null> {
    const normalizedProvider = normalizeProviderName(provider);
    const result = await this.db.prepare(`
      SELECT a.id as account_id
      FROM account_identities ai
      JOIN accounts a ON a.id = ai.account_id
      WHERE ai.provider = ?
        AND ai.external_user_id = ?
        AND ai.is_active = 1
        AND a.status = 'active'
      LIMIT 1
    `).bind(normalizedProvider, externalUserId).first<{ account_id: number }>();

    return result?.account_id ?? null;
  }

  async getAccountIdentity(provider: string, externalUserId: string): Promise<AccountIdentity | null> {
    const normalizedProvider = normalizeProviderName(provider);
    const result = await this.db.prepare(`
      SELECT *
      FROM account_identities
      WHERE provider = ?
        AND external_user_id = ?
      LIMIT 1
    `).bind(normalizedProvider, externalUserId).first<AccountIdentity>();

    return result ?? null;
  }

  async getDirectIdentityForAccount(accountId: number, provider: string): Promise<AccountIdentity | null> {
    const normalizedProvider = normalizeProviderName(provider);
    const result = await this.db.prepare(`
      SELECT *
      FROM account_identities
      WHERE account_id = ?
        AND provider = ?
        AND chat_scope = 'direct'
        AND is_active = 1
      LIMIT 1
    `).bind(accountId, normalizedProvider).first<AccountIdentity>();

    return result ?? null;
  }

  async addIdentityToAccount(accountId: number, provider: string, externalUserId: string, chatScope = 'direct'): Promise<void> {
    const normalizedProvider = normalizeProviderName(provider);
    await this.db.prepare(`
      INSERT INTO account_identities (
        account_id,
        provider,
        external_user_id,
        chat_scope,
        is_active
      ) VALUES (?, ?, ?, ?, 1)
    `).bind(accountId, normalizedProvider, externalUserId, chatScope).run();
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

  async revokePendingBootstrapInvites(accountSlug: string): Promise<void> {
    await this.db.prepare(`
      UPDATE account_bootstrap_codes
      SET status = 'revoked'
      WHERE account_slug = ?
        AND status = 'pending'
    `).bind(accountSlug).run();
  }

  async issueBootstrapInvite(input: BootstrapInviteInput): Promise<AccountBootstrapCode> {
    const codeHash = await hashIdentityCode(input.code);

    await this.db.batch([
      this.db.prepare(`
        UPDATE account_bootstrap_codes
        SET status = 'revoked'
        WHERE account_slug = ?
          AND status = 'pending'
      `).bind(input.account_slug),
      this.db.prepare(`
        INSERT INTO account_bootstrap_codes (
          account_slug,
          display_name,
          code_hash,
          status,
          expires_at
        ) VALUES (?, ?, ?, 'pending', ?)
      `).bind(input.account_slug, input.display_name, codeHash, input.expires_at)
    ]);

    const invite = await this.getBootstrapInviteByCode(input.code);
    if (!invite) {
      throw new Error(`Failed to issue bootstrap invite for ${input.account_slug}`);
    }

    return invite;
  }

  async getBootstrapInviteByCode(code: string): Promise<AccountBootstrapCode | null> {
    const codeHash = await hashIdentityCode(code);
    const result = await this.db.prepare(`
      SELECT *
      FROM account_bootstrap_codes
      WHERE code_hash = ?
      LIMIT 1
    `).bind(codeHash).first<AccountBootstrapCode>();

    return result ?? null;
  }

  async consumeBootstrapInvite(
    provider: string,
    externalUserId: string,
    code: string,
    now = new Date().toISOString()
  ): Promise<BootstrapInviteConsumeResult> {
    const normalizedProvider = normalizeProviderName(provider);
    const linkedAccountId = await this.getAccountIdByIdentity(normalizedProvider, externalUserId);
    if (linkedAccountId) {
      return { status: 'identity-already-linked', account_id: linkedAccountId };
    }

    const invite = await this.getBootstrapInviteByCode(code);
    if (!invite) {
      return { status: 'invalid' };
    }

    if (invite.status !== 'pending') {
      return { status: invite.status };
    }

    if (invite.expires_at <= now) {
      await this.db.prepare(`
        UPDATE account_bootstrap_codes
        SET status = 'expired'
        WHERE id = ?
          AND status = 'pending'
      `).bind(invite.id).run();
      return { status: 'expired' };
    }

    const existingAccount = await this.db.prepare(`
      SELECT id
      FROM accounts
      WHERE slug = ?
      LIMIT 1
    `).bind(invite.account_slug).first<{ id: number }>();

    if (existingAccount) {
      return { status: 'account-slug-conflict' };
    }

    const { meta } = await this.db.prepare(`
      INSERT INTO accounts (slug, display_name, status)
      VALUES (?, ?, 'active')
    `).bind(invite.account_slug, invite.display_name).run();
    const accountId = meta.last_row_id as number;

    try {
      await this.addIdentityToAccount(accountId, normalizedProvider, externalUserId);
    } catch (error) {
      await this.db.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId).run();

      const identityAccountId = await this.getAccountIdByIdentity(normalizedProvider, externalUserId);
      if (identityAccountId) {
        return { status: 'identity-already-linked', account_id: identityAccountId };
      }

      throw error;
    }

    await this.db.prepare(`
      UPDATE account_bootstrap_codes
      SET status = 'used',
          claimed_account_id = ?,
          claimed_provider = ?,
          claimed_external_user_id = ?,
          claimed_at = ?
      WHERE id = ?
    `).bind(accountId, normalizedProvider, externalUserId, now, invite.id).run();

    return { status: 'created', account_id: accountId };
  }

  async revokePendingPairingCodes(accountId: number, targetProvider: string): Promise<void> {
    const normalizedProvider = normalizeProviderName(targetProvider);
    await this.db.prepare(`
      UPDATE identity_pairing_codes
      SET status = 'revoked'
      WHERE account_id = ?
        AND target_provider = ?
        AND status = 'pending'
    `).bind(accountId, normalizedProvider).run();
  }

  async issuePairingCode(input: PairingCodeInput): Promise<IdentityPairingCode> {
    const normalizedTargetProvider = normalizeProviderName(input.target_provider);
    const normalizedRequester = normalizeProviderName(input.requested_via_provider);
    const codeHash = await hashIdentityCode(input.code);

    await this.db.batch([
      this.db.prepare(`
        UPDATE identity_pairing_codes
        SET status = 'revoked'
        WHERE account_id = ?
          AND target_provider = ?
          AND status = 'pending'
      `).bind(input.account_id, normalizedTargetProvider),
      this.db.prepare(`
        INSERT INTO identity_pairing_codes (
          account_id,
          target_provider,
          code_hash,
          status,
          expires_at,
          requested_via_provider
        ) VALUES (?, ?, ?, 'pending', ?, ?)
      `).bind(
        input.account_id,
        normalizedTargetProvider,
        codeHash,
        input.expires_at,
        normalizedRequester
      )
    ]);

    const pairingCode = await this.getPairingCodeByCode(input.code);
    if (!pairingCode) {
      throw new Error(`Failed to issue pairing code for account ${input.account_id}`);
    }

    return pairingCode;
  }

  async getPairingCodeByCode(code: string): Promise<IdentityPairingCode | null> {
    const codeHash = await hashIdentityCode(code);
    const result = await this.db.prepare(`
      SELECT *
      FROM identity_pairing_codes
      WHERE code_hash = ?
      LIMIT 1
    `).bind(codeHash).first<IdentityPairingCode>();

    return result ?? null;
  }

  async consumePairingCode(
    targetProvider: string,
    externalUserId: string,
    code: string,
    now = new Date().toISOString()
  ): Promise<PairingCodeConsumeResult> {
    const normalizedTargetProvider = normalizeProviderName(targetProvider);
    const linkedAccountId = await this.getAccountIdByIdentity(normalizedTargetProvider, externalUserId);
    if (linkedAccountId) {
      return { status: 'identity-already-linked', account_id: linkedAccountId };
    }

    const pairingCode = await this.getPairingCodeByCode(code);
    if (!pairingCode || pairingCode.target_provider !== normalizedTargetProvider) {
      return { status: 'invalid' };
    }

    if (pairingCode.status !== 'pending') {
      return { status: pairingCode.status };
    }

    if (pairingCode.expires_at <= now) {
      await this.db.prepare(`
        UPDATE identity_pairing_codes
        SET status = 'expired'
        WHERE id = ?
          AND status = 'pending'
      `).bind(pairingCode.id).run();
      return { status: 'expired' };
    }

    const existingTargetIdentity = await this.getDirectIdentityForAccount(
      pairingCode.account_id,
      normalizedTargetProvider
    );
    if (existingTargetIdentity) {
      return { status: 'provider-already-linked', account_id: pairingCode.account_id };
    }

    try {
      await this.addIdentityToAccount(pairingCode.account_id, normalizedTargetProvider, externalUserId);
    } catch (error) {
      const identityAccountId = await this.getAccountIdByIdentity(normalizedTargetProvider, externalUserId);
      if (identityAccountId) {
        return { status: 'identity-already-linked', account_id: identityAccountId };
      }

      const replacementIdentity = await this.getDirectIdentityForAccount(
        pairingCode.account_id,
        normalizedTargetProvider
      );
      if (replacementIdentity) {
        return { status: 'provider-already-linked', account_id: pairingCode.account_id };
      }

      throw error;
    }

    await this.db.prepare(`
      UPDATE identity_pairing_codes
      SET status = 'used',
          used_at = ?,
          used_by_provider = ?,
          used_by_external_user_id = ?
      WHERE id = ?
    `).bind(now, normalizedTargetProvider, externalUserId, pairingCode.id).run();

    return { status: 'linked', account_id: pairingCode.account_id };
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
