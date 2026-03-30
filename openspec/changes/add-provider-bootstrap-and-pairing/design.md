# Design: Add Provider-Neutral Bootstrap And Pairing

## Context

The current multi-account design intentionally kept onboarding simple by relying on admin-managed provisioning. That made the first rollout safer, but it breaks down in two places:

- a person may want to start from LINE instead of Telegram
- a person who already uses one provider may later want to add another provider without admin help

Manual verification confirmed the gap. Telegram flows passed, while LINE requests from the same person were rejected as unauthorized because `account_identities` had no `line` mapping for that account.

This change expands the onboarding model without weakening authorization:

- any supported provider can bootstrap a new account, but only through a controlled bootstrap invite
- any already-linked provider can issue a short-lived pairing code for another provider
- the final ledger ownership still resolves through `account_identities`

## Goals

- Let an approved user create a new account from any supported direct-chat provider.
- Let an already linked provider identity attach another provider to the same internal account.
- Avoid requiring an admin to pre-discover and provision provider-specific user IDs for normal use.
- Keep bootstrap and pairing flows safe, single-use, and time-limited.
- Preserve existing admin provisioning for bootstrap and recovery.
- Maintain strict account isolation and prevent identity takeover.

## Non-Goals

- Public signup without an approval gate
- A fully generic provider-linking framework for every future provider on day one
- Group, room, or multi-user bootstrap/pairing
- Full self-service unlink or replacement UX in the first iteration
- Eliminating admin provisioning entirely

## Scope Decisions

### Bootstrap must stay closed, not public

If any supported provider can be the first entrypoint, there still needs to be a trust gate before a new ledger is created. The safest v1 design is invite-based bootstrap:

- an admin generates a short-lived bootstrap invite code out of band
- the user redeems that code from Telegram or LINE
- successful redemption creates the `accounts` row and the first `account_identities` row together

This keeps onboarding private without requiring the admin to know the provider-specific external user ID up front.

### Any linked provider can issue a pairing code

Once a user has at least one linked provider identity, that provider becomes a trusted path for issuing a pairing code for another provider. This makes the model symmetric:

- Telegram can pair LINE
- LINE can pair Telegram
- future providers can follow the same pattern if they support direct-chat commands safely

### Direct chats only in v1

Bootstrap and pairing should accept commands only from one-on-one direct chats:

- Telegram private chats
- LINE one-on-one chats with the official account

Group and room contexts remain out of scope because ownership is ambiguous there.

### One active direct-chat identity per provider per account in v1

To keep ownership rules obvious, v1 should treat each provider as a single active direct-chat identity per account. If an account already has an active identity for the target provider:

- pairing code issuance should return `already linked`
- consuming a valid pairing code should also reject if the target provider became linked in the meantime
- replacement remains an admin or follow-up flow, not an implicit overwrite

This avoids accidental account sharing and ambiguous "which Telegram or LINE identity owns this ledger" behavior.

## Proposed Data Model

