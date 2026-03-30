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
- Reworking the AI parsing model beyond what is needed to remove Telegram-specific coupling
- Adding every Telegram feature to every provider on day one

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

### 7. Migrate existing single-user data

- Create a default internal account for the current Telegram user.
- Migrate existing `categories`, `expenses`, and `pending_expenses` rows so they belong to that account.
- Preserve the current data set while changing ownership from provider identity to account identity.

## Configuration Changes

- Keep `TELEGRAM_BOT_TOKEN` for Telegram
- Add provider-specific credentials for LINE
- Replace the single `ALLOWED_USER_ID` model with account/identity provisioning inputs
- If needed, add a bootstrap script or seed mechanism for creating accounts and linked identities

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
