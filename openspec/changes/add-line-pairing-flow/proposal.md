# Change Proposal: Add Telegram-Initiated LINE Pairing

## Assumption

The current multi-account foundation already exists or is being completed:

- internal `accounts` own bookkeeping data
- `account_identities` maps external provider identities to one account
- Telegram is the existing trusted entrypoint for the first user
- LINE support exists, but only for identities that were provisioned in advance

This follow-up proposal assumes:

- initial Telegram access is still bootstrapped by admin provisioning or the current Telegram allowlist path
- regular users should not need an administrator to discover their LINE user ID before they can start using LINE
- the first self-service linking flow only needs to support `Telegram -> LINE`

## Why

- Manual verification showed the current Telegram path works, but LINE still replies `line 帳號尚未授權，請聯繫管理者綁定` unless the LINE identity was pre-provisioned.
- That behavior is safe, but it creates friction for the exact workflow we want: one person starts on Telegram, then adds LINE as a second client for the same ledger.
- Requiring an admin to look up and provision every LINE user ID does not scale well even for a 2 to 3 person rollout.
- A Telegram-initiated pairing flow keeps authorization anchored to an already trusted identity while letting the user finish the LINE linkage themselves.

## What Changes

- Add a short-lived LINE pairing flow initiated from an authorized Telegram private chat.
- Add persistent pairing state so the system can issue, validate, expire, and consume single-use pairing codes safely.
- Let an unlinked LINE direct-message user bind themselves to an existing account only by presenting a valid pairing code.
- Keep admin provisioning as a supported bootstrap and recovery path.
- Preserve strict account isolation: pairing may extend one account to a new LINE identity, but it must not reassign or steal an identity already linked to another account.

## Expected Impact

- User-facing: an existing Telegram user can self-link their LINE account without asking an admin to provision the LINE identity first
- Code paths: `src/index.ts`, `src/adapters/telegram.ts`, `src/adapters/line.ts`, `src/core/db.ts`, `src/core/accounting.ts`, `schema.sql`, migrations, tests, and manual verification docs
- Operations: provisioning remains available, but normal day-to-day onboarding to LINE shifts to a user-driven pairing flow

## Risks

- Pairing codes need careful expiry and single-use behavior to avoid accidental or malicious reuse.
- If the bind command on LINE is too loose, it could collide with normal message parsing or produce confusing UX for unauthorized users.
- Replacing an already linked LINE identity needs clear rules; silently overwriting an existing identity would be unsafe.
- Telegram remains the trust anchor for pairing, so the system still needs one approved Telegram path before self-service linking begins.

## Out Of Scope

- Creating a brand-new account only from LINE
- General invite flows for arbitrary future providers
- Group or room based pairing
- Web UI for viewing or managing linked identities
- Full identity replacement or unlink flows unless needed to support the initial pairing safety model
