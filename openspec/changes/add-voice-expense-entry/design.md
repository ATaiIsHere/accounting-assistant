# Design: Add Voice Expense Entry

## Context

The current bot handles `message:text` and `message:photo` updates, then routes the parsed result into existing insert/query/category-management flows. Voice notes should fit into the same decision pipeline instead of introducing a separate bookkeeping path.

Google's Gemini API documentation indicates that Gemini can accept audio input and return text responses, including transcription-oriented outputs, and that inline audio is appropriate for smaller requests while uploaded files are preferred above 20 MB.

## Goals

- Let the authorized user send a Telegram voice note and receive the same accounting behavior available for text input.
- Keep the architecture inside the existing Worker webhook flow.
- Reuse existing database and interaction flows wherever possible.

## Non-Goals

- Real-time or bidirectional audio dialogue
- General-purpose voice assistant behavior unrelated to accounting
- Schema changes for voice-specific storage beyond what already exists

## Proposed Approach

### 1. Extend Telegram intake

- Update the message handler to include `message:voice`.
- Download the voice file through Telegram's file API, similar to the existing photo fetch flow.
- Pass the audio bytes, MIME type, and any caption text into the parsing layer.

### 2. Generalize Gemini input handling

- Extend `processExpenseWithGemini` so it can accept optional audio bytes in addition to text and image input.
- Build a multimodal request where text remains a hint and audio becomes another content part.
- Keep structured JSON output requirements unchanged so downstream logic does not fork.

### 3. Reuse downstream flows

- If the parsed action is `insert`, continue using the current category lookup, dynamic category draft, and confirmation keyboard logic.
- If the parsed action is `query` or `delete_category`, continue using the existing branches unchanged.
- If parsing fails, return a voice-specific but still simple user-facing error message.

### 4. Respect payload limits

- Prefer inline audio for normal Telegram voice-note sizes.
- If implementation proves Telegram voice files can exceed Gemini inline limits, add a follow-up path that uploads the audio via Gemini Files API.

## Tradeoffs

- Direct multimodal parsing is simpler than a two-step transcription-then-parse flow, but it may be harder to debug.
- A dedicated transcription step could improve observability later, but it adds cost, latency, and another failure mode now.

## Verification Strategy

- Add automated coverage for successful voice-note parsing into an insert or query result.
- Add failure coverage for unparseable or non-accounting voice messages.
- Confirm help text and reply UX remain consistent with existing bot behavior.
