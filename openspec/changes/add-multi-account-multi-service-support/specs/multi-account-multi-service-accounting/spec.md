# Multi-Account Multi-Service Accounting Specification

## ADDED Requirements

### Requirement: The accounting workflow shall be provider-agnostic

The system SHALL expose a shared accounting workflow that is not hardcoded to a single messaging provider. Supported providers shall translate their inbound events into a common input model and execute the same bookkeeping logic.

#### Scenario: Telegram and LINE use the same accounting workflow

- **GIVEN** Telegram and LINE are configured as supported providers
- **WHEN** each provider sends a valid bookkeeping request
- **THEN** the system normalizes the provider event
- **AND** it executes the same shared accounting workflow

### Requirement: One account may bind multiple provider identities

The system SHALL support one internal account being linked to multiple external provider identities so the same person can access the same private ledger from Telegram and LINE.

#### Scenario: Expense created on Telegram is visible on LINE

- **GIVEN** account A is linked to one Telegram identity and one LINE identity
- **AND** account A records an expense through Telegram
- **WHEN** account A later asks for a report through LINE
- **THEN** the report includes the Telegram-created expense

#### Scenario: Category state is shared across providers

- **GIVEN** account A creates or confirms a category-related change on one provider
- **WHEN** account A interacts from another supported provider
- **THEN** the same category state is visible and used

### Requirement: Different accounts shall remain isolated

The system SHALL isolate bookkeeping data by internal account so one person's expenses, categories, drafts, and exports are never visible to another person even if they use the same providers.

#### Scenario: Two users on the same provider do not share data

- **GIVEN** account A and account B both have Telegram identities
- **AND** account A has recorded expenses
- **WHEN** account B asks for a report
- **THEN** account B does not receive account A's data

#### Scenario: Two users across different providers do not share data

- **GIVEN** account A is linked to Telegram and account B is linked to LINE
- **AND** account A has recorded expenses
- **WHEN** account B interacts through LINE
- **THEN** account B cannot read, edit, export, or delete account A's data

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

Each supported provider SHALL validate inbound requests and SHALL authorize only configured external identities before allowing access to the mapped internal account ledger.

#### Scenario: Unauthorized LINE user is rejected

- **GIVEN** a LINE webhook request from an external user who is not configured as an allowed identity
- **WHEN** the system processes the request
- **THEN** the system rejects or ignores the request
- **AND** no accounting data is returned or changed

#### Scenario: Invalid provider signature is rejected

- **GIVEN** a webhook request with an invalid provider signature
- **WHEN** the request reaches the provider route
- **THEN** the system rejects the request before it reaches the shared accounting core

### Requirement: Initial multi-user onboarding shall be admin-managed

The system SHALL support a small fixed set of manually provisioned accounts and linked identities without requiring self-service registration.

#### Scenario: A new known user is provisioned

- **GIVEN** an administrator provisions account C and links that account to one Telegram identity and one LINE identity
- **WHEN** account C sends valid bookkeeping requests from either linked provider
- **THEN** the system resolves both identities to account C's private ledger
