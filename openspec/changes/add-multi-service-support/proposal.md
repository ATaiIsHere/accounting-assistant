# Change Proposal: Add Multi-Service Support

## Assumption

The original placeholder feature has been replaced with the user's actual priority: **support multiple messaging services instead of staying Telegram-only**.

This proposal assumes:

- Telegram remains a supported channel
- LINE is the first additional service to target, because the product is Traditional Chinese and Taiwan-oriented
- the long-term goal is a provider-agnostic accounting core that can accept more channels later

## Why

- The current implementation is tightly coupled to Telegram webhook, message, and reply mechanics.
- Channel lock-in makes the product harder to grow and forces business logic to be rewritten for every new platform.
- A shared accounting core would let one user manage the same ledger from whichever service is most convenient.

## What Changes

- Extract the accounting workflow from Telegram-specific transport logic into a channel-neutral application core.
- Introduce a normalized inbound message model and normalized response intents.
- Keep Telegram support working through a Telegram adapter.
- Add support for at least one additional service adapter, assumed here to be LINE.
- Ensure all supported services operate on the same underlying ledger rather than splitting data by platform-specific user ID.
- Define provider-specific authentication and webhook validation while preserving a single-owner bookkeeping model.

## Expected Impact

- User-facing: the same bookkeeping assistant can be used from more than one chat platform
- Code paths: `src/index.ts`, `src/core/db.ts`, `src/core/gemini.ts`, tests, configuration, webhook routing
- Infrastructure: continues to run on Cloudflare Workers, but adds provider-specific credentials and webhook handling for multiple services

## Risks

- Different services have different webhook, media, identity, and interactive-message capabilities.
- The current data model uses `user_id` in a way that is tied to the incoming platform identity; this can fragment one user's ledger across services if not redesigned.
- Existing Telegram behavior could regress during adapter extraction if the refactor is not protected by tests.

## Out Of Scope

- A standalone web or mobile client
- Multi-user shared ledgers
- Full feature parity for every future provider in this first change
- Voice-note support unless it naturally falls out of a provider's already supported message types
