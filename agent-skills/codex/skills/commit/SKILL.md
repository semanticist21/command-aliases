---
name: commit
description: "Create clean Conventional Commits when asked to make a git commit."
---
# commit

Create well-formed git commits for the work that is currently outstanding.

## Workflow

1. **Survey.** Run:
   - `git status` — see staged, unstaged, untracked.
   - `git diff` and `git diff --staged` — read the actual changes.
   - `git log --oneline -10` — match the repo's commit style (scope names, language, format).
2. **Decide grouping.** If the diff is one logical change, make one commit. If it spans
   unrelated concerns, make several commits (see the `commit-isolate` skill for splitting
   discipline). Never bundle unrelated changes into one commit.
3. **Stage** what belongs in the commit — prefer explicit pathspecs (`git add <path>`) or
   `git add -p` over `git add -A`, so nothing unintended sneaks in.
4. **Write the message** in Conventional Commits form:
   - `type(scope): subject` — `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `build`, `ci`.
   - Subject ≤ ~50 chars, imperative mood, no trailing period.
   - Add a body only when the *why* is not obvious from the diff; wrap at ~72 chars.
   - Match the existing repo's language (e.g. Korean subjects if the log uses them).
5. **Commit** with a heredoc so multi-line messages stay intact:
   ```bash
   git commit -m "$(cat <<'EOF'
   feat(scope): subject line

   Optional body explaining why.
   EOF
   )"
   ```
6. **Verify** with `git status` + `git log --oneline -3`. If a pre-commit hook modified files,
   inspect and re-stage, then amend.

## Guardrails

- Commit only — never `push` unless the user explicitly asks.
- If on the default branch (`main`/`master`) and the change is non-trivial, ask whether to
  branch first.
- Honor any repo- or harness-mandated trailer (e.g. a `Co-Authored-By:` line) when one is
  configured; otherwise omit it.
- Do not `git add -A` blindly when the tree has changes you did not make — those belong in
  their own commits; reach for the `commit-isolate` skill.
- Never amend or rebase commits that are already pushed.
