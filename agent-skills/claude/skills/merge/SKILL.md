---
name: merge
description: "Merge the current branch into a target branch with a real merge commit. Use for /merge or merge-into-branch requests."
---
# Merge

Merge the **current** branch into a **target** branch with a real (`--no-ff`)
merge commit. The target is the argument the user passes, or `main` when none is
given. The source is whatever branch is currently checked out.

## Resolve inputs

1. `source` = `git branch --show-current`. If this is empty (detached HEAD),
   abort and tell the user to check out a branch first.
2. `target` = the branch name in the arguments; default to `main` when no
   argument is given.
3. If `source == target`, abort — there is nothing to merge because the user is
   already on the target branch. Say so explicitly.

## Pre-flight

4. Run `git status --porcelain`. If the working tree is dirty, **stop** and ask
   the user to commit or stash first. Do not stash silently — uncommitted work
   is the user's to manage.
5. Confirm both branches exist: `git rev-parse --verify <target>` and
   `git rev-parse --verify <source>`.

## Merge

6. `git switch <target>`.
7. If `<target>` has an upstream, update it: `git pull --ff-only`. If the
   fast-forward fails, stop and report — the target diverged from its remote and
   the user must reconcile that first.
8. `git merge --no-ff <source>`.
9. **On conflict:** stop immediately. List the conflicting files
   (`git diff --name-only --diff-filter=U`), tell the user to resolve them, and
   do not attempt automatic resolution or `git merge --abort` unless asked.
10. **On success:** report the merge commit and the diffstat. Stay on the target
    branch.

## Guardrails

- **Never push.** Pushing is a separate, outward-facing step — only do it if the
  user explicitly asks.
- Never force-merge, never `--strategy-option theirs/ours`, and never discard
  changes to resolve a conflict unless the user explicitly directs it.
- If anything is ambiguous (e.g. multiple remotes, no upstream on target),
  surface it and ask rather than guessing.

For a single squashed commit instead of a merge commit, use `merge-squash`.
