# Project Context

## Overview

`accounting-assistant` is a Telegram-first personal expense tracking assistant built for low-ops deployment on Cloudflare Workers. The product focuses on fast expense capture from chat messages and receipt photos, AI-assisted category handling, natural-language spending queries, and CSV export for downstream analysis.

The current implementation is optimized for a single authorized user and Taiwanese usage patterns, including Traditional Chinese bot copy and UTC+8 date handling.

## Product Goals

- Make mobile expense capture faster than opening a dedicated bookkeeping app.
- Support natural-language accounting workflows inside Telegram.
- Minimize infrastructure and operational overhead by staying serverless.
- Keep category management flexible through AI-assisted suggestions and safe reassignment flows.

## Current Capabilities

- Telegram webhook endpoint hosted on Cloudflare Workers.
- Authorized-user-only bot interactions via `ALLOWED_USER_ID`.
- Expense insertion from text messages and receipt/invoice photos.
- Natural-language spending queries with summary and grouped category output.
- Editing or deleting an existing expense by replying to a prior bot confirmation message.
- Dynamic category creation and safe category deletion with reassignment via inline keyboard.
- CSV export of all recorded expenses.
- Automated setup and deploy scripts for D1, secrets, and Telegram webhook registration.

## Tech Stack

- Runtime: Cloudflare Workers
- Language: TypeScript (`strict` mode, ESNext modules)
- HTTP framework: Hono
- Bot framework: grammY
- Database: Cloudflare D1 (SQLite)
- AI provider: Google Gemini API (`gemini-2.5-flash`)
- Tooling: Wrangler, Vitest, tsx, npm

## Codebase Layout

- `src/index.ts`: Worker entrypoint, Telegram webhook handling, command routing, and user interaction flow.
- `src/core/db.ts`: D1 data access layer for expenses, categories, drafts, and reporting queries.
- `src/core/gemini.ts`: Gemini request construction and structured parsing for insert/query/update flows.
- `scripts/setup.ts`: Day-0 provisioning for D1, schema sync, and secret setup.
- `scripts/deploy.ts`: Deploy automation and Telegram webhook/menu registration.
- `schema.sql`: Baseline schema for categories, expenses, and pending drafts.
- `tests/db.test.ts`: D1-focused test coverage around data operations and reporting.

## Architecture Conventions

- Keep the Worker stateless; persist workflow state in D1 when interaction spans multiple updates.
- Put HTTP and Telegram orchestration in `src/index.ts`, and keep domain/data logic in `src/core/*`.
- Reuse the same AI parsing path for similar input types whenever possible instead of forking user flows.
- Prefer additive features that preserve the current Telegram-first UX rather than introducing a separate web UI.
- Favor explicit user confirmation for ambiguous or destructive actions.

## Data Conventions

- `categories` are user-scoped and unique by `(user_id, name)`.
- `expenses` store normalized fields plus optional raw message and media reference for auditability.
- `pending_expenses` are used to preserve conversational state for inline confirmation flows.
- Dates are stored as `YYYY-MM-DD` strings.
- The current implementation derives "today" using a fixed UTC+8 offset in application code.

## Testing Conventions

- Prefer focused unit/integration-style tests around `CoreDB` and Worker behavior that can run in the Cloudflare Vitest pool.
- Add regression coverage for new conversation paths, especially parsing branches and destructive actions.
- Keep test fixtures minimal and explicit; schema setup can be inline when it improves readability.

## Operational Conventions

- Secrets are managed through Cloudflare secrets in deployed environments and `.dev.vars` for local development.
- Webhook requests must pass Telegram secret-token validation before the bot processes the update.
- Local development uses `wrangler dev`; production deployment goes through the scripted deploy flow.
- The repo currently only exposes `master` remotely. If a `staging` branch is introduced later, new work should branch from it per team workflow.

## Collaboration And Git Conventions

- Use Conventional Commits in the form `<type>[optional scope]: <description>`.
- Keep descriptions lowercase, imperative, and without a trailing period.
- For this project, non-trivial work should start from a new branch before implementation begins.
- Team branch naming follows the contributing guide:
  - `${author}/${type}/${scope}/${description}` for contributor branches
  - `${type}/${scope}/${description}` for integration branches
  - `testing/${type}/${description}` for QA merge branches
- When this project is edited from Codex, branch names may be prefixed with `codex/` to satisfy local tool constraints; the remaining segments should still mirror the team naming pattern.
- Each completed OpenSpec task should end with its own commit so proposal, workflow, and implementation progress remain easy to audit.

## Domain Terms

- Expense: A single spending record with date, item, amount, and category.
- Category: A user-defined or AI-suggested label used for grouping expenses.
- Pending expense: A draft record awaiting user confirmation before insertion.
- Query report: A summarized answer generated from structured filters over existing expenses.

## External Dependencies

- Cloudflare Workers and D1
- Telegram Bot API
- Google Gemini API
