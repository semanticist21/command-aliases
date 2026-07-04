---
name: merge-squash
description: "Squash-merge the current branch into a target branch for /merge-squash."
---
# Merge (squash)

Collapse the **current** branch into a single new commit on a **target** branch
using `git merge --squash`. The target is the argument the user passes, or
`main` when none is given. The source is whatever branch is currently checked
out.

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

## Squash-merge

6. `git switch <target>`.
7. If `<target>` has an upstream, update it: `git pull --ff-only`. If the
   fast-forward fails, stop and report — the target diverged from its remote and
   the user must reconcile that first.
8. `git merge --squash <source>`. This stages the combined changes but does
   **not** create a commit.
9. **On conflict:** stop immediately. List the conflicting files
   (`git diff --name-only --diff-filter=U`), tell the user to resolve them, and
   do not attempt automatic resolution or `git merge --abort` unless asked.
10. **On success:** create one commit. Write a Conventional Commit subject that
    summarizes the whole branch (read `git log <target>..<source>` to inform the
    message). Commit, then report the new commit and diffstat. Stay on the
    target branch.

## Guardrails

- **Never push.** Pushing is a separate, outward-facing step — only do it if the
  user explicitly asks.
- A squash merge does not record the source branch as merged — git will not show
  the branch as merged afterward. Mention this if the user expects to delete the
  source branch by `--merged` detection.
- Never force-merge and never discard changes to resolve a conflict unless the
  user explicitly directs it.
- If anything is ambiguous (e.g. multiple remotes, no upstream on target),
  surface it and ask rather than guessing.

For a real merge commit that preserves source history, use `merge`.
