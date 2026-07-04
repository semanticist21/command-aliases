---
name: harness-setup
description: "Install agent workflow safety harnesses with changed-file guards and test/doc nudges."
metadata:
  short-description: Install a portable agent handoff harness into a repo
---
# Agent Harness Setup

Install a small, runtime-agnostic guard that runs over a repo's changed files and
reminds the agent to keep tests and durable docs in sync at handoff. One script, two
modes: **blocking** (pre-commit / CI, exits non-zero on error) and **reminder**
(`--reminder`, warn-only, always exits 0 — for an end-of-turn check).

The harness is intentionally generic. The bundled `reference/agent-harness-check.mjs`
reads a `harness.config.json` for all paths/extensions/patterns, so the *script* is
never edited per project — only the *config* is. Plain Node ESM, no package-manager
or language assumptions.

## Workflow

Analyze before writing. Never clobber existing project policy — merge conservatively
and report or ask when a target file already exists.

### 1. Locate and inspect the target

- Resolve the repo root: `git rev-parse --show-toplevel` (default to cwd; use a path
  if the user gave one). If it is not a git repo, stop and offer `git init`.
- Map the stack and conventions before deciding anything:
  - source layout (top-level source dirs, where tests live, test naming)
  - existing agent docs (`AGENTS.md`, `CLAUDE.md`, `doc/`)
  - existing hook manager (`lefthook.yml`, `.husky/`, `.pre-commit-config.yaml`,
    `.git/hooks/pre-commit`)
  - whether a task runner / package manifest exists (don't assume one)

### 2. Choose a setup level (match it to the target, confirm if unsure)

- **minimal** — drop the check script + `harness.config.json` only. The user runs it
  manually (`node agent-harness-check.mjs --worktree`). No hooks installed. Best for
  repos with no hook tooling or where the user wants zero wiring.
- **standard** — minimal **plus** a pre-commit hook that runs the check on staged
  files (blocking). Wire it through the target's existing hook manager if one is
  present; otherwise append to (or create) `.git/hooks/pre-commit` without removing
  existing lines.
- **full** — standard **plus** a warn-only end-of-turn reminder and any convenience
  aliases. Run the check with `--reminder` from whatever end-of-turn or post-task
  mechanism the host agent supports; if none exists, document the manual command.
  Add a package/task alias only if the target already has a manifest.

When the target situation is ambiguous (multiple hook managers, no manifest, unusual
layout), ask the user which level they want rather than guessing.

### 3. Write the files (into the target repo, not this skill)

Copy the two reference files into the target and tailor only the config:

- `<root>/scripts/agent-harness-check.mjs` ← `reference/agent-harness-check.mjs` (verbatim)
- `<root>/harness.config.json` ← start from `reference/harness.config.example.json`,
  then tailor to the inspected stack:
  - `sourceExtensions` → languages actually present
  - `testPatterns` → the repo's real test naming/location
  - `ignorePrefixes` → its build/output/vendor dirs
  - `testableGlobs` → trees where a source change should be paired with a test
    (`[]` = warn for any source change; narrow it to reduce noise)
  - `durableSourceGlobs` → trees whose nearest agent-doc should stay current
  - `docFileNames` → whatever the repo uses for durable agent notes

Keep the script identical across projects so it stays maintainable; per-repo behavior
lives entirely in the JSON.

### 3b. Install a comment-thoroughness directive in the root agent doc (always)

The check never writes code or comments — the *agent* does, guided by standing
instructions. Append a short directive to the target's root `AGENTS.md` (or
`CLAUDE.md`) so future sessions write explanatory comments by default:

> **Comment for the next reader by default.** When writing or changing code,
> explain the *why* — intent, constraints, trade-offs, and non-obvious
> invariants — not just the *what*. Add a clear comment to every
> exported/public declaration and to any non-trivial or surprising logic. Match
> the file's language (incl. Korean where that's the house style) and the
> surrounding comment style; favor a real explanation over a terse restatement
> of the code. Drop or rewrite a comment that no longer matches the code.

Merge into an existing comment/style policy if there is one; don't duplicate or
contradict it. This is prose, not the blocking `roleComments` check (Boundaries)
— install it at every level. Where `roleComments` is also enabled the two
complement each other: the check enforces that a comment is *present*, this
directive sets its *depth*.

### 3c. Install a concept/history record discipline directive (always)

Append or merge a short directive into the same root `AGENTS.md` (or `CLAUDE.md`) so
future sessions do not turn agent interpretation into durable project lore:

> **Record only user-given project concepts.** Durable docs may record reusable
> project concepts, naming, history, and corrections only when the user explicitly
> provided that concept or explicitly asked to fix that mistaken concept. Do not
> infer new product/history concepts from code shape, UI copy, issue context, or
> agent interpretation. If a durable note is useful but its concept source is
> ambiguous, report it to the user instead of writing it as project history.

Merge into any existing history/memo/doc policy without weakening stricter local
rules. This does not block verified technical facts such as real commands, paths,
APIs, or file ownership; it only prevents inferred concept/history records from
being written as if the user had supplied them.

### 4. Wire hooks conservatively (standard / full)

- **pre-commit**: prefer the existing hook manager. Add a step that runs
  `node scripts/agent-harness-check.mjs --staged`. If editing `.git/hooks/pre-commit`
  directly, append and preserve existing content; make it executable.
- **end-of-turn reminder** (full): run `node scripts/agent-harness-check.mjs
  --reminder || true` from the host agent's post-task / end-of-turn hook if it has
  one. Do not invent a config file the host doesn't read — if there is no such
  mechanism, leave it as a documented manual command and tell the user.

### 5. Verify, then report

Run from the target root and show output:

```bash
node scripts/agent-harness-check.mjs --all
node scripts/agent-harness-check.mjs --worktree
git diff --check
```

Confirm the pre-commit path actually fires (e.g. stage a source file and run the hook
manager's pre-commit, or run the staged check). Report: files added/edited, the chosen
level, config decisions, and anything left for the user (e.g. installing a hook
manager).

## Boundaries

- Do not overwrite a target's existing config, hook, or policy file silently. Append,
  merge, or ask.
- Do not assume a specific runtime, package manager, formatter, or linter — the check
  is Node ESM and language-agnostic. Wire formatters only if the target already has
  them and the user wants them in the same hook.
- Role comments are **opt-in and off by default**. If a target wants mandatory
  one-line role comments on exported/public declarations, enable it via
  `roleComments` in `harness.config.json` (no script edit). Each rule:
  `{ "pathPrefix": "src/", "extensions": [".ts",".tsx"], "lang": "js"|"rust",
  "requireHangul": false, "exclude": ["generated.ts"] }`. Set `requireHangul: true`
  to require the comment be written in Korean. These are **blocking errors** (fail
  pre-commit / CI; downgraded to warnings under `--reminder`). Confirm with the user
  before enabling — it is a house style, not a baseline default.
