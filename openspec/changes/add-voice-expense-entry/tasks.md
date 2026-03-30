# Tasks: Add Voice Expense Entry

## 1. Telegram intake

- [ ] 1.1 Extend the main bot message handler to listen for `message:voice`.
- [ ] 1.2 Reuse the existing authorized-user gate for voice-note updates.
- [ ] 1.3 Extract the Telegram file metadata needed to download a voice note.
- [ ] 1.4 Download the voice-note binary from Telegram inside the Worker flow.
- [ ] 1.5 Normalize or infer the audio MIME type before passing it downstream.

## 2. Parsing pipeline

- [ ] 2.1 Extend `processExpenseWithGemini` to accept optional audio bytes and audio MIME type.
- [ ] 2.2 Keep the current JSON response contract for `insert`, `query`, `delete_category`, and `error`.
- [ ] 2.3 Build Gemini request parts so text, image, and audio inputs can coexist in one request.
- [ ] 2.4 Add defensive handling for Gemini failures or invalid JSON responses on voice requests.

## 3. Voice result handling

- [ ] 3.1 Route successful voice-derived `insert` actions through the existing category lookup flow.
- [ ] 3.2 Reuse the existing pending-draft confirmation flow when the suggested category does not exist.
- [ ] 3.3 Route successful voice-derived `query` actions through the existing reporting flow.
- [ ] 3.4 Route successful voice-derived `delete_category` actions through the existing reassignment flow.
- [ ] 3.5 Ensure non-accounting or unparseable voice notes do not mutate any stored data.

## 4. User-facing UX

- [ ] 4.1 Update `/help` text to mention voice-note bookkeeping and query support.
- [ ] 4.2 Add a clear retry message for voice notes that cannot be interpreted.
- [ ] 4.3 Keep success and confirmation replies consistent with the current text/photo UX.

## 5. Tests

- [ ] 5.1 Add parsing-layer coverage for voice input request construction or response handling.
- [ ] 5.2 Add webhook-level coverage for a successful voice-note expense flow.
- [ ] 5.3 Add coverage for a successful voice-note query flow.
- [ ] 5.4 Add coverage for a failed or unrelated voice-note flow that must not write data.

## 6. Verification

- [ ] 6.1 Run the relevant automated tests.
- [ ] 6.2 Manually review the updated help text and voice failure copy.
- [ ] 6.3 Mark completed items and summarize any follow-up limits, such as payload-size handling.
