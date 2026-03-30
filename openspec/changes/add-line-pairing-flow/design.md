# Design: Add Telegram-Initiated LINE Pairing

## Context

The current multi-account design intentionally kept onboarding simple by relying on admin-managed provisioning. That is sufficient for the first Telegram identity, but it breaks down for the next expected step:

- a user is already trusted on Telegram
- the same user wants to start using LINE
- the system does not yet know that user's LINE external identity

Manual verification confirmed this gap. Telegram flows passed, while LINE requests from the same person were rejected as unauthorized because `account_identities` had no `line` mapping for that account.

This change adds a self-service extension path without weakening the existing authorization model:

- Telegram remains the trusted identity used to initiate pairing
- LINE remains unauthorized until the user proves possession of a valid short-lived pairing code
- the final ledger ownership still resolves through `account_identities`

## Goals

- Let an already authorized Telegram user link one LINE direct-chat identity to the same internal account.
- Avoid requiring an admin to pre-discover and provision LINE user IDs for normal use.
- Keep the pairing flow safe, single-use, and time-limited.
- Preserve existing admin provisioning for bootstrap and recovery.
- Maintain strict account isolation and prevent identity takeover.

## Non-Goals

- Self-service account creation from LINE alone
- A fully generic provider-linking framework for every future provider
- Group, room, or multi-user pairing
- Full self-service unlink or replacement UX in the first iteration
- Eliminating admin provisioning entirely

## Scope Decisions

### Telegram remains the trust anchor

The first self-service pairing flow should start only from an already authorized Telegram private chat. This keeps the trust model simple:

- Telegram access already maps to a known `account_id`
- the user requests a pairing code from within that trusted account
- LINE can only attach to that account by presenting the issued code

This means pairing extends an existing account. It does not create a new account from scratch.

### LINE direct chat only

The LINE side of pairing must accept codes only from one-on-one `user` sources. Group and room sources should continue to be ignored or rejected, because they do not provide the same clear one-person ownership model.

### One active LINE identity per account in v1

To keep ownership rules obvious, v1 should treat LINE as a single active direct-chat identity per account. If an account already has an active LINE identity:

- `/pair line` should return a clear `already linked` response
- replacement remains an admin or follow-up flow, not an implicit overwrite

This avoids accidental account sharing and prevents ambiguous "which LINE account owns this ledger" behavior.

## Proposed Data Model

Add a pairing-state table, for example `identity_pairing_codes`:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `account_id INTEGER NOT NULL REFERENCES accounts(id)`
- `target_provider TEXT NOT NULL`
- `code_hash TEXT NOT NULL UNIQUE`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `expires_at DATETIME NOT NULL`
- `used_at DATETIME`
- `used_by_external_user_id TEXT`
- `requested_via_provider TEXT NOT NULL DEFAULT 'telegram'`
- `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`

Recommended indexes:

- index on `(target_provider, status, expires_at)`
- index on `(account_id, target_provider, status)`

Recommended status values:

- `pending`
- `used`
- `expired`
- `revoked`

### Why store a hash instead of the raw code

The user-facing code should be short and human-enterable, but the database does not need to store it in plaintext. Storing `code_hash` reduces exposure if logs or DB output are inspected. The application can:

- generate a short human-readable code
- hash it with SHA-256 or HMAC before storage
- compare hashes on LINE submission

## Pairing Code Rules

- Default lifetime: 10 minutes
- Single-use: once consumed, it cannot be reused
- One active pending code per `(account_id, target_provider)` at a time
- Issuing a new LINE code revokes older pending LINE codes for the same account
- Codes are case-insensitive if that improves usability, but normalization must happen before hashing

Recommended user-visible format:

- Telegram command: `/pair line`
- LINE bind message: `綁定 <配對碼>`

Using an explicit `綁定` prefix is safer than treating any random short text as a pairing attempt, because unauthorized LINE users may otherwise collide with normal accounting-like text.

## Request Flow

### 1. Issue pairing code from Telegram

1. Telegram adapter receives `/pair line` from a private chat.
2. The system resolves the caller to an existing `account_id`.
3. The system checks whether that account already has an active LINE identity.
4. If yes, return an `already linked` reply and stop.
5. Otherwise, revoke any older pending LINE pairing code for that account.
6. Generate a new short code, hash it, store it with expiry, and return instructions.
7. Telegram replies with:
   - the pairing code
   - expiry window
   - clear instruction to open the LINE bot and send `綁定 <配對碼>`

### 2. Consume pairing code from LINE

1. LINE adapter receives a direct-message text event.
2. If the LINE user is already linked, route to the normal accounting flow.
3. If not linked, check whether the text matches the pairing command shape.
4. If it does not match, return the current unauthorized reply.
5. If it matches, normalize and hash the submitted code.
6. Look up a `pending` unexpired pairing record for `target_provider = 'line'`.
7. Re-check that:
   - the pairing row is still pending
   - the target account does not already have another active LINE identity
   - this LINE external user ID is not linked to another account
8. Insert the new `account_identities` row for the LINE user.
9. Mark the pairing row as `used`, set `used_at`, and record `used_by_external_user_id`.
10. Reply with a success message in Traditional Chinese.

## Conflict Handling

### Invalid or expired code

If the code does not exist, is expired, is revoked, or is already used:

- do not create any identity mapping
- return a clear failure message
- instruct the user to go back to Telegram and issue a new code

Application behavior may lazily mark stale rows as `expired` during lookup or by a cleanup step later. The important part is that expired rows are never treated as valid.

### LINE identity already linked elsewhere

If the incoming LINE `external_user_id` already belongs to another account:

- reject the pairing request
- do not move the identity
- return a message indicating that this LINE account is already linked

### Account already has another LINE identity

If the target account already has an active LINE identity:

- reject the pairing request even if the code is otherwise valid
- do not overwrite the existing mapping
- instruct the user to contact an admin or use a future replacement flow

## Interaction Design

### Telegram copy

Telegram should explain the flow plainly in Traditional Chinese, for example:

- issue success
- expiry window
- exact LINE command to send
- warning that the code is single-use

### LINE copy

LINE should have distinct replies for:

- pairing success
- invalid code
- expired code
- already linked LINE identity
- account already has a linked LINE
- general unauthorized access without a pairing command

## Persistence And Migration Notes

- This change is additive to the existing multi-account schema.
- No bookkeeping rows need to move.
- Existing `accounts` and `account_identities` remain the source of truth after pairing succeeds.
- Admin provisioning scripts should continue to work unchanged, though later they may optionally gain visibility into active pairing states.

## Testing Strategy

- DB tests for issuing, revoking, expiring, and consuming pairing codes
- Telegram adapter tests for `/pair line`
- LINE adapter tests for successful binding and safe failure paths
- Isolation tests proving one account cannot steal another account's LINE identity
- Manual verification proving:
  - Telegram can issue a code
  - LINE can consume it
  - the same account sees one shared ledger afterward

## Tradeoffs

- This adds state and one extra user step, but removes the need for admins to look up LINE user IDs manually.
- Limiting v1 to one active LINE identity per account is stricter than the underlying schema could allow, but it keeps ownership semantics obvious.
- Telegram remains required for self-service linking, but that is a deliberate trust anchor rather than an arbitrary restriction.
