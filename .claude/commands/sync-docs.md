---
description: Reconcile docs/obsidian/ documentation against the actual codebase and Git history
---

Reconcile the Obsidian project documentation in `docs/obsidian/` with the actual codebase. Do not modify application code.

1. Inspect Git changes since the most recent `last_updated` dates in the docs (`git log`, `git diff`) and the current implementation.
2. Compare each document in `docs/obsidian/` against reality; identify stale, missing, or contradictory content.
3. Update affected documents (follow the obsidian-sync skill's conventions: preserve valid content, never fabricate, mark implemented vs partial vs planned vs deprecated vs known risk).
4. Create missing documents from the standard set only if their subject actually exists in the project.
5. Update `Changelog.md`, `Decisions.md`, `Tasks.md`, `Bugs.md`, and `last_updated` frontmatter on every touched file.
6. Report: documents updated, contradictions found, uncertain information, and remaining gaps.
