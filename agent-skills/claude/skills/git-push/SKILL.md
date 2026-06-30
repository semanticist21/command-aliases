---
name: git-push
description: "Use when the user asks to commit and push current changes. Inspects the working tree, composes a Conventional Commits message, runs the commit, and pushes to the current branch's upstream."
metadata:
  short-description: Commit with Conventional Commits and push
---

# Git Push

Use this skill when the user asks to commit, push, "올려줘", "푸시", or otherwise wants the
current working tree shipped to the remote. Always inspect real changes before composing a
message; never invent a scope or summary.

## Workflow

1. Verify there is something to ship.
   - `git status --short`
   - `git diff --stat` (unstaged) and `git diff --stat --cached` (staged)
   - If both are empty, stop and tell the user "no changes to commit".
2. Read the actual diff before writing the message.
   - `git --no-pager diff` and `git --no-pager diff --cached`
   - For large diffs, read by path with `git --no-pager diff -- <path>`.
3. Stage intentionally.
   - Default to `git add -A` only when every change is clearly part of one logical commit.
   - When the diff covers multiple concerns, ask the user how to split before staging.
   - Never stage files matching `.env*`, `*.pem`, `*.p8`, `*.p12`, or service-account JSON.
     If such files appear, stop and warn the user.
4. Compose the commit message in Conventional Commits format.
   - Header: `<type>(<scope>)<!>: <summary>` (≤ 72 chars, imperative mood, no trailing period).
   - Body (optional): wrap at ~72 chars, explain WHY and any constraint, not WHAT the diff
     already shows.
   - Footer (optional): `BREAKING CHANGE: …`, issue refs (`Refs: #123`, `Closes: #123`).
   - Use `!` after the type/scope for breaking changes and add a `BREAKING CHANGE:` footer.
5. Run the commit.
   - `git commit -m "<header>" -m "<body>" -m "<footer>"` (omit empty `-m` flags).
   - Lefthook `pre-commit` runs Biome on staged files; if it fixes files, re-stage and re-commit.
   - Never bypass hooks (`--no-verify`).
6. Push to the current branch's upstream.
   - Detect branch: `git rev-parse --abbrev-ref HEAD`.
   - If upstream exists: `git push`.
   - If no upstream: `git push -u origin <branch>`.
   - Lefthook `pre-push` runs `bun run typecheck`, Biome, and the import-boundary check. If any
     fails, stop, surface the failure, and do not retry with `--no-verify`.
7. Report the result.
   - Show the final commit subject, short SHA (`git rev-parse --short HEAD`), branch, and
     remote URL line from the push output.

## Conventional Commits Types

Use the smallest accurate type. Pick one:

- `feat` — user-visible feature or capability
- `fix` — user-visible bug fix
- `perf` — performance change with no behavior change
- `refactor` — code change with no behavior change
- `style` — formatting only (no logic change)
- `docs` — docs only (`docs/`, `README.md`, `AGENTS.md`, `*.md`)
- `test` — tests only
- `build` — build system, bundler, or dependency changes (`package.json`, lockfile)
- `ci` — CI config (`lefthook.yml`, `.github/`)
- `chore` — repo maintenance that fits nothing above
- `revert` — reverts a previous commit; body must include `Reverts: <sha>`

## Scope Rules

Scope is optional but preferred. Derive scope from the changed paths:

- `apps/ax-ui/**` → `ax-ui`
- `packages/shared/**` → `shared`
- `packages/kds/**` → `kds`
- `docs/**` → `docs`
- `.agents/**` → `agents`
- `scripts/**` → `scripts`
- Root config only (`package.json`, `biome.json`, `tsconfig*.json`, `lefthook.yml`) → `repo`
- Multiple top-level areas → omit scope; do not invent a composite scope.

## Summary Rules

- Imperative mood: "add", "fix", "remove" — not "added", "fixes", "removing".
- No trailing period.
- No emoji.
- Reference WHAT changed at a behavior level, not the file list.
- Korean or English follows the user's prior commit history; default to English when history is
  mixed or empty.

## Examples

```
feat(ax-ui): add post list pagination
fix(shared): handle 204 responses in api client
docs(docs): add 06-frontend rule set
refactor(kds): split button variants into cva config
build(repo): bump next to 16.2.6 via catalog
chore(agents): add git-push skill
feat(ax-ui)!: replace post id with slug

BREAKING CHANGE: post detail routes now use slug instead of numeric id.
```

## Guardrails

- Never run `git push --force`, `git push --force-with-lease`, `git reset --hard`,
  `git commit --amend` on already-pushed commits, or `git rebase` on shared branches without
  explicit user confirmation.
- Never use `--no-verify` to skip lefthook. Fix the underlying lint/typecheck/boundary failure.
- Never commit secrets. If `git status` shows a suspicious file (`.env*`, keys, tokens), stop
  and warn the user before staging.
- Do not invent issue numbers, co-authors, or breaking-change notes that the diff does not
  support.
- If the branch is `main` / `master` and the repo has feature-branch history, ask the user
  whether to push directly before proceeding.
- If the working tree contains unrelated in-progress changes, propose splitting commits
  instead of bundling them.
