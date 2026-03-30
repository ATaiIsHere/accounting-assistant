# Provider Bootstrap And Pairing Specification

## ADDED Requirements

### Requirement: An approved user shall be able to bootstrap an account from any supported provider

The system SHALL let an approved user create a new private ledger from any supported direct-chat provider by redeeming a valid bootstrap invite.

#### Scenario: LINE bootstrap creates a new account

- **GIVEN** an unlinked LINE direct-chat user has a valid bootstrap invite
- **WHEN** the user redeems the invite through the LINE bootstrap command
- **THEN** the system creates a new internal account
- **AND** it links that LINE identity as the first identity for the new account

#### Scenario: Telegram bootstrap creates a new account

- **GIVEN** an unlinked Telegram private-chat user has a valid bootstrap invite
- **WHEN** the user redeems the invite through the Telegram bootstrap command
- **THEN** the system creates a new internal account
- **AND** it links that Telegram identity as the first identity for the new account

#### Scenario: Invalid bootstrap invite is rejected

- **GIVEN** an unlinked user on a supported provider sends an invalid, expired, revoked, or already-used bootstrap invite
- **WHEN** the system processes the bootstrap request
- **THEN** the system rejects the request
- **AND** it does not create any account or provider identity

### Requirement: Any linked provider shall be able to issue a pairing code for another provider

The system SHALL let an already linked provider identity request a short-lived pairing code that targets another supported provider for the same internal account.

#### Scenario: Telegram issues a LINE pairing code

- **GIVEN** account A is linked to Telegram
- **AND** account A does not already have an active LINE identity
- **WHEN** the Telegram user requests a LINE pairing code
- **THEN** the system creates a pending LINE pairing code for account A
- **AND** the reply includes the code, its expiry window, and target-provider binding instructions

#### Scenario: LINE issues a Telegram pairing code

- **GIVEN** account A is linked to LINE
- **AND** account A does not already have an active Telegram identity
- **WHEN** the LINE user requests a Telegram pairing code
- **THEN** the system creates a pending Telegram pairing code for account A
- **AND** the reply includes the code, its expiry window, and target-provider binding instructions

#### Scenario: A new pairing code revokes the older pending code

- **GIVEN** account A already has a pending unused pairing code for provider X
- **WHEN** the same account requests another pairing code for provider X
- **THEN** the previous pending code is no longer valid
- **AND** only the newly issued code may be consumed

### Requirement: A valid pairing code shall bind one provider identity to the issuing account

The system SHALL allow an unlinked user on the target provider to bind themselves to the issuing account only by presenting a valid pending pairing code.

#### Scenario: LINE binds to the same account after Telegram issues a code

- **GIVEN** account A is already linked to Telegram
- **AND** account A has a pending LINE pairing code
- **WHEN** an unlinked LINE direct-chat user sends `綁定 <配對碼>`
- **THEN** the system creates an active LINE identity mapping for account A
- **AND** the pairing code is marked as used
- **AND** later LINE bookkeeping requests resolve to account A

#### Scenario: Telegram binds to the same account after LINE issues a code

- **GIVEN** account A is already linked to LINE
- **AND** account A has a pending Telegram pairing code
- **WHEN** an unlinked Telegram private-chat user sends `綁定 <配對碼>`
- **THEN** the system creates an active Telegram identity mapping for account A
- **AND** the pairing code is marked as used
- **AND** later Telegram bookkeeping requests resolve to account A

#### Scenario: A paired provider sees data created on the bootstrap provider

- **GIVEN** account A recorded an expense on its first linked provider
- **AND** account A successfully paired a second provider
- **WHEN** the second provider asks for `/summary`
- **THEN** the returned summary includes the expense created on the first provider

### Requirement: Bootstrap and pairing codes shall be safe to reuse neither in time nor across accounts

The system SHALL treat bootstrap invites and pairing codes as expiring single-use credentials that cannot be replayed or used to reassign another account's identity.

#### Scenario: Expired bootstrap invite is rejected

- **GIVEN** an unlinked user has a bootstrap invite that is past its expiry time
- **WHEN** the user attempts to bootstrap from a supported provider
- **THEN** the system rejects the request
- **AND** no account or identity mapping is created

#### Scenario: Expired pairing code is rejected

- **GIVEN** account A has a pending pairing code that is past its expiry time
- **WHEN** any target-provider user sends `綁定 <配對碼>`
- **THEN** the system rejects the request
- **AND** no new identity mapping is created

#### Scenario: Used pairing code is rejected

- **GIVEN** a pairing code was already consumed successfully
- **WHEN** the same or another user on the target provider sends `綁定 <配對碼>` again
- **THEN** the system rejects the request
- **AND** no additional identity mapping is created

#### Scenario: Provider identity already linked to another account is protected

- **GIVEN** provider identity X is already linked to account B
- **AND** account A has a valid pending pairing code targeting that provider
- **WHEN** provider identity X tries to bind with account A's code
- **THEN** the system rejects the request
- **AND** provider identity X remains linked to account B

### Requirement: Pairing shall not silently replace an existing identity for the target provider

The system SHALL not overwrite an already-linked identity for the target provider during the first pairing rollout.

#### Scenario: Account with an existing target-provider identity cannot issue a replacement pairing code

- **GIVEN** account A already has an active identity for provider X
- **WHEN** the user requests another pairing code for provider X from any linked provider
- **THEN** the system does not issue a new code
- **AND** it returns a clear `already linked` response

#### Scenario: Valid pairing code is rejected if the account becomes linked before consumption

- **GIVEN** account A received a pending pairing code for provider X
- **AND** account A was later linked to provider X by another trusted path before the code was used
- **WHEN** a user on provider X sends `綁定 <配對碼>`
- **THEN** the system rejects the request
- **AND** it does not replace the existing provider mapping

### Requirement: Admin provisioning shall remain a valid bootstrap and recovery path

The system SHALL preserve admin-managed identity provisioning alongside provider-neutral bootstrap and pairing.

#### Scenario: Provisioned identity continues to work without bootstrap or pairing

- **GIVEN** an administrator has already linked a provider identity to account A
- **WHEN** that identity sends a normal bookkeeping request
- **THEN** the system resolves it directly through `account_identities`
- **AND** no bootstrap or pairing step is required
