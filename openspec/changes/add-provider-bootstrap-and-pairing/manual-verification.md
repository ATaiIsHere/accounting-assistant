# Manual Verification Runbook

This runbook covers the remaining live-provider checks for `add-provider-bootstrap-and-pairing`.

Use this against a real deployed environment with actual Telegram and LINE identities. The implementation, database migrations, and admin scripts are already in place; this runbook is only for the final provider-side confirmation.

## Preconditions

Before starting, confirm all of the following:

- `npm run migrate:staging` or `npm run migrate:remote` has been applied to the target database
- the worker has been deployed successfully
- `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, and `LINE_CHANNEL_SECRET` are configured
- Telegram and LINE webhooks are active
- you know the real Telegram user ID and LINE user ID for each tester

Recommended tester setup:

- Account A: one human with both Telegram and LINE
- Account B: a second human with at least one provider for isolation checks

## Bootstrap Invite Setup

Create an invite for a Telegram-first tester:

```bash
npm run bootstrap:invite -- --remote --env production \
  --account-slug account-a \
  --display-name "Account A"
```

Create an invite for a LINE-first tester the same way if needed, using a different `account-slug`.

## Provider-Neutral Bootstrap

### Telegram-first bootstrap

1. Send `/create <invite-code>` from an unlinked Telegram private chat.
Expected: the bot replies that the private ledger was created successfully.

2. Send `/summary`.
Expected: the account responds normally and no unauthorized fallback appears.

### LINE-first bootstrap

1. Send `建立帳本 <invite-code>` from an unlinked LINE direct chat.
Expected: the account is created successfully.

2. Send `/summary`.
Expected: the account responds normally and no unauthorized fallback appears.

## Pairing Flow

### Issue pairing code from an already linked provider

1. From any linked provider, issue a code:
   - Telegram: `/pair line` or `/pair telegram`
   - LINE: `配對 telegram` or `配對 line`
2. Confirm the reply includes a one-time pairing code and the expected target-provider instruction.

### Consume pairing code on the target provider

1. From the unlinked target provider, send `綁定 <pair-code>`.
2. Confirm the reply says pairing succeeded.
3. Immediately run `/summary` from both providers.
Expected: both providers return the same ledger totals for the same account.

## Reuse And Expiry

### Bootstrap invite reuse

1. Use a valid invite once.
2. Try the same invite again from a different unlinked identity.
Expected: the second attempt is rejected as used.

### Pairing code reuse

1. Pair a target provider successfully.
2. Try the same pairing code again from another identity on that target provider.
Expected: the second attempt is rejected as used.

### Expired codes

1. Generate a short-lived invite or pairing code.
2. Wait for expiry.
3. Try to use it after expiry.
Expected: the reply clearly states the code expired.

## DB Inspection Commands

Check account and identity mappings:

```bash
bunx wrangler d1 execute DB --remote --command "
SELECT a.id, a.slug, ai.provider, ai.external_user_id
FROM accounts a
JOIN account_identities ai ON ai.account_id = a.id
ORDER BY a.slug, ai.provider, ai.external_user_id;"
```

Check bootstrap code state:

```bash
bunx wrangler d1 execute DB --remote --command "
SELECT account_slug, status, claimed_provider, claimed_external_user_id, claimed_at
FROM account_bootstrap_codes
ORDER BY id DESC
LIMIT 20;"
```

Check pairing code state:

```bash
bunx wrangler d1 execute DB --remote --command "
SELECT account_id, target_provider, status, used_by_provider, used_by_external_user_id, used_at
FROM identity_pairing_codes
ORDER BY id DESC
LIMIT 20;"
```

## Operator Notes

- Admin scripts were smoke-tested from the terminal against staging after fixing `bunx`/`npx` fallback and remote D1 multi-statement execution.
- Unit coverage for bootstrap, pairing, and adapter behavior is green via `bunx vitest --config vitest.unit.config.ts run`.
- Live provider verification still requires real Telegram/LINE user sessions. A terminal-only automation run cannot impersonate end-user chats.
