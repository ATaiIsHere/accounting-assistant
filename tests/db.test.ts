import { env } from 'cloudflare:test';
import { expect, test, beforeAll } from 'vitest';
import { CoreDB, normalizeIdentityCode } from '../src/core/db';

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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_identities_active_direct_provider
      ON account_identities(account_id, provider)
      WHERE is_active = 1 AND chat_scope = 'direct';
    CREATE TABLE IF NOT EXISTS account_bootstrap_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_slug TEXT NOT NULL,
      display_name TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      claimed_account_id INTEGER REFERENCES accounts(id),
      claimed_provider TEXT,
      claimed_external_user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      claimed_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_account_bootstrap_codes_status_expires_at
      ON account_bootstrap_codes(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_account_bootstrap_codes_slug_status
      ON account_bootstrap_codes(account_slug, status);
    CREATE TABLE IF NOT EXISTS identity_pairing_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      target_provider TEXT NOT NULL,
      code_hash TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      used_by_provider TEXT,
      used_by_external_user_id TEXT,
      requested_via_provider TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_identity_pairing_codes_target_status_expires_at
      ON identity_pairing_codes(target_provider, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_identity_pairing_codes_account_target_status
      ON identity_pairing_codes(account_id, target_provider, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_pairing_codes_pending_account_target
      ON identity_pairing_codes(account_id, target_provider)
      WHERE status = 'pending';
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

test('CoreDB bootstrap invites normalize, revoke old pending codes, and create a new account', async () => {
  const db = new CoreDB(env.DB);
  const future = '2099-01-01T00:00:00.000Z';

  const firstInvite = await db.issueBootstrapInvite({
    account_slug: 'bootstrap-account-a',
    display_name: 'Bootstrap Account A',
    code: ' ab c123 ',
    expires_at: future
  });
  expect(firstInvite.status).toBe('pending');
  expect(await db.getBootstrapInviteByCode('ABC123')).toMatchObject({
    id: firstInvite.id,
    account_slug: 'bootstrap-account-a'
  });

  await db.issueBootstrapInvite({
    account_slug: 'bootstrap-account-a',
    display_name: 'Bootstrap Account A',
    code: 'NEW-123',
    expires_at: future
  });

  const revokedInvite = await db.getBootstrapInviteByCode('abc123');
  expect(revokedInvite?.status).toBe('revoked');
  expect(normalizeIdentityCode(' a b c123 ')).toBe('ABC123');

  const created = await db.consumeBootstrapInvite('line', 'line-bootstrap-a', 'new 123', '2026-03-30T00:00:00.000Z');
  expect(created).toMatchObject({ status: 'created' });
  if (created.status !== 'created') {
    throw new Error(`Expected bootstrap invite to create an account, got ${created.status}`);
  }

  expect(await db.getAccountIdByIdentity('line', 'line-bootstrap-a')).toBe(created.account_id);

  const usedResult = await db.consumeBootstrapInvite('telegram', 'tg-bootstrap-a', 'new123', '2026-03-30T00:01:00.000Z');
  expect(usedResult.status).toBe('used');
});

test('CoreDB bootstrap invites reject expired codes and already-linked identities', async () => {
  const db = new CoreDB(env.DB);

  await db.issueBootstrapInvite({
    account_slug: 'bootstrap-account-expired',
    display_name: 'Bootstrap Expired',
    code: 'EXPIRED-1',
    expires_at: '2026-03-01T00:00:00.000Z'
  });

  const expiredResult = await db.consumeBootstrapInvite(
    'telegram',
    'tg-bootstrap-expired',
    'expired1',
    '2026-03-30T00:00:00.000Z'
  );
  expect(expiredResult.status).toBe('expired');

  const expiredInvite = await db.getBootstrapInviteByCode('expired-1');
  expect(expiredInvite?.status).toBe('expired');

  const linkedAccountId = await db.ensureLegacyTelegramAccount('tg-bootstrap-existing');
  const alreadyLinked = await db.consumeBootstrapInvite(
    'telegram',
    'tg-bootstrap-existing',
    'expired1',
    '2026-03-30T00:00:00.000Z'
  );
  expect(alreadyLinked).toMatchObject({
    status: 'identity-already-linked',
    account_id: linkedAccountId
  });
});

test('CoreDB pairing codes revoke old pending codes, link target identities, and reject reused codes', async () => {
  const db = new CoreDB(env.DB);
  const sourceAccountId = await db.ensureLegacyTelegramAccount('pair-source-a');

  const firstPairing = await db.issuePairingCode({
    account_id: sourceAccountId,
    target_provider: 'line',
    requested_via_provider: 'telegram',
    code: 'PAIR-OLD',
    expires_at: '2099-01-01T00:00:00.000Z'
  });
  expect(firstPairing.status).toBe('pending');

  const secondPairing = await db.issuePairingCode({
    account_id: sourceAccountId,
    target_provider: 'line',
    requested_via_provider: 'telegram',
    code: 'pair new',
    expires_at: '2099-01-01T00:00:00.000Z'
  });
  expect(secondPairing.status).toBe('pending');

  const revokedPairing = await db.getPairingCodeByCode('pairold');
  expect(revokedPairing?.status).toBe('revoked');

  const linked = await db.consumePairingCode('line', 'line-pair-a', 'PAIRNEW', '2026-03-30T00:00:00.000Z');
  expect(linked).toMatchObject({
    status: 'linked',
    account_id: sourceAccountId
  });
  expect(await db.getAccountIdByIdentity('line', 'line-pair-a')).toBe(sourceAccountId);

  const usedResult = await db.consumePairingCode('line', 'line-pair-b', 'pair new', '2026-03-30T00:01:00.000Z');
  expect(usedResult.status).toBe('used');
});

test('CoreDB pairing codes reject expired codes, target-provider conflicts, and identity theft', async () => {
  const db = new CoreDB(env.DB);
  const accountA = await db.ensureLegacyTelegramAccount('pair-source-b');
  const accountB = await db.ensureLegacyTelegramAccount('pair-source-c');

  await db.addIdentityToAccount(accountB, 'line', 'line-already-b');

  await db.issuePairingCode({
    account_id: accountA,
    target_provider: 'line',
    requested_via_provider: 'telegram',
    code: 'PAIR-EXPIRED',
    expires_at: '2026-03-01T00:00:00.000Z'
  });

  const expiredResult = await db.consumePairingCode('line', 'line-expired-a', 'pair expired', '2026-03-30T00:00:00.000Z');
  expect(expiredResult.status).toBe('expired');

  await db.issuePairingCode({
    account_id: accountA,
    target_provider: 'line',
    requested_via_provider: 'telegram',
    code: 'PAIR-CONFLICT',
    expires_at: '2099-01-01T00:00:00.000Z'
  });

  const stolenIdentity = await db.consumePairingCode('line', 'line-already-b', 'pair conflict', '2026-03-30T00:00:00.000Z');
  expect(stolenIdentity).toMatchObject({
    status: 'identity-already-linked',
    account_id: accountB
  });

  await db.addIdentityToAccount(accountA, 'line', 'line-existing-a');
  const providerConflict = await db.consumePairingCode('line', 'line-new-a', 'pair conflict', '2026-03-30T00:00:00.000Z');
  expect(providerConflict).toMatchObject({
    status: 'provider-already-linked',
    account_id: accountA
  });
});
