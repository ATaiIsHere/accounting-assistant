# Change Proposal: Add Provider-Neutral Bootstrap And Pairing

## Assumption

The current multi-account foundation already exists or is being completed:

- internal `accounts` own bookkeeping data
- `account_identities` maps external provider identities to one account
- Telegram and LINE are the first supported direct-chat providers
- unlinked provider identities are currently rejected unless an admin has provisioned them in advance

This follow-up proposal assumes:

- any supported messaging provider should be able to act as the first entrypoint for a user
- once a user has one linked provider, they should be able to pair additional providers onto the same ledger
- first-time account creation should still stay private and controlled, not open to arbitrary public signup

## Why

- Manual verification showed the current Telegram path works, but LINE still replies `line 帳號尚未授權，請聯繫管理者綁定` unless the LINE identity was pre-provisioned.
- A Telegram-only trust anchor is too narrow for the product direction. Supported providers should not have different first-class status for account creation.
- Requiring an admin to discover every provider-specific external user ID before a person can start is too operationally expensive, even for a small rollout.
- We need two related capabilities:
  - a provider-neutral bootstrap path for creating a new private ledger from any supported chat service
  - a provider-neutral pairing path for linking more services to an already existing account

## What Changes

- Add a provider-neutral bootstrap flow so an approved user can create a new private ledger from any supported direct-chat provider.
- Add persistent bootstrap state so the system can issue, validate, expire, and consume single-use invite codes safely.
- Add a provider-neutral pairing flow so any already-linked provider identity can issue a short-lived code for linking another provider to the same account.
- Add persistent pairing state so the system can issue, validate, expire, and consume single-use pairing codes safely.
- Keep admin provisioning as a supported bootstrap and recovery path.
- Preserve strict account isolation: bootstrap may create only one new account for one approved user, and pairing may extend one account to a new provider identity, but neither flow may steal an identity already linked elsewhere.

## Expected Impact

- User-facing: a person can start their ledger from any supported chat provider after redeeming a bootstrap invite, then later link more providers onto the same ledger without admin help
- Code paths: `src/index.ts`, `src/adapters/telegram.ts`, `src/adapters/line.ts`, `src/core/db.ts`, `src/core/accounting.ts`, `schema.sql`, migrations, admin scripts, tests, and manual verification docs
- Operations: provisioning remains available, but normal day-to-day onboarding shifts toward invite-based bootstrap plus user-driven pairing

## Risks

- Bootstrap and pairing codes both need careful expiry and single-use behavior to avoid accidental or malicious reuse.
- A bootstrap flow that is too permissive would effectively turn the bot into public signup, which is not the desired rollout model.
- Provider-specific command syntax needs to be explicit enough that unauthorized messages do not accidentally collide with normal accounting input.
- Replacing an already linked provider identity needs clear rules; silently overwriting an existing identity would be unsafe.

## Out Of Scope

- Public self-service signup without an invite or approval gate
- Group or room based bootstrap or pairing
- Web UI for viewing or managing linked identities
- Full identity replacement or unlink flows unless needed to support the initial pairing safety model
