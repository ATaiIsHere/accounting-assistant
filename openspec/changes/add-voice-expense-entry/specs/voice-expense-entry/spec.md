# Voice Expense Entry Specification

## ADDED Requirements

### Requirement: Authorized voice notes shall be parsed as accounting input

The system SHALL accept Telegram voice messages from the authorized user, retrieve the audio payload, and pass it through the existing AI-driven accounting parser so the content can be classified as an expense insertion, spending query, category-management action, or non-accounting message.

#### Scenario: Voice note records an expense

- **GIVEN** the authorized user sends a Telegram voice note saying they spent 120 on lunch today
- **WHEN** the webhook processes the update
- **THEN** the system parses the voice content
- **AND** it follows the existing expense insertion flow using the extracted date, item, amount, and suggested category

#### Scenario: Voice note asks for a report

- **GIVEN** the authorized user sends a Telegram voice note asking how much was spent this month on meals
- **WHEN** the webhook processes the update
- **THEN** the system follows the existing query flow
- **AND** it returns the matching spending report

### Requirement: Voice-derived inserts shall preserve existing category confirmation behavior

When a voice note produces an expense insertion whose suggested category does not yet exist, the system SHALL reuse the existing pending-draft confirmation workflow instead of directly inserting an unconfirmed new category.

#### Scenario: Voice note suggests a new category

- **GIVEN** the authorized user sends a voice note describing an expense whose suggested category does not yet exist
- **WHEN** the expense is parsed successfully
- **THEN** the system stores a pending draft
- **AND** it asks the user to confirm creating the new category before insertion

### Requirement: Voice-note failures shall be handled safely

If a voice note cannot be transcribed or cannot be classified as an accounting request, the system SHALL return a clear response and SHALL NOT create, update, or delete accounting data.

#### Scenario: Voice note is unrelated to accounting

- **GIVEN** the authorized user sends a casual voice note unrelated to spending or category management
- **WHEN** the parser classifies it as non-accounting input
- **THEN** the bot replies with a safe failure message
- **AND** no expense or category data is changed

#### Scenario: Voice note cannot be parsed

- **GIVEN** the authorized user sends a voice note whose audio cannot be interpreted
- **WHEN** the parser fails to extract a valid accounting action
- **THEN** the bot replies with an error message asking the user to retry
- **AND** no expense or category data is changed
