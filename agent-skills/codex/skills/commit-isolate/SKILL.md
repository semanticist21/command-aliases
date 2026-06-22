---
name: commit-isolate
description: "Split the entire dirty tree into isolated Conventional Commits. Use for /commit-isolate, commit isolate, or messy-tree commit requests."
---
# commit-isolate

Leave the working tree clean. Every outstanding change gets committed — **including changes
you did not make** — but each is split into its own atomic commit grouped by logical concern,
never lumped together.

The distinguishing rule: do not silently carry, stash, or discard pre-existing uncommitted
changes. Commit them too, in their own isolated commits, separate from your own work.

## Workflow

1. **Full survey.** Run and read everything:
   - `git status --porcelain` — every staged, unstaged, and untracked path.
   - `git diff` and `git diff --staged` — the actual hunks.
   - `git log --oneline -10` — match commit style and language.
2. **Cluster by concern, not by author.** Walk the whole diff and bucket every hunk/file into
   logical groups (e.g. "feature X", "unrelated formatting", "config tweak someone else left",
   "stray debug log"). A change you did not author still gets a bucket — it does not get a free
   pass to be bundled into your commit.
3. **Order buckets** so dependencies land first (e.g. a renamed module before its callers).
4. **Stage one bucket at a time, in isolation:**
   - Whole files: `git add <path> [<path> ...]`.
   - Partial files (mixed concerns in one file): `git add -p <path>` and accept only the hunks
     for the current bucket. If hunks are too coarse, use `git add -p` then `e` to edit the
     hunk, or `git apply --cached` with a sliced patch.
   - Untracked files: `git add <path>` for the ones in this bucket only.
   - After staging, confirm with `git diff --staged` that **only** this bucket is staged.
5. **Commit the bucket** with a Conventional Commit message describing *that bucket's* intent:
   ```bash
   git commit -m "$(cat <<'EOF'
   <type>(<scope>): subject for this bucket only
   EOF
   )"
   ```
   For changes you did not author, still write an accurate message for what the change does —
   describe the change, not who made it.
6. **Repeat** steps 4–5 until `git status` is clean. Nothing outstanding may remain.
7. **Verify** with `git status` (must be clean) and `git log --oneline -N` (one commit per
   bucket, each coherent).

## Guardrails

- **Surface, don't bury.** If a pre-existing change looks wrong, dangerous, or contradicts how
  the surrounding code describes itself (e.g. a leftover secret, a commented-out guard, a
  debug hack), stop and tell the user before committing it — give it its own commit only after
  they confirm, or leave it unstaged and report it.
- Keep each commit atomic: it should build/pass on its own where feasible, and contain exactly
  one concern.
- Never `git add -A` / `git add .` — that defeats the isolation. Stage by pathspec or by hunk.
- Commit only — never `push` unless explicitly asked.
- If a pre-commit hook reformats files mid-run, re-survey before continuing so the new edits
  land in the right bucket.
- Never reorder or amend commits that are already pushed.
- Honor any repo- or harness-mandated commit trailer when one is configured.
