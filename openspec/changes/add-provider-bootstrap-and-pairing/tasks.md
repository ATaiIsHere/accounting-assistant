# Tasks: Add Provider-Neutral Bootstrap And Pairing

## 1. Bootstrap and pairing persistence

- [x] 1.1 Add an `account_bootstrap_codes` table to `schema.sql` and a new D1 migration.
- [x] 1.2 Add an `identity_pairing_codes` table to `schema.sql` and a new D1 migration.
- [x] 1.3 Add DB methods to create, revoke, look up, and consume bootstrap invites.
- [x] 1.4 Add DB methods to create, revoke, look up, and consume provider pairing codes.
- [x] 1.5 Normalize bootstrap invites and pairing codes before hashing so user input is compared consistently.
- [x] 1.6 Enforce that one provider external identity cannot be claimed by another account during bootstrap or pairing.
- [x] 1.7 Enforce the v1 rule that one account has at most one active direct-chat identity per provider.

## 2. Bootstrap flow

- [ ] 2.1 Define provider-specific bootstrap commands for supported providers, starting with Telegram and LINE direct chats.
- [ ] 2.2 Accept bootstrap only from supported direct-chat scopes.
- [ ] 2.3 Create a new account and the first provider identity from a valid bootstrap invite.
- [ ] 2.4 Return Traditional Chinese success and failure copy for bootstrap flows.
- [ ] 2.5 Preserve admin provisioning as an alternative bootstrap path.

## 3. Provider-neutral pairing flow

- [ ] 3.1 Add pair-code issuance commands for linked users on supported providers, starting with Telegram and LINE.
- [ ] 3.2 Restrict pairing code issuance to already linked direct-chat identities.
- [ ] 3.3 Revoke older pending pairing codes when a new code is issued for the same account and target provider.
- [ ] 3.4 Recognize `綁定 <配對碼>` on unlinked target-provider direct chats before falling back to the unauthorized reply.
- [ ] 3.5 Validate that the pairing code is pending, unexpired, and single-use.
- [ ] 3.6 Create the new `account_identities` mapping on successful pairing.
- [ ] 3.7 Mark the pairing code as used and record which provider identity consumed it.
- [ ] 3.8 Return distinct Traditional Chinese replies for success, invalid code, expired code, and already-linked cases.

## 4. Tests

- [x] 4.1 Add DB coverage for bootstrap invite creation, redemption, expiry, and single-use behavior.
- [x] 4.2 Add DB coverage for provider pairing code creation, replacement, expiry, and single-use behavior.
- [ ] 4.3 Add Telegram and LINE adapter coverage for bootstrap success and failure paths.
- [ ] 4.4 Add adapter coverage for pair-code issuance from Telegram and LINE.
- [ ] 4.5 Add adapter coverage for `綁定 <配對碼>` success and failure paths on the target provider.
- [ ] 4.6 Add isolation coverage proving a provider identity already linked to account B cannot be claimed by account A.

## 5. Verification

- [ ] 5.1 Run the relevant automated tests.
- [ ] 5.2 Manually verify a new account can be bootstrapped from Telegram with a valid invite.
- [ ] 5.3 Manually verify a new account can be bootstrapped from LINE with a valid invite.
- [ ] 5.4 Manually verify any linked provider can issue a pairing code for another supported provider.
- [ ] 5.5 Manually verify the target provider can consume the code and immediately share the same ledger.
- [ ] 5.6 Manually verify expired or already-used bootstrap and pairing codes cannot be reused.
- [ ] 5.7 Update the previous multi-service verification notes once provider-neutral bootstrap and pairing pass.