Add a bootstrap-state table, for example `account_bootstrap_codes`:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `account_slug TEXT NOT NULL`
- `display_name TEXT NOT NULL`
- `code_hash TEXT NOT NULL UNIQUE`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `expires_at DATETIME NOT NULL`
- `claimed_account_id INTEGER REFERENCES accounts(id)`
- `claimed_provider TEXT`
- `claimed_external_user_id TEXT`
- `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- `claimed_at DATETIME`

Recommended status values:

- `pending`
- `used`
- `expired`
- `revoked`

Add a pairing-state table, for example `identity_pairing_codes`:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `account_id INTEGER NOT NULL REFERENCES accounts(id)`
- `target_provider TEXT NOT NULL`
- `code_hash TEXT NOT NULL UNIQUE`
- `status TEXT NOT NULL DEFAULT 'pending'`
- `expires_at DATETIME NOT NULL`
- `used_at DATETIME`
- `used_by_provider TEXT`
- `used_by_external_user_id TEXT`
- `requested_via_provider TEXT NOT NULL`
- `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`

Recommended indexes:

- `account_bootstrap_codes(code_hash)`
- `account_bootstrap_codes(status, expires_at)`
- index on `(target_provider, status, expires_at)`
- index on `(account_id, target_provider, status)`

### Why store hashes instead of raw codes

Bootstrap invites and pairing codes should be short and human-enterable, but the database does not need to store them in plaintext. Storing `code_hash` reduces exposure if logs or DB output are inspected. The application can:

- generate a short human-readable code
- hash it with SHA-256 or HMAC before storage
- compare hashes on bootstrap or pairing submission

## Bootstrap Invite Rules

- Default lifetime: longer than pairing codes, for example 24 hours
- Single-use
- May be generated by admin tooling with the target `account_slug` and `display_name`
- Creating a new invite for the same intended account may revoke older pending invites, depending on the operator workflow

Recommended user-visible intent:

- Telegram command example: `/create <邀請碼>`
- LINE command example: `建立帳本 <邀請碼>`

Adapters may offer provider-specific syntax, but the shared concept is: an unlinked user redeems a bootstrap invite to create their account from that provider.

## Pairing Code Rules

- Default lifetime: 10 minutes
- Single-use: once consumed, it cannot be reused
- One active pending code per `(account_id, target_provider)` at a time
- Issuing a new code for a target provider revokes older pending codes for that same target provider on the same account
- Codes are case-insensitive if that improves usability, but normalization must happen before hashing

Recommended user-visible format:

- issue command examples:
  - Telegram: `/pair line`
  - LINE: `配對 telegram`
- bind command example on the target provider:
  - `綁定 <配對碼>`

Using explicit verbs like `建立帳本`, `配對`, and `綁定` is safer than treating arbitrary short text as bootstrap or pairing input, because unauthorized users might otherwise collide with normal accounting-like text.

## Request Flow

### 1. Bootstrap a new account from any supported provider

1. An unlinked user sends a provider-specific bootstrap command in a supported direct chat.
2. The adapter extracts the invite code and normalizes it.
3. The system checks whether the external identity is already linked.
4. If already linked, return a clear `already initialized` response and stop.
5. The system validates the bootstrap invite:
   - pending
   - unexpired
   - unused
6. The system creates a new `accounts` row using the invite metadata.
7. The system creates the first `account_identities` row using the current provider and external user ID.
8. The bootstrap invite is marked as `used`, with the claiming provider and external user ID recorded.
9. The adapter replies with success instructions and a brief explanation that more providers can be linked later.

### 2. Issue a pairing code from any linked provider

1. A linked user sends a provider-specific pair command from a supported direct chat.
2. The system resolves the caller to an existing `account_id`.
3. The system checks whether the account already has an active identity for the requested target provider.
4. If yes, return an `already linked` reply and stop.
5. Otherwise, revoke any older pending pairing code for that account and target provider.
6. Generate a new short code, hash it, store it with expiry, and return instructions for the target provider.

### 3. Consume the pairing code on the target provider

1. An unlinked user on the target provider sends `綁定 <配對碼>` in a supported direct chat.
2. If that external identity is already linked, route to the normal accounting flow or return an `already linked` response.
3. Normalize and hash the submitted code.
4. Look up a `pending` unexpired pairing record for the target provider.
5. Re-check that:
   - the pairing row is still pending
   - the target account still does not already have an active identity for this provider
   - this external user ID is not linked to another account
6. Insert the new `account_identities` row for the target provider.
7. Mark the pairing row as `used`, set `used_at`, and record the consuming provider and external user ID.
8. Reply with a success message in Traditional Chinese.

## Conflict Handling

### Invalid or expired bootstrap invite

If a bootstrap invite does not exist, is expired, is revoked, or is already used:

- do not create any account or identity mapping
- return a clear failure message
- instruct the user to contact the admin for a new invite

### Invalid or expired pairing code

If a pairing code does not exist, is expired, is revoked, or is already used:

- do not create any identity mapping
- return a clear failure message
- instruct the user to go back to any already linked provider and issue a new code

Application behavior may lazily mark stale rows as `expired` during lookup or by a cleanup step later. The important part is that expired rows are never treated as valid.

### Target provider identity already linked elsewhere

If the incoming external user ID already belongs to another account:

- reject the pairing request
- do not move the identity
- return a message indicating that this provider account is already linked

### Account already has another identity for that provider

If the target account already has an active identity for the target provider:

- reject the pairing request even if the code is otherwise valid
- do not overwrite the existing mapping
- instruct the user to contact an admin or use a future replacement flow

## Interaction Design

### Telegram copy

Telegram should explain the flow plainly in Traditional Chinese, for example:

- issue success
- expiry window
- exact target-provider bind command to send
- warning that the code is single-use

### Bootstrap copy

Bootstrap flows should have distinct replies for:

- bootstrap success
- invalid invite
- expired invite
- already initialized identity
- unsupported provider or chat scope

### Target-provider copy

The consuming provider should have distinct replies for:

- pairing success
- invalid code
- expired code
- already linked identity
- account already has a linked identity for that provider
- general unauthorized access without a pairing command

## Persistence And Migration Notes

- This change is additive to the existing multi-account schema.
- No bookkeeping rows need to move.
- Existing `accounts` and `account_identities` remain the source of truth after pairing succeeds.
- Admin provisioning scripts should continue to work unchanged, though later they may optionally gain subcommands for creating bootstrap invites and viewing active pairing states.

## Testing Strategy

- DB tests for issuing, revoking, expiring, and consuming bootstrap invites and pairing codes
- Adapter tests for provider-specific bootstrap commands
- Adapter tests for pairing code issuance from Telegram and LINE
- Adapter tests for successful binding and safe failure paths on the target provider
- Isolation tests proving one account cannot steal another account's provider identity
- Manual verification proving:
  - Telegram can bootstrap or pair successfully
  - LINE can bootstrap or pair successfully
  - the same account sees one shared ledger afterward regardless of bootstrap provider

## Tradeoffs

- This adds state and one extra bootstrap concept, but removes the need for admins to discover provider-specific user IDs manually.
- Invite-based bootstrap is less convenient than open registration, but it preserves the private multi-user rollout model.
- Limiting v1 to one active identity per provider per account is stricter than the underlying schema could allow, but it keeps ownership semantics obvious.
