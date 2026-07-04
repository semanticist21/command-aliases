---
name: commit-isolate
description: "Split a dirty tree into isolated Conventional Commits for /commit-isolate."
---

# commit-isolate

Leave the working tree clean. Every outstanding change gets committed, including
changes you did not make, but separate unrelated concerns into their own atomic
Conventional Commits.

Distinguishing rule: do not silently carry, stash, or discard pre-existing
uncommitted changes. Commit them too, separate from your own work when they are a
different concern.

## Workflow

1. **Right-size survey.** Start light:
   - `git status --porcelain` for staged, unstaged, and untracked paths.
   - `git diff --stat` and `git diff --staged --stat` for the shape of change.
   - Open full `git diff` / `git diff --staged` only for files needed to decide
     grouping, spot risk, or write an accurate commit message.
   - Use `git log --oneline -5` only when commit style or language is unclear.
   If the dirty tree is small and obviously one concern, say so briefly and make
   one commit. Do not produce a long analysis just because this skill fired.
2. **Cluster only when needed.** Split into multiple buckets only when distinct
   logical concerns are evident, such as feature work, unrelated formatting,
   config changes, or debug leftovers. A change you did not author still gets
   bucketed; it does not get bundled into unrelated work.
3. **Order buckets** so dependencies land first, such as a renamed module before
   callers.
4. **Stage one bucket at a time, in isolation:**
   - Whole files: `git add <path> [<path> ...]`.
   - Partial files: `git add -p <path>` and accept only hunks for the current
     bucket. If hunks are too coarse, use `git add -p` `e` or apply a sliced
     patch to the index.
   - Untracked files: `git add <path>` for this bucket only.
   - After staging, confirm `git diff --staged` contains only this bucket.
5. **Commit the bucket** with an accurate Conventional Commit message describing
   what changed, not who made it.
6. **Repeat** until `git status` is clean.
7. **Verify** `git status` is clean and `git log --oneline -N` shows one coherent
   commit per bucket.

## Guardrails

- **Surface, don't bury.** If a pre-existing change looks wrong, dangerous, or
  contradictory, stop and tell the user before committing it. Commit it only
  after confirmation, or leave it unstaged and report it.
- Keep each commit atomic: it should build/pass on its own where feasible and
  contain exactly one concern.
- Never `git add -A` / `git add .`; stage by pathspec or by hunk.
- Commit only; never `push` unless explicitly asked.
- If a pre-commit hook reformats files mid-run, re-survey before continuing so
  new edits land in the right bucket.
- Never reorder or amend commits already pushed.
- Honor any repo- or harness-mandated commit trailer when one is configured.
