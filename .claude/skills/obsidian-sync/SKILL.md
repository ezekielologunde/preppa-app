---
name: obsidian-sync
description: Keep the Obsidian-compatible project documentation in docs/obsidian/ synchronized with the actual codebase. Use after making significant architecture, database, security, payment, feature, infrastructure, or product changes, or when the user asks to sync/update project documentation.
---

# Obsidian Documentation Sync

The project's human-readable knowledge layer lives in `docs/obsidian/`. Your job: after significant changes, keep it truthful.

## Process

1. **Observe** — identify what changed (your own edits this session, or `git diff` / recent commits when invoked standalone).
2. **Map changes to documents:**
   - Schema, migrations, RPCs, triggers, RLS → `Database.md` (and `Security.md` if policies changed)
   - Services, APIs, Edge Functions → `Backend.md`
   - UI, routing, state → `Frontend.md`
   - Auth, authorization, secrets, threat surface → `Security.md`
   - Payment lifecycle, Stripe, escrow, payouts → `Payments.md`
   - New/changed user-facing capability → `Features.md`
   - Component boundaries or data flow changed → `Architecture.md`
3. **Read the affected documents before editing.** Preserve existing information unless demonstrably obsolete.
4. **Update the affected documents** to describe the actual current implementation. Never fabricate details; mark placeholders and partial implementations explicitly (implemented / partially implemented / planned / deprecated / known risk).
5. **Always finish with:**
   - `Changelog.md` — add an entry for the change.
   - `Decisions.md` — add an entry if an architectural or product decision was made, with rationale.
   - `Tasks.md` — remove completed work; add newly discovered incomplete work.
   - `Bugs.md` — add or remove known issues as appropriate.
6. **Update frontmatter** — set `last_updated` (YYYY-MM-DD) on every document you touched.

## Conventions

- Obsidian-compatible Markdown, YAML frontmatter: `project`, `type`, `status`, `last_updated`.
- Use `[[Internal Links]]` between related documents.
- Do not create new documentation files unless explicitly instructed; do not duplicate content across files — link instead.
