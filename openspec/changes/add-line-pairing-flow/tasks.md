# Tasks: Add Telegram-Initiated LINE Pairing

## 1. Pairing persistence and ownership rules

- [ ] 1.1 Add an `identity_pairing_codes` table to `schema.sql` and a new D1 migration.
- [ ] 1.2 Add DB methods to create, revoke, look up, and consume LINE pairing codes.
- [ ] 1.3 Normalize pairing codes before hashing so user input is compared consistently.
- [ ] 1.4 Enforce that one LINE external identity cannot be claimed by another account during pairing.
- [ ] 1.5 Enforce the v1 rule that one account has at most one active LINE identity.

## 2. Telegram pairing flow

- [ ] 2.1 Add a Telegram command for issuing a LINE pairing code, using `/pair line`.
- [ ] 2.2 Restrict pairing initiation to authorized Telegram private chats only.
- [ ] 2.3 Revoke older pending LINE pairing codes when a new one is issued for the same account.
- [ ] 2.4 Return Traditional Chinese instructions, expiry details, and the exact LINE bind command.
- [ ] 2.5 Return a clear `already linked` response when the account already has LINE bound.

## 3. LINE bind flow

- [ ] 3.1 Recognize `綁定 <配對碼>` in LINE direct-message text events before falling back to the unauthorized reply.
- [ ] 3.2 Validate that the pairing code is pending, unexpired, and single-use.
- [ ] 3.3 Create the new LINE `account_identities` mapping on successful pairing.
- [ ] 3.4 Mark the pairing code as used and record which LINE identity consumed it.
- [ ] 3.5 Return distinct Traditional Chinese replies for success, invalid code, expired code, and already-linked cases.

## 4. Tests

- [ ] 4.1 Add DB coverage for pairing code creation, replacement, expiry, and single-use behavior.
- [ ] 4.2 Add Telegram adapter coverage for `/pair line` success and `already linked` responses.
- [ ] 4.3 Add LINE adapter coverage for `綁定 <配對碼>` success and failure paths.
- [ ] 4.4 Add isolation coverage proving a LINE identity already linked to account B cannot be paired into account A.

## 5. Verification

- [ ] 5.1 Run the relevant automated tests.
- [ ] 5.2 Manually verify Telegram can issue a LINE pairing code for an authorized account.
- [ ] 5.3 Manually verify LINE can consume the code and immediately share the same ledger as Telegram.
- [ ] 5.4 Manually verify an expired or already-used code cannot be reused.
- [ ] 5.5 Update the previous multi-service verification notes once cross-service pairing passes.
