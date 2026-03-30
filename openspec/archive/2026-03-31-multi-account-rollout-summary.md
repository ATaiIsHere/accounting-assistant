# OpenSpec Merge And Archive Summary

Date: 2026-03-31

## Scope

This summary consolidates the two completed OpenSpec changes that together define the current product shape:

- `add-multi-account-multi-service-support`
- `add-provider-bootstrap-and-pairing`

These changes are complete in implementation, automated coverage, and manual staging verification. They are ready to merge into the main development line and ready to archive in OpenSpec once the team decides to close them formally.

## Change Status

### 1. `add-multi-account-multi-service-support`

Status: completed

Delivered:

- internal `accounts` ownership model
- `account_identities` mapping from provider identity to internal account
- provider-neutral shared accounting core
- Telegram adapter refactor
- LINE adapter implementation
- account isolation across users
- same-account shared ledger across Telegram and LINE
- staging verification for regression, cross-service sharing, and cross-account isolation

Primary evidence:

- `openspec/changes/add-multi-account-multi-service-support/tasks.md`
- `openspec/changes/add-multi-account-multi-service-support/manual-verification.md`

### 2. `add-provider-bootstrap-and-pairing`

Status: completed

Delivered:

- provider-neutral bootstrap invite flow
- provider-neutral pairing code flow
- Telegram and LINE bootstrap support
- Telegram and LINE pairing issuance / consume flows
- single-use and expiry protection for bootstrap and pairing codes
- admin bootstrap invite script
- staging verification for bootstrap, pairing, and replay / expiry rejection

Primary evidence:

- `openspec/changes/add-provider-bootstrap-and-pairing/tasks.md`
- `openspec/changes/add-provider-bootstrap-and-pairing/manual-verification.md`

## What Merges Into Main

If this branch is merged, the main line gains the following product behavior:

- multi-account ledger isolation
- Telegram and LINE as supported providers
- one user can access the same ledger from Telegram and LINE
- new users can bootstrap from either supported provider using an invite
- already linked users can pair an additional provider without admin pre-provisioning
- admin provisioning remains available for controlled rollout and recovery
- staging-tested onboarding, pairing, and ledger isolation behavior

## Verification Summary

Automated coverage completed:

- shared accounting service tests
- Telegram adapter tests
- LINE adapter tests
- multi-service isolation tests
- bootstrap / pairing persistence tests

Manual staging verification completed:

- Telegram regression after adapter extraction
- same-account Telegram + LINE ledger sharing
- different-account isolation
- fresh Telegram bootstrap
- fresh LINE bootstrap
- provider-neutral pairing
- expired / used bootstrap code rejection
- expired / used pairing code rejection

## Remaining Deferred Work

The following are intentionally not solved by these two completed changes:

- identity conflict resolution when a provider identity is already linked to another account
- empty-account rebind policy
- account merge workflow
- unlink / replace provider identity flow
- richer LINE parity for exports and callback-style UX

These should be handled as follow-up changes rather than folded back into the completed scopes above.

## Recommended Archive Notes

When archiving these changes, keep the final archive note short:

1. `add-multi-account-multi-service-support` established the account model, provider adapters, and isolation guarantees.
2. `add-provider-bootstrap-and-pairing` completed onboarding by adding provider-neutral bootstrap and pairing.
3. Remaining identity-conflict handling is intentionally deferred to a future change.

## Merge / PR Notes

Recommended PR framing:

- base outcome: multi-account, multi-service bookkeeping with provider-neutral onboarding
- key user-facing additions:
  - LINE support
  - invite-based account creation
  - Telegram / LINE pairing
  - strict ledger isolation
- key operational additions:
  - migrations
  - provisioning scripts
  - bootstrap invite script
  - staging deployment and verification coverage

This summary is intended to be the handoff document for PR review and later OpenSpec archive work.
