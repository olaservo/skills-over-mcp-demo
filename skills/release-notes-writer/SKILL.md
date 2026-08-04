---
name: release-notes-writer
description: Write user-facing release notes from a list of merged changes, grouped by impact with breaking changes surfaced first. Use when the user asks to draft release notes, a changelog entry, or an announcement for a release.
metadata:
  author: skills-over-mcp-ig
  version: "0.1"
---

# Release Notes Writer

Turn a raw list of merged changes into release notes a user actually wants to read.

## When to Use

- The user asks for release notes, a changelog entry, or a release announcement
- The user provides a list of commits, merged PRs, or closed issues for a version

## Process

1. **Collect the changes** — from the user's list, a git log, or merged PRs. Ask for the version number and date if not given.
2. **Classify each change** — breaking change, feature, improvement, fix, or internal. Drop internal-only changes (refactors, CI, deps) unless the user wants them.
3. **Rewrite for users** — describe what changed from the user's perspective, not the implementation. "Skills can now be listed without reading each SKILL.md" beats "add frontmatter to list entries".
4. **Order by impact** — breaking changes first with migration steps, then features, improvements, fixes.
5. **Fill the template** — use `templates/release-notes-template.md` as the output skeleton.

## Rules

- Every breaking change MUST include a migration step, even a one-liner.
- Link each entry to its PR or issue when identifiers are available.
- Keep entries to one sentence; add a sub-bullet only when a migration or example is required.
- Never pad: if a section has no entries, omit the section.
