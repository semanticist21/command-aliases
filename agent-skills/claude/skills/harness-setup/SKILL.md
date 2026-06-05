---
name: harness-setup
description: Install a portable agent handoff harness into a target repository — a git-changed-files guard that nudges the agent about missing tests and stale docs, plus a self-documentation directive in the root agent doc that tells every future session to record overwrite-risks and repeat-traps as it works (a `doc/` durable-docs home with an append-only playbook). Wired as a blocking pre-commit check and a warn-only end-of-turn reminder. Use when the user asks to set up an agent harness, install harness checks, add a handoff guard, make the agent self-document gotchas/mistakes automatically, wire pre-commit + Stop-hook agent reminders, or enforce test/doc pairing in a project.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(git rev-parse*)
  - Bash(git status*)
  - Bash(git diff*)
  - Bash(git ls-files*)
  - Bash(ls*)
  - Bash(cat*)
  - Bash(node*)
  - Bash(test*)
---

# Agent Harness Setup

Install a small, runtime-agnostic guard that runs over a repo's changed files and
reminds the agent to keep tests and durable docs in sync at handoff. It runs in two
modes from one script: **blocking** (pre-commit / CI, exits non-zero on error) and
**reminder** (`--reminder`, warn-only, always exits 0 — for an end-of-turn hook).

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
    `.git/hooks/pre-commit`) and any `.claude/settings.json`
  - whether a task runner / package manifest exists (don't assume one)

### 2. Choose a setup level (match it to the target, confirm if unsure)

- **minimal** — drop the check script + `harness.config.json` only. The user runs it
  manually (`node agent-harness-check.mjs --worktree`). No hooks installed. Best for
  repos with no hook tooling or where the user wants zero wiring.
- **standard** — minimal **plus** a pre-commit hook that runs the check on staged
  files (blocking). Wire it through the target's existing hook manager if one is
  present; otherwise append to (or create) `.git/hooks/pre-commit` without removing
  existing lines.
- **full** — standard **plus** an agent end-of-turn reminder (warn-only) and any
  convenience aliases. For Claude Code, add a `Stop` hook running the check with
  `--reminder`. Add a package/task alias only if the target already has a manifest.

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

### 3b. Scaffold the durable-docs home (default unless the repo already has one)

The harness only *reminds* — it never writes docs. To make the reminder land
somewhere, the repo needs a place for durable context to accumulate. Unless the
target already has an equivalent, create a `doc/` directory at the repo root:

- `doc/README.md` — index + the routing convention (table below).
- `doc/architecture.md` — the **base skeleton**: shape, module/dependency order,
  core invariants, open decisions. Seed it from the repo's existing AGENTS/README.
- `doc/playbook.md` — **append-only gotchas log**. One entry per trap a future
  session would otherwise re-learn. Seed with the entry format
  (`## YYYY-MM-DD — title` / **Trap:** / **Truth:** / **Apply:**).
- `doc/plan/` — scoped work-in-progress notes (`.gitkeep` if empty).

Routing convention to put in `doc/README.md`:

| Kind | Location |
| --- | --- |
| Base skeleton — architecture, module plan, design decisions | `doc/architecture.md`, package `AGENTS.md` |
| Gotchas / mistakes / surprises | `doc/playbook.md` (append-only) |
| Plans / WIP | `doc/plan/` |
| Agent instructions | root `AGENTS.md` |

Then wire it in `harness.config.json` (config only, no script edit): add
`"playbook.md"` to `docFileNames` so updating the gotchas log satisfies the
durable-doc check, and point `durableSourceGlobs` at the source trees whose
changes should trigger the doc reminder. The accumulation loop is: source
changes → harness reminds at commit/handoff → the agent records the durable bit
(skeleton in `architecture.md`/`AGENTS.md`, every gotcha as one `playbook.md`
line). Do not overwrite an existing `doc/` or its files — merge or ask.

### 3c. Add the self-documentation directive to the root agent doc (always)

The harness script never writes — the *agent* does, and only if its standing
instructions tell it to. So the real "make it automatic" step is prose, not
code: append a short directive to the target's root `AGENTS.md` (or `CLAUDE.md`)
telling every future session to self-document as it works. No hook required (a
Stop hook is optional reinforcement, not the mechanism). Add a few lines like:

> **Self-document as you work (do this without being asked).** When a change has
> durable consequences a future session would re-learn:
> - Edited something **easy to overwrite/clobber** or non-obvious in shape → note
>   the constraint in `doc/architecture.md` or the nearest `AGENTS.md`.
> - Hit a **trap/gotcha or a mistake likely to repeat** → append one line to
>   `doc/playbook.md` (`## YYYY-MM-DD — title` / **Trap:** / **Truth:** / **Apply:**).
>
> The harness only reminds; it never writes. Any harness `WARN`, or noticing the
> above mid-edit, is the trigger to write the note yourself.

Merge into the existing durable-docs section if there is one; don't duplicate.
This directive is the core of the harness — install it even at the **minimal**
level, regardless of whether any hook is wired.

Also install a **comment-thoroughness directive** into the same root agent doc,
so future sessions write explanatory comments by default:

> **Comment for the next reader by default.** When writing or changing code,
> explain the *why* — intent, constraints, trade-offs, and non-obvious
> invariants — not just the *what*. Add a clear comment to every
> exported/public declaration and to any non-trivial or surprising logic. Match
> the file's language (incl. Korean where that's the house style) and the
> surrounding comment style; favor a real explanation over a terse restatement
> of the code. Drop or rewrite a comment that no longer matches the code.

