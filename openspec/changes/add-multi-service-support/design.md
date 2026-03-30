# Design: Add Multi-Service Support

## Context

The current implementation mixes three concerns in `src/index.ts`:

- Telegram webhook transport handling
- Telegram-specific UX and callback behavior
- accounting application logic

That coupling makes every new provider expensive to add. The first change should restructure the system around a provider-agnostic accounting core so channel support can grow without rewriting the expense workflow each time.

## Goals

- Support more than one messaging service without duplicating bookkeeping logic.
- Preserve current Telegram behavior during the refactor.
- Allow a single owner to access the same expense ledger from all approved services.
- Make new providers additive by implementing adapters instead of rewriting the core flow.

## Non-Goals

- Building a generic bot framework for every possible messaging platform
- Multi-user tenancy
- Reworking the AI parsing model beyond what is needed to remove Telegram-specific coupling
- Adding every Telegram feature to every provider on day one

## Proposed Approach

### 1. Introduce a channel-neutral domain model

- Define a normalized inbound event shape for the accounting core, for example:
  - provider
  - external user id
  - logical owner id
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

### 2. Extract the accounting application core

- Move the expense parsing and command decision flow out of direct grammY handlers.
- Keep database access in `CoreDB`, but stop letting transport-specific user identities leak into ledger ownership.
- Return normalized response intents from the core so adapters can render them in provider-specific ways.

### 3. Refactor Telegram into an adapter

- Keep the current `/webhook/telegram` route.
- Convert Telegram messages, photos, replies, and callback queries into normalized input events.
- Convert response intents back into grammY replies, inline keyboards, and documents.
- Preserve current user-visible behavior as the baseline compatibility target.

### 4. Add a second provider adapter

- Add a second webhook route for the assumed first additional provider: LINE.
- Validate LINE webhook signatures and credentials independently of Telegram.
- Map LINE text, image, and interactive events into the same normalized input model.
- Render response intents using LINE-compatible reply patterns.
- Where a provider lacks an exact Telegram equivalent, preserve the business outcome with the closest safe UX.

### 5. Unify ledger ownership across providers

- Introduce a logical owner identity that is not the raw provider user id.
- Use provider-specific allowlists or configured external ids for authentication, but persist records under the shared logical owner id.
- Keep existing data accessible by using a backward-compatible owner-id strategy or a one-time migration approach.

## Configuration Changes

- Keep `TELEGRAM_BOT_TOKEN` for Telegram
- Add provider-specific credentials for LINE
- Add channel-specific allowed external user ids
- Add or formalize a logical ledger owner id, so all approved services map to the same data owner

## Tradeoffs

- Extracting a core service first is more work than bolting a second provider into the current file, but it prevents deeper lock-in.
- A logical owner id adds a little configuration complexity, but it avoids splitting one person's books across multiple service identities.
- Provider-specific interactive UX will never be perfectly identical; the correct goal is behavioral equivalence, not pixel-level parity.

## Verification Strategy

- Add tests around the extracted accounting core using normalized input events.
- Add regression coverage for current Telegram text/photo/edit/category flows after the refactor.
- Add adapter-level tests for the second provider.
- Verify that an expense inserted through one provider can be queried from another provider using the same ledger.
