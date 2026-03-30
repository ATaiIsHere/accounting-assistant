# Design: Add Multi-Account Multi-Service Support

## Context

The current implementation mixes three concerns in `src/index.ts`:

- Telegram webhook transport handling
- Telegram-specific UX and callback behavior
- accounting application logic

It also hardcodes a single-user model:

- request access is gated by one `ALLOWED_USER_ID`
- bookkeeping rows are keyed by `user_id`
- that `user_id` currently behaves like a Telegram identity, not a stable internal account id

That means the system cannot safely support multiple people or multiple providers per person. The first change should restructure the system around:

- a provider-agnostic accounting core
- an internal account model
- explicit external identity mapping
- strict ledger isolation between accounts

## Goals

- Support more than one messaging service without duplicating bookkeeping logic.
- Support 2 to 3 distinct users with isolated ledgers.
- Preserve current Telegram behavior during the refactor.
- Allow one account to access the same expense ledger from all approved services.
- Make new providers additive by implementing adapters instead of rewriting the core flow.

## Non-Goals

- Building a generic bot framework for every possible messaging platform
- Self-service registration or a full user-management product
- Group chat or room support in the first rollout
- Reworking the AI parsing model beyond what is needed to remove Telegram-specific coupling
- Adding every Telegram feature to every provider on day one

## Scope Decisions

### One-to-one chats only in v1

The first rollout should support only direct one-to-one chats:

- Telegram private chats
- LINE one-on-one chats with the official account

This is the safest scope because account isolation depends on reliably resolving one external identity to one internal account. LINE's webhook model distinguishes `user`, `group`, and `room` sources, and `userId` is not always included in non-1:1 contexts. Keeping v1 to direct chats avoids ambiguous ownership and accidental cross-user exposure.

### Admin-managed provisioning for a small user set

The first rollout targets 2 to 3 known users. Provisioning should therefore be handled by an admin workflow rather than a user-facing signup or linking UI. This keeps the architecture simple while still supporting multiple people and multiple providers per person.

## Proposed Approach

### 1. Introduce a channel-neutral domain model

- Define a normalized inbound event shape for the accounting core, for example:
  - provider
  - external user id
  - account id
  - message type
  - text content
  - media metadata or binary reference
  - reply context
  - callback or postback payload
- Define normalized response intents, such as:
  - plain text reply
  - CSV/document reply
  - confirm draft creation
  - confirm category reassignment
  - acknowledgement or error

### 2. Introduce internal account ownership

- Add an `accounts` table for internal ledger owners.
- Add an `account_identities` table that maps:
  - `account_id`
  - `provider`
  - `external_user_id`
- Store expenses, categories, and pending drafts by `account_id`, not by provider identity.
- Enforce uniqueness on `(provider, external_user_id)` so one external identity cannot point to multiple accounts.

#### Proposed D1 schema shape

`accounts`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `slug TEXT NOT NULL UNIQUE`
- `display_name TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'active'`
- `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`

