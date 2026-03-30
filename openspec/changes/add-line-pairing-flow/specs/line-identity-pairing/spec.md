# LINE Identity Pairing Specification

## ADDED Requirements

### Requirement: An authorized Telegram user shall be able to issue a LINE pairing code

The system SHALL let an already authorized Telegram private-chat user request a short-lived LINE pairing code that targets the same internal account.

#### Scenario: Telegram issues a LINE pairing code

- **GIVEN** a Telegram user is already authorized and resolved to account A
- **AND** account A does not already have an active LINE identity
- **WHEN** the user sends `/pair line`
- **THEN** the system creates a pending LINE pairing code for account A
- **AND** the Telegram reply includes the code, its expiry window, and instructions to send `綁定 <配對碼>` on LINE

#### Scenario: A new pairing code revokes the older pending code

- **GIVEN** account A already has a pending unused LINE pairing code
- **WHEN** the same Telegram user sends `/pair line` again
- **THEN** the previous pending code is no longer valid
- **AND** only the newly issued code may be consumed

### Requirement: A valid pairing code shall bind one LINE identity to the issuing account

The system SHALL allow an unlinked LINE direct-message user to bind themselves to the target account only by presenting a valid pending pairing code.

#### Scenario: LINE binds to the same account after Telegram issues a code

- **GIVEN** account A is already linked to Telegram
- **AND** account A has a pending LINE pairing code issued from Telegram
- **WHEN** the user's LINE account sends `綁定 <配對碼>` in a one-to-one chat
- **THEN** the system creates an active LINE identity mapping for account A
- **AND** the pairing code is marked as used
- **AND** later LINE bookkeeping requests resolve to account A

#### Scenario: A paired LINE account sees Telegram-created data

- **GIVEN** account A recorded an expense on Telegram
- **AND** account A successfully paired a LINE identity
- **WHEN** that LINE identity asks for `/summary`
- **THEN** the returned summary includes the Telegram-created expense

### Requirement: Pairing codes shall be safe to reuse neither in time nor across accounts

The system SHALL treat pairing codes as expiring single-use credentials that cannot be replayed or used to reassign another account's identity.

#### Scenario: Expired pairing code is rejected

- **GIVEN** account A has a LINE pairing code that is past its expiry time
- **WHEN** any LINE user sends `綁定 <配對碼>`
- **THEN** the system rejects the request
- **AND** no LINE identity mapping is created

#### Scenario: Used pairing code is rejected

- **GIVEN** a LINE pairing code was already consumed successfully
- **WHEN** the same or another LINE user sends `綁定 <配對碼>` again
- **THEN** the system rejects the request
- **AND** no additional identity mapping is created

#### Scenario: LINE identity already linked to another account is protected

- **GIVEN** LINE user X is already linked to account B
- **AND** account A has a valid pending LINE pairing code
- **WHEN** LINE user X tries to bind with account A's code
- **THEN** the system rejects the request
- **AND** LINE user X remains linked to account B

### Requirement: Pairing shall not silently replace an existing LINE identity

The system SHALL not overwrite an already-linked LINE identity for an account during the first pairing rollout.

#### Scenario: Account with an existing LINE identity cannot issue a replacement pairing code

- **GIVEN** account A already has an active LINE identity
- **WHEN** the user sends `/pair line` on Telegram
- **THEN** the system does not issue a new code
- **AND** it returns a clear `already linked` response

#### Scenario: Valid code is rejected if the account becomes linked before consumption

- **GIVEN** account A received a pending LINE pairing code
- **AND** account A was later linked to a LINE identity by another trusted path before the code was used
- **WHEN** a LINE user sends `綁定 <配對碼>`
- **THEN** the system rejects the request
- **AND** it does not replace the existing LINE mapping

### Requirement: Admin provisioning shall remain a valid bootstrap and recovery path

The system SHALL preserve admin-managed identity provisioning alongside Telegram-initiated LINE pairing.

#### Scenario: Provisioned LINE identity continues to work without pairing

- **GIVEN** an administrator has already linked a LINE identity to account A
- **WHEN** that LINE identity sends a normal bookkeeping request
- **THEN** the system resolves it directly through `account_identities`
- **AND** no pairing step is required
