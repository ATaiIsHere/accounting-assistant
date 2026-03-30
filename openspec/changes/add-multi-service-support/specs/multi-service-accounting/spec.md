# Multi-Service Accounting Specification

## ADDED Requirements

### Requirement: The accounting workflow shall be provider-agnostic

The system SHALL expose a shared accounting workflow that is not hardcoded to a single messaging provider. Supported providers shall translate their inbound events into a common input model and execute the same bookkeeping logic.

#### Scenario: Telegram and LINE use the same accounting workflow

- **GIVEN** Telegram and LINE are configured as supported providers
- **WHEN** each provider sends a valid bookkeeping request
- **THEN** the system normalizes the provider event
- **AND** it executes the same shared accounting workflow

### Requirement: Supported providers shall share one ledger for the same owner

The system SHALL store and query accounting data using a logical owner identity that is shared across approved providers, rather than fragmenting data by raw provider user id.

#### Scenario: Expense created on Telegram is visible on LINE

- **GIVEN** the authorized user records an expense through Telegram
- **WHEN** the same owner later asks for a report through LINE
- **THEN** the report includes the Telegram-created expense

#### Scenario: Category state is shared across providers

- **GIVEN** the authorized user creates or confirms a category-related change on one provider
- **WHEN** the user interacts from another supported provider
- **THEN** the same category state is visible and used

### Requirement: Existing Telegram behavior shall remain supported after the refactor

The system SHALL preserve the current Telegram bookkeeping capabilities after the provider abstraction is introduced.

#### Scenario: Telegram text expense insertion still works

- **GIVEN** the authorized Telegram user sends a valid text expense
- **WHEN** the refactored system processes the message
- **THEN** the expense is recorded with the same business behavior as before

#### Scenario: Telegram category reassignment flow still works

- **GIVEN** the authorized Telegram user requests category deletion
- **WHEN** the refactored system processes the request
- **THEN** the user still receives a safe reassignment confirmation flow before destructive changes occur

### Requirement: Provider authorization shall remain isolated and safe

Each supported provider SHALL validate inbound requests and SHALL authorize only configured external identities before allowing access to the shared ledger.

#### Scenario: Unauthorized LINE user is rejected

- **GIVEN** a LINE webhook request from an external user who is not configured as an allowed identity
- **WHEN** the system processes the request
- **THEN** the system rejects or ignores the request
- **AND** no accounting data is returned or changed

#### Scenario: Invalid provider signature is rejected

- **GIVEN** a webhook request with an invalid provider signature
- **WHEN** the request reaches the provider route
- **THEN** the system rejects the request before it reaches the shared accounting core