`account_identities`

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `account_id INTEGER NOT NULL REFERENCES accounts(id)`
- `provider TEXT NOT NULL`
- `external_user_id TEXT NOT NULL`
- `chat_scope TEXT NOT NULL DEFAULT 'direct'`
- `is_active INTEGER NOT NULL DEFAULT 1`
- `created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- `UNIQUE(provider, external_user_id)`

Bookkeeping table ownership changes

- `categories.account_id INTEGER NOT NULL REFERENCES accounts(id)`
- `expenses.account_id INTEGER NOT NULL REFERENCES accounts(id)`
- `pending_expenses.account_id INTEGER NOT NULL REFERENCES accounts(id)`

Updated uniqueness and lookup rules

- `categories`: `UNIQUE(account_id, name)`
- account-based indexes on expense date, category, and pending draft lookups

Legacy ownership columns

- Keep the current `user_id` columns temporarily during migration as deprecated fields.
- Switch application reads and writes to `account_id` first.
- Remove legacy columns in a later cleanup migration after the new model is stable.

### 3. Extract the accounting application core

- Move the expense parsing and command decision flow out of direct grammY handlers.
- Keep database access in `CoreDB`, but stop letting transport-specific user identities leak into ledger ownership.
- Return normalized response intents from the core so adapters can render them in provider-specific ways.

### 4. Refactor Telegram into an adapter

- Keep the current `/webhook/telegram` route.
- Convert Telegram messages, photos, replies, and callback queries into normalized input events.
- Resolve the caller's `account_id` from the configured Telegram external identity.
- Convert response intents back into grammY replies, inline keyboards, and documents.
- Preserve current user-visible behavior as the baseline compatibility target.

### 5. Add a second provider adapter

- Add a second webhook route for the assumed first additional provider: LINE.
- Validate LINE webhook signatures and credentials independently of Telegram.
- Map LINE text, image, and interactive events into the same normalized input model.
- Resolve the caller's `account_id` from the configured LINE external identity.
- Render response intents using LINE-compatible reply patterns.
- Where a provider lacks an exact Telegram equivalent, preserve the business outcome with the closest safe UX.

### 6. Introduce a small-scale provisioning model

- For the first version, provision accounts manually for the 2 to 3 expected users.
- Store each person's linked provider identities in D1 or a migration/seed workflow rather than building a full admin UI.
- Support one person linking both Telegram and LINE to the same account.
- Reject any provider identity that is not explicitly provisioned.

#### Recommended provisioning workflow

- Add a small admin script such as `scripts/provision-account.ts`.
- Allow the script to create or update:
  - one account
  - one or more linked identities
- Support both local and remote D1 targets.
- Keep actual identity values out of committed source by reading them from prompts, a local config file ignored by git, or command arguments supplied by the operator.

### 7. Migrate existing single-user data

- Create a default internal account for the current Telegram user.
- Migrate existing `categories`, `expenses`, and `pending_expenses` rows so they belong to that account.
- Preserve the current data set while changing ownership from provider identity to account identity.

#### Recommended migration plan

Phase 1: additive migration

- Create `accounts` and `account_identities`
- Add nullable `account_id` columns to `categories`, `expenses`, and `pending_expenses`
- Create the default account row for the current owner
- Insert one Telegram identity mapping for the current `ALLOWED_USER_ID`
- Backfill `account_id` on all existing bookkeeping rows
- Add new indexes and account-based uniqueness rules

Phase 2: application cutover

- Change the application to resolve `account_id` before every bookkeeping operation
- Change `CoreDB` queries to use `account_id`
- Replace the single `ALLOWED_USER_ID` gate with identity resolution

Phase 3: cleanup

- After verification, remove or stop relying on legacy `user_id` ownership fields
- If D1 table rebuilds are needed for cleanup, do them in a follow-up migration rather than mixing them into the riskier adapter refactor

## Request Processing Flow

1. Provider route receives the raw webhook request.
2. The route validates the provider-specific signature or secret.
3. The adapter rejects unsupported chat scopes, such as groups or rooms in v1.
4. The adapter extracts `provider` and `external_user_id`.
5. The system resolves the matching `account_id` from `account_identities`.
6. The adapter converts the provider event into the normalized inbound event.
7. The shared accounting core processes the event using `account_id`.
8. The adapter renders the returned response intents back into provider-specific replies.

## Configuration Changes

- Keep `TELEGRAM_BOT_TOKEN` for Telegram
- Add provider-specific credentials for LINE
- Replace the single `ALLOWED_USER_ID` model with account/identity provisioning inputs
- If needed, add a bootstrap script or seed mechanism for creating accounts and linked identities

### Provider-specific configuration expected in v1

- Telegram:
  - bot token
  - webhook secret token
- LINE:
  - channel access token
  - channel secret
- Shared:
  - provisioning target database
  - optional account seed source used only by admin tooling

### Provider integration notes

- Telegram:
  - Continue validating the webhook secret via `X-Telegram-Bot-Api-Secret-Token`
  - Resolve the external identity from the incoming `from.id`
  - Restrict v1 to private chats only
- LINE:
  - Validate `x-line-signature` against the raw request body using the channel secret
  - Resolve the external identity from `source.userId` on supported one-on-one events
  - Use the Messaging API content endpoint for image retrieval when media parsing is required
  - Use LINE reply messages and quick replies or postback actions where Telegram currently uses inline keyboards

## Tradeoffs

- Extracting a core service first is more work than bolting a second provider into the current file, but it prevents deeper lock-in.
- An internal account plus identity mapping adds configuration complexity, but it is the cleanest way to support both multi-service access and strict data isolation.
- Manual provisioning is less user-friendly than self-service onboarding, but it is the right scope for a 2 to 3 user rollout.
- Provider-specific interactive UX will never be perfectly identical; the correct goal is behavioral equivalence, not pixel-level parity.

## Verification Strategy

- Add tests around the extracted accounting core using normalized input events.
- Add regression coverage for current Telegram text/photo/edit/category flows after the refactor.
- Add adapter-level tests for the second provider.
- Verify that an expense inserted through one provider can be queried from another provider for the same account.
- Verify that account A cannot read or mutate account B's data from any provider.
- Verify that unsupported group or room events are safely ignored or rejected.
