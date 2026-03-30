# Tasks: Add Multi-Account Multi-Service Support

## 1. Account and identity model

- [x] 1.1 Define a normalized inbound event type for provider-agnostic accounting flows.
- [x] 1.2 Define normalized response intents for replies, files, confirmations, and errors.
- [x] 1.3 Design the `accounts` table for internal ledger ownership.
- [x] 1.4 Design the `account_identities` table for provider-to-account mapping.
- [x] 1.5 Decide and document the migration strategy from provider-based `user_id` ownership to `account_id` ownership.
- [x] 1.6 Lock the first rollout scope to one-to-one Telegram and LINE chats only.

## 2. Schema and provisioning

- [x] 2.1 Update `schema.sql` for internal accounts and identity mapping.
- [x] 2.2 Update bookkeeping tables so expenses, categories, and pending drafts are owned by `account_id`.
- [x] 2.3 Add constraints or indexes that prevent one external identity from being linked to multiple accounts.
- [x] 2.4 Define the first-version provisioning flow for 2 to 3 manually managed users.
- [x] 2.5 Backfill or migrate the current single-user Telegram data into the new account model.
- [x] 2.6 Add or design an admin provisioning script for creating accounts and linked identities.

## 3. Extract the accounting core

- [x] 3.1 Move expense parsing and decision logic out of direct grammY handler branches.
- [x] 3.2 Keep insert, query, edit, export, and category-management behaviors in the shared core.
- [x] 3.3 Ensure the shared core accepts normalized events and returns normalized response intents.
- [x] 3.4 Remove direct provider assumptions from the shared accounting logic.
- [x] 3.5 Resolve `account_id` before invoking shared bookkeeping behavior.

## 4. Refactor Telegram into an adapter

- [x] 4.1 Keep `/webhook/telegram` as the Telegram transport entrypoint.
- [x] 4.2 Map Telegram text, photo, reply, and callback events into the shared input model.
- [x] 4.3 Resolve Telegram `external_user_id` to the correct `account_id`.
- [x] 4.4 Map shared response intents back into Telegram replies, documents, and inline keyboards.
- [x] 4.5 Preserve current Telegram behavior as a regression baseline after the refactor.

## 5. Add the LINE adapter

- [x] 5.1 Add a new webhook route for LINE.
- [x] 5.2 Validate LINE signatures and credentials independently from Telegram.
- [x] 5.3 Map only LINE one-on-one text and image events into the shared input model for v1.
- [x] 5.4 Resolve LINE `external_user_id` to the correct `account_id`.
- [x] 5.5 Implement LINE-compatible reply flows for summaries, exports, confirmations, and errors.
- [x] 5.6 Provide a safe fallback when a Telegram-specific interaction pattern has no exact LINE equivalent.
- [x] 5.7 Ignore or reject unsupported LINE group and room events safely.

## 6. Isolation and cross-service behavior

- [x] 6.1 Ensure one account can access the same ledger from both Telegram and LINE.
- [x] 6.2 Ensure categories, pending drafts, and exports are shared only within the same account.
- [x] 6.3 Ensure account A cannot query, edit, export, or delete account B's data.
- [x] 6.4 Ensure unauthorized identities on any provider cannot access or mutate any ledger.

## 7. Tests

- [x] 7.1 Add unit coverage for account resolution and normalized event handling in the shared accounting core.
- [x] 7.2 Add Telegram regression coverage for the refactored adapter path.
- [x] 7.3 Add adapter-level coverage for the new LINE route.
- [x] 7.4 Add coverage proving one account shares a ledger across Telegram and LINE.
- [x] 7.5 Add coverage proving two different accounts remain fully isolated.
- [x] 7.6 Add coverage proving unsupported group or room events do not enter the shared ledger flow.

## 8. Verification

- [x] 8.1 Run the relevant automated tests.
- [x] 8.2 Manually review Telegram behavior for regressions after adapter extraction.
- [x] 8.3 Manually verify the same account sees the same ledger from Telegram and LINE.
- [x] 8.4 Manually verify different accounts cannot see each other's data.
- [x] 8.5 Mark completed items and record any intentionally deferred provider-parity gaps.

Runbook:
- `openspec/changes/add-multi-account-multi-service-support/manual-verification.md`

Verification notes:

- 2026-03-30 staging: Telegram `/start`, expense insert, and `/summary` were manually rechecked after the adapter extraction and behaved as expected.
- 2026-03-30 staging: the same account successfully paired Telegram with LINE, and `/summary` matched across both providers immediately after pairing.
- 2026-03-31 staging: `Account B` (`syuan-chen`) was provisioned with an independent Telegram identity, and `/summary`, `/categories`, plus a new expense insert all confirmed the ledger remained isolated from `Account A`.

## Deferred parity gaps

- LINE export currently falls back to a text instruction because LINE has no direct Telegram-style document delivery equivalent in the current adapter.
- LINE postback flows currently render callback alerts and edit results as visible text replies because LINE has no exact equivalent to Telegram callback alerts or message edits.
- Provider-neutral bootstrap and pairing were verified on 2026-03-30 in change `add-provider-bootstrap-and-pairing`, so fresh cross-service onboarding no longer depends on pre-provisioned identities.
