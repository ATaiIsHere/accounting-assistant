import { env } from 'cloudflare:test';
import { expect, test, beforeAll } from 'vitest';
import { CoreDB } from '../src/core/db';

beforeAll(async () => {
  const schema = `
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
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
  
  // 1. Create Categories
  const catId1 = await db.createCategory(userId, 'Food');
  const catId2 = await db.createCategory(userId, 'Transport');
  
  const cats = await db.getCategories(userId);
  expect(cats.length).toBeGreaterThanOrEqual(2);

  // 2. Insert Expense
  const expId = await db.insertExpense({
    user_id: userId,
    date: '2026-03-26',
    item: 'Taxi',
    amount: 250,
    category_id: catId2
  });
  expect(expId).toBeGreaterThan(0);

  // 3. Delete Category and Reassign
  await db.deleteCategoryAndReassign(userId, catId2, catId1);

  // 4. Verify Reassignment
  const exps = await db.getAllExpenses(userId);
  const targetExp = exps.find(e => e.id === expId);
  expect(targetExp).toBeDefined();
  expect(targetExp.category_name).toBe('Food'); // Transport was replaced by Food
});

test('CoreDB dynamic Query', async () => {
  const db = new CoreDB(env.DB);
  const userId = 'query_user';
  
  const cid = await db.createCategory(userId, 'Snacks');
  await db.insertExpense({ user_id: userId, date: '2026-03-01', item: 'Chips', amount: 50, category_id: cid });
  await db.insertExpense({ user_id: userId, date: '2026-03-02', item: 'Cola', amount: 30, category_id: cid });

  const report = await db.queryExpenses(userId, { start_date: '2026-03-01', end_date: '2026-03-31' });
  expect(report).toContain('總計：$80');
});
