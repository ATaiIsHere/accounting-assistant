# OpenSpec Workflow

## Purpose

Use OpenSpec in this repository to align on behavior changes before code is written. The goal is to keep feature planning, implementation scope, and verification explicit so chat context does not become the only source of truth.

## Read First

Before proposing or implementing a non-trivial change, read:

1. `openspec/project.md`
2. `MEMORY.md`
3. Relevant files under `src/`, `scripts/`, `tests/`, and `schema.sql`
4. Any active change folders under `openspec/changes/`

## When To Create A Change Proposal

Create an OpenSpec change proposal for:

- New user-facing features
- Behavior changes to existing commands or AI parsing flows
- Database schema changes
- Changes to deploy/setup automation that affect developer workflow
- Refactors that meaningfully alter architecture or operational behavior

You may skip a proposal for:

- Typos and wording-only documentation edits
- Small formatting or style-only fixes
- Narrow bug fixes with an obvious local cause and no behavior ambiguity

## Standard Change Structure

For each approved change, create a folder at:

`openspec/changes/<change-id>/`

Include:

- `proposal.md`: why the change exists, scope, user impact, affected areas
- `design.md`: technical approach, tradeoffs, risks, rollout notes
- `tasks.md`: ordered implementation checklist
- `specs/<capability>/spec.md`: requirement deltas written with concrete scenarios

## Repo Workflow

1. Understand the request and refresh context from `openspec/project.md`.
2. If the request is non-trivial, draft or update an OpenSpec proposal first.
3. Review the proposal with the user and resolve open questions before implementation.
4. Before implementation starts, switch to a new branch.
5. Implement tasks in the order defined in `tasks.md`.
6. Update task checkboxes as work finishes.
7. Create a commit at the end of each completed task or tightly-coupled task group.
8. Run relevant verification before marking the task complete.
9. After the change ships, archive or fold the accepted spec delta into the long-lived `openspec/specs/` area.

## Branch Rules For This Repo

- Prefer the team branching convention from the contributing guide.
- Contributor work should normally use `${author}/${type}/${scope}/${description}` or `${author}/${type}/${description}`.
- Integration branches should use `${type}/${scope}/${description}` or `${type}/${description}`.
- QA aggregation branches should use `testing/${type}/${description}`.
- If the repository later exposes `origin/staging`, branch from it for normal feature work. Right now the remote only exposes `master`, so use the current integration base until `staging` exists.
- In Codex runs, a `codex/` prefix may be added to satisfy local tooling constraints while preserving the rest of the naming pattern.

## Commit Rules For This Repo

- Follow Conventional Commits: `<type>[optional scope]: <description>`
- Use lowercase imperative descriptions without a trailing period
- Keep commit scope aligned with the affected app or library when applicable
- For OpenSpec-driven work, do not batch unrelated tasks into one commit

## Repo-Specific Guardrails

- Preserve the Telegram-first interaction model unless the proposal explicitly expands platform scope.
- Keep the single-user authorization gate unless multi-user support is part of the approved change.
- Prefer D1-backed state over in-memory conversational state.
- Keep bot copy in Traditional Chinese unless the change intentionally introduces localization.
- Reuse existing insert/query/category-management flows instead of creating parallel variants unless the proposal requires it.

## How To Work With Codex On This Project

Use one of these request shapes:

- `Update openspec/project.md with any newly learned project details`
- `Create an OpenSpec proposal for <feature>`
- `Revise proposal <change-id> to reflect <decision>`
- `Implement openspec/changes/<change-id>/tasks.md task 1.1`
- `Review whether <change-id> is ready for implementation`
- `Archive <change-id> after release`

For implementation requests, expect Codex to:

- switch to a new branch first
- implement against the active OpenSpec tasks
- commit task-by-task
- summarize verification and any follow-up gaps
