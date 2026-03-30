# Tasks: Add Multi-Service Support

## 1. Channel model and configuration

- [ ] 1.1 Define a normalized inbound event type for provider-agnostic accounting flows.
- [ ] 1.2 Define normalized response intents for replies, files, confirmations, and errors.
- [ ] 1.3 Introduce configuration for provider-specific credentials and allowed external user ids.
- [ ] 1.4 Introduce or formalize a logical ledger owner id shared across providers.
- [ ] 1.5 Decide and document the backward-compatible strategy for existing Telegram-owned data.

## 2. Extract the accounting core

- [ ] 2.1 Move expense parsing and decision logic out of direct grammY handler branches.
- [ ] 2.2 Keep insert, query, edit, export, and category-management behaviors in the shared core.
- [ ] 2.3 Ensure the shared core accepts normalized events and returns normalized response intents.
- [ ] 2.4 Remove direct provider assumptions from the shared accounting logic.

## 3. Refactor Telegram into an adapter

- [ ] 3.1 Keep `/webhook/telegram` as the Telegram transport entrypoint.
- [ ] 3.2 Map Telegram text, photo, reply, and callback events into the shared input model.
- [ ] 3.3 Map shared response intents back into Telegram replies, documents, and inline keyboards.
- [ ] 3.4 Preserve current Telegram behavior as a regression baseline after the refactor.

## 4. Add the second provider adapter

- [ ] 4.1 Add a new webhook route for the assumed first additional provider, LINE.
- [ ] 4.2 Validate LINE signatures and credentials independently from Telegram.
- [ ] 4.3 Map LINE text and image events into the shared input model.
- [ ] 4.4 Implement LINE-compatible reply flows for summaries, exports, confirmations, and errors.
- [ ] 4.5 Provide a safe fallback when a Telegram-specific interaction pattern has no exact LINE equivalent.

## 5. Shared ledger behavior

- [ ] 5.1 Ensure all supported providers persist expenses under the same logical owner id.
- [ ] 5.2 Ensure category lists, pending drafts, and exports are shared across providers.
- [ ] 5.3 Ensure an expense inserted from one provider can be queried from another provider.
- [ ] 5.4 Ensure unauthorized users on any provider cannot access or mutate the ledger.

## 6. Tests

- [ ] 6.1 Add unit coverage for normalized event handling in the shared accounting core.
- [ ] 6.2 Add Telegram regression coverage for the refactored adapter path.
- [ ] 6.3 Add adapter-level coverage for the new LINE route.
- [ ] 6.4 Add end-to-end style coverage for cross-provider shared-ledger behavior.

## 7. Verification

- [ ] 7.1 Run the relevant automated tests.
- [ ] 7.2 Manually review Telegram behavior for regressions after adapter extraction.
- [ ] 7.3 Manually verify the same ledger is visible from both supported providers.
- [ ] 7.4 Mark completed items and record any intentionally deferred provider-parity gaps.
