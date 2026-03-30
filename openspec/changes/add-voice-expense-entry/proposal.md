# Change Proposal: Add Voice Expense Entry

## Assumption

The original request used the placeholder `[YOUR FEATURE HERE]`. For this initial proposal, the assumed feature is **Telegram voice-note expense entry**, because the project goal already mentions chat-based text or voice bookkeeping while the current implementation only supports text and photo input.

## Why

- Voice notes are a natural mobile-first input for Telegram users who want to record expenses quickly.
- The current product promise is broader than the implemented input surface.
- This feature extends the existing assistant without changing the deployment model or requiring a separate client.

## What Changes

- Accept Telegram voice messages as an additional accounting input type.
- Route voice content through the AI parsing pipeline so the bot can classify it as:
  - expense insertion
  - spending query
  - category deletion request
  - non-accounting input
- Reuse the existing draft-confirmation and category-management flows for parsed results.
- Return a clear error message when audio cannot be transcribed or classified.
- Update help text and tests to cover the new input path.

## Expected Impact

- User-facing: faster hands-free bookkeeping in Telegram
- Code paths: `src/index.ts`, `src/core/gemini.ts`, tests, help text
- Infrastructure: no new runtime platform; continues to use Cloudflare Workers, Telegram, and Gemini

## Risks

- Voice-message latency may be higher than text parsing.
- Audio payload handling must respect Gemini request size limits.
- Telegram voice-note formats and MIME metadata may need normalization before sending to Gemini.

## Out Of Scope

- Real-time streaming transcription
- Group chat or multi-user voice workflows
- A separate web or mobile UI for audio upload
