import { env } from 'cloudflare:test';
import { expect, test, beforeAll } from 'vitest';
import { CoreDB } from '../src/core/db';

beforeAll(async () => {
  const schema = `
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS account_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_user_id TEXT NOT NULL,
      chat_scope TEXT NOT NULL DEFAULT 'direct',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, external_user_id)
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      account_id INTEGER REFERENCES accounts(id),
      date TEXT NOT NULL,
      item TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category_id INTEGER,
      raw_message TEXT,
      media_reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS pending_expenses (
      draft_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id INTEGER REFERENCES accounts(id),
      date TEXT NOT NULL,
      item TEXT NOT NULL,
      amount INTEGER NOT NULL,
      suggested_category TEXT NOT NULL,
      raw_message TEXT,
      media_reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      account_id INTEGER REFERENCES accounts(id),
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  const stmts = schema.split(';').filter(s => s.trim().length > 0);
  for (const stmt of stmts) {
     await env.DB.prepare(stmt).run();
  }
});

test('CoreDB category CRUD and Reassign', async () => {
  const db = new CoreDB(env.DB);
  const userId = 'test_user_123';
  const accountId = await db.ensureLegacyTelegramAccount(userId);
  
  // 1. Create Categories
  const catId1 = await db.createCategory(accountId, 'Food', userId);
  const catId2 = await db.createCategory(accountId, 'Transport', userId);
  
  const cats = await db.getCategories(accountId);
  expect(cats.length).toBeGreaterThanOrEqual(2);
  expect(await db.getAccountIdByIdentity('telegram', userId)).toBe(accountId);

  // 2. Insert Expense
  const expId = await db.insertExpense({
    account_id: accountId,
    user_id: userId,
    date: '2026-03-26',
    item: 'Taxi',
    amount: 250,
    category_id: catId2
  });
  expect(expId).toBeGreaterThan(0);

  // 3. Delete Category and Reassign
  await db.deleteCategoryAndReassign(accountId, catId2, catId1, userId);

  // 4. Verify Reassignment
  const exps = await db.getAllExpenses(accountId);
  const targetExp = exps.find(e => e.id === expId);
  expect(targetExp).toBeDefined();
  expect(targetExp.category_name).toBe('Food'); // Transport was replaced by Food
});

test('CoreDB dynamic Query', async () => {
  const db = new CoreDB(env.DB);
  const userId = 'query_user';
  const accountId = await db.ensureLegacyTelegramAccount(userId);
  
  const cid = await db.createCategory(accountId, 'Snacks', userId);
  await db.insertExpense({ account_id: accountId, user_id: userId, date: '2026-03-01', item: 'Chips', amount: 50, category_id: cid });
  await db.insertExpense({ account_id: accountId, user_id: userId, date: '2026-03-02', item: 'Cola', amount: 30, category_id: cid });

  const report = await db.queryExpenses(accountId, { start_date: '2026-03-01', end_date: '2026-03-31' });
  expect(report).toContain('總計：$80');
});

test('CoreDB isolates data by account_id', async () => {
  const db = new CoreDB(env.DB);
  const accountA = await db.ensureLegacyTelegramAccount('account_a');
  const accountB = await db.ensureLegacyTelegramAccount('account_b');

  const categoryA = await db.createCategory(accountA, 'Meals', 'account_a');
  await db.insertExpense({
    account_id: accountA,
    user_id: 'account_a',
    date: '2026-03-10',
    item: 'Lunch',
    amount: 100,
    category_id: categoryA
  });

  const reportA = await db.queryExpenses(accountA, { start_date: '2026-03-01', end_date: '2026-03-31' });
  const reportB = await db.queryExpenses(accountB, { start_date: '2026-03-01', end_date: '2026-03-31' });

  expect(reportA).toContain('總計：$100');
  expect(reportB).toContain('指定區間內沒有任何消費紀錄喔！');
});
