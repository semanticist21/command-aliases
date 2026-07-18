---
name: git-push
description: "Use when the user asks to commit and push current changes. Inspects the working tree, composes a Conventional Commits message, runs the commit, and pushes to the current branch's upstream."
metadata:
  short-description: Commit with Conventional Commits and push
---
# Git Push

Commit and push only the user's intended current changes.

1. Read repository instructions, `git status`, branch/upstream, diff (including staged/untracked), and recent commit style. Stop for an unfinished Git operation, no changes, absent upstream, or ambiguous unrelated changes.
2. Stage explicit paths only. Never use `git add .`, stash, reset, amend, force-push, alter identity/remotes, or include secrets/generated noise without explicit approval.
3. Run the focused required verification when practical; report a skipped check rather than implying success.
4. Write a Conventional Commit: `type(optional-scope): imperative summary` (≤50 chars when feasible), with a body only for meaningful rationale/breaking change. Prefer `feat`, `fix`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `perf`, or `style` truthfully.
5. Commit explicit paths, verify the commit contains exactly the intended diff, and `git push` the current branch upstream. Never force push unless explicitly asked after a warning.
6. Report commit, branch, remote result, verification, and remaining uncommitted files.
