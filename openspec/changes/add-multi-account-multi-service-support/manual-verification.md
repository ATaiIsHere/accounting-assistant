# Manual Verification Runbook

This runbook covers the remaining OpenSpec verification items:

- `8.2` Manually review Telegram behavior for regressions after adapter extraction
- `8.3` Manually verify the same account sees the same ledger from Telegram and LINE
- `8.4` Manually verify different accounts cannot see each other's data

Use this against a real deployed environment with actual Telegram and LINE identities.

## Preconditions

Before starting, confirm all of the following:

- `npm run migrate:remote` has been applied to the target database
- `npm run deploy` has completed successfully
- `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, and `LINE_CHANNEL_SECRET` are configured
- LINE webhook is active in LINE Developers Console
- You know the real Telegram user ID and LINE user ID for each tester

Recommended tester setup:

- Account A: one human with both Telegram and LINE
- Account B: a second human with at least Telegram; LINE is recommended but optional

## Provision Test Accounts

Provision Account A with both Telegram and LINE:

```bash
npm run provision:account -- --remote --env production \
  --account-slug account-a \
  --display-name "Account A" \
  --telegram-user-id <telegram_user_id_a> \
  --line-user-id <line_user_id_a>
```

Provision Account B:

```bash
npm run provision:account -- --remote --env production \
  --account-slug account-b \
  --display-name "Account B" \
  --telegram-user-id <telegram_user_id_b> \
  --line-user-id <line_user_id_b>
```

If Account B has no LINE identity yet, omit `--line-user-id`.

## Optional DB Inspection Commands

Inspect provisioned accounts:

```bash
npx wrangler d1 execute DB --remote --command "
SELECT a.id, a.slug, ai.provider, ai.external_user_id
FROM accounts a
JOIN account_identities ai ON ai.account_id = a.id
ORDER BY a.slug, ai.provider;"
```

Inspect expenses by account:

```bash
npx wrangler d1 execute DB --remote --command "
SELECT e.account_id, e.id, e.date, e.item, e.amount, c.name AS category_name
FROM expenses e
LEFT JOIN categories c ON c.id = e.category_id
ORDER BY e.account_id, e.id;"
```

## 8.2 Telegram Regression Review

Use Account A on Telegram private chat only.

### Commands

1. Send `/start`
Expected: onboarding text renders normally.

2. Send `/help`
Expected: markdown help text renders correctly.

3. Send `/summary`
Expected: returns current month total without error.

4. Send `/categories`
Expected: returns category list or empty-state text.

5. Send `/export`
Expected: receives `expenses.csv` if records exist, otherwise empty-state text.

### Insert and query flows

1. Send `午餐 120`
Expected: expense is recorded and success message includes an expense ID.

2. Send `這個月吃飯花多少？`
Expected: query result returns only Account A data.

3. Send a receipt or invoice photo
Expected: image is parsed and either:
- a record is created directly, or
- a draft confirmation prompt appears

### Draft flow

1. Trigger a new category suggestion, for example `飲料 65`
Expected: inline confirmation prompt appears.

2. Tap `建立並記帳`
Expected: draft is converted into a real expense and the new category is created.

3. Trigger another draft and tap `取消`
Expected: draft is removed and no expense is created.

### Reply edit and delete flows

1. Reply to a previous success message with `金額改成 200`
Expected: the referenced expense updates correctly.

2. Reply to the same success message with `刪掉`
Expected: the referenced expense is deleted.

3. Reply to an expense ID that belongs to another account, if available
Expected: Telegram does not mutate the foreign expense and returns `找不到指定的帳目`.

### Category delete and reassignment

1. Create at least two categories in Account A.
2. Send `幫我刪掉<某分類>分類`
3. Choose a reassignment target from the inline keyboard.
Expected: old category is removed and linked expenses move to the chosen category.

## 8.3 Same Account Across Telegram And LINE

Use Account A only. The goal is to prove Telegram and LINE point to the same `account_id`.

### Telegram -> LINE

1. In Telegram, send `早餐 80`
2. In LINE, send `/summary`
Expected: LINE summary includes the Telegram-created amount.

3. In LINE, send `/categories`
Expected: categories include the Telegram-created category.

### LINE -> Telegram

1. In LINE, send `晚餐 220`
2. In Telegram, send `/summary`
Expected: Telegram summary includes the LINE-created amount.

3. In Telegram, send `/categories`
Expected: categories include the LINE-created category.

### Shared draft ownership

1. In LINE, send a message that creates a draft, for example `手搖飲 55`
2. Complete the draft from LINE using the quick reply option
3. In Telegram, send `/categories` and `/summary`
Expected: the new category and expense are visible from Telegram immediately.

### Shared export visibility

1. In Telegram, run `/export`
Expected: CSV includes LINE-created records.

2. In LINE, run `/export`
Expected: LINE replies with the text fallback indicating export should be done from Telegram.

## 8.4 Different Account Isolation

Use both Account A and Account B.

### Data visibility

1. In Account A, create a few expenses from Telegram and LINE.
2. In Account B, run `/summary` and `/categories`.
Expected: Account B does not see Account A totals or categories.

3. In Account B, run `/export`.
Expected: CSV or empty state includes only Account B records.

### Mutation isolation

1. In Account A, note an expense ID from a success message.
2. In Account B, reply to a local success message or attempt to reproduce a foreign edit path with that ID.
Expected: Account B cannot edit or delete Account A expenses.

3. In Account B, trigger a new draft.
4. In Account A, confirm or cancel Account B's draft ID if you can reproduce the callback path.
Expected: Account A cannot mutate Account B drafts.

### Unauthorized identity

1. Send a Telegram message from an unprovisioned user.
Expected: no ledger access and no mutation occurs.

2. Send a LINE message from an unprovisioned user.
Expected: receives the unauthorized reply and no ledger mutation occurs.

3. Send a LINE group or room message.
Expected: event is ignored and no ledger mutation occurs.

## Result Template

Record the final result like this:

```md
## Verification Result

- Date:
- Environment:
- Verified by:

### 8.2 Telegram Regression
- Pass/Fail:
- Notes:

### 8.3 Same Account Across Telegram And LINE
- Pass/Fail:
- Notes:

### 8.4 Different Account Isolation
- Pass/Fail:
- Notes:
```