This is prose, not the blocking `roleComments` check (Boundaries) — install it at
every level. Where `roleComments` is also enabled the two complement each other:
the check enforces that a comment is *present*, this directive sets its *depth*.
If the repo's agent doc already states a comment/style policy, merge into it
rather than contradicting it.

### 4. Wire hooks conservatively (standard / full)

- **pre-commit**: prefer the existing hook manager. Add a job that runs
  `node scripts/agent-harness-check.mjs --staged`. If editing `.git/hooks/pre-commit`
  directly, append and preserve existing content; make it executable.
- **Claude Stop hook** (full): merge into `.claude/settings.json` without dropping
  existing hooks — add a `Stop` command hook running
  `node scripts/agent-harness-check.mjs --reminder || true` (cd into the repo root
  first). If a `Stop` hook already exists, show the user the merge before applying.

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

### 6. Agent-review the setup (before declaring done)

Don't trust your own install blind — run an independent review pass over the
setup, then fix what it finds. Spawn a subagent (Agent tool, or the
`agent-review` skill if present) scoped to the harness changes only, and have it
check, against the actual repo state:

- **Config matches reality** — `sourceExtensions` cover the languages present;
  `testPatterns` match where tests actually live; `ignorePrefixes` cover real
  build/vendor dirs; `testableGlobs`/`durableSourceGlobs` point at trees that
  exist and aren't so broad they spam, nor so narrow they miss the core.
- **The directive landed** — the self-documentation block (step 3c) is in the
  root agent doc and not duplicated; `doc/` home exists and `docFileNames`
  includes the playbook so updating it satisfies the durable-doc check.
- **Hooks fire and don't clobber** — pre-commit runs the check without dropping
  pre-existing hook lines; any Stop-hook merge preserved existing hooks.
- **No false green / no false alarm** — make a throwaway source edit and confirm
  the harness WARNs as intended; touch the paired doc and confirm it clears.
  Confirm a clean tree reports `ok`.
- **Script is verbatim** — `agent-harness-check.mjs` was copied unmodified; all
  per-repo behavior lives in the JSON.

Feed the review findings back, fix them, then give the user a short verdict:
what was checked, what was wrong and fixed, what (if anything) needs their call.

## Boundaries

- **Do not create branches.** Install on the current branch (including `main`) and
  commit there if the user asked to commit. Do not branch just because a global/default
  policy says to — branch only when the user explicitly requests it. When installing the
  self-documentation directive (step 3c), add the same rule to the target's root agent
  doc so future sessions inherit it: *don't create branches unless explicitly asked.*
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
