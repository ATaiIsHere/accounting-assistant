# Change Proposal: Add Multi-Account Multi-Service Support

## Assumption

The current priority is:

- support multiple messaging services instead of staying Telegram-only
- support 2 to 3 distinct users
- let each user connect their own Telegram and LINE identities
- keep each user's bookkeeping data fully isolated

This proposal assumes:

- Telegram remains a supported channel
- LINE is the first additional service to target, because the product is Traditional Chinese and Taiwan-oriented
- each person may bind more than one provider identity to the same private ledger
- onboarding can be admin-managed for the first version instead of requiring a full self-service registration flow

## Why

- The current implementation is tightly coupled to Telegram webhook, message, and reply mechanics.
- The current single `ALLOWED_USER_ID` gate only supports one Telegram user.
- The current `user_id` usage is too close to provider identity, which makes multi-service support and multi-user isolation unsafe.
- A shared accounting core plus an internal account model would let each person use whichever service is most convenient without mixing ledgers.

## What Changes

- Extract the accounting workflow from Telegram-specific transport logic into a channel-neutral application core.
- Introduce a normalized inbound message model and normalized response intents.
- Keep Telegram support working through a Telegram adapter.
- Add support for at least one additional service adapter, assumed here to be LINE.
- Introduce internal accounts and external identity mapping so one account can own multiple provider identities.
- Persist all bookkeeping data under an internal account id rather than a raw provider user id.
- Define provider-specific authentication and webhook validation while preserving strict ledger isolation between accounts.
- Add an admin-managed provisioning path for a small fixed set of users and their allowed identities.

## Expected Impact

- User-facing: each approved person can use the same private ledger from more than one chat platform
- Code paths: `src/index.ts`, `src/core/db.ts`, `src/core/gemini.ts`, `schema.sql`, tests, setup/deploy/configuration, webhook routing
- Infrastructure: continues to run on Cloudflare Workers, but adds provider-specific credentials, identity mapping, and migration work

## Risks

- Different services have different webhook, media, identity, and interactive-message capabilities.
- The current data model uses `user_id` in a way that is tied to the incoming platform identity; this can fragment one person's ledger across services or accidentally mix ledgers if not redesigned.
- Existing Telegram behavior could regress during adapter extraction if the refactor is not protected by tests.
- Account provisioning and migration need to be designed carefully because there is no existing admin UI.

## Out Of Scope

- A standalone web or mobile client
- Shared household/team ledgers
- Self-service signup, invitations, or password-based login
- Full feature parity for every future provider in this first change
- Voice-note support unless it naturally falls out of a provider's already supported message types
