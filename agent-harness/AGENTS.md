# Global Agent Harness

Template for every project. `~/.claude/CLAUDE.md` symlinks here — Claude Code and Codex read the same
rules. Only what is true in any repo. Ports, container names, doc paths, gate commands: the project's own
`AGENTS.md`.

**Precedence:** project `AGENTS.md` > this file > any skill. A skill that contradicts the project loses —
follow the project and name the conflict in your report.

## Writing things down

If the structure or the code shows it, do not write it. A type, schema constraint, test name, or directory
layout that already answers the question *is* the answer; prose repeating it rots on its own schedule.
Delete such prose when you meet it.

Two things earn a durable note, and nothing else:

1. **A decision the user stated.** Not one you inferred. Write it in the turn it is given, at its canonical
   home — a decision living only in chat gets re-asked.
2. **A verified fact the code cannot show** that would cost the next session real time: a command's actual
   effect, a tool's failure mode, an environment quirk. One or two sentences at the nearest harness file.

Everything else stays in the conversation. One home per fact; elsewhere cites it. When two records
disagree the newer wins and `git log` decides which is newer — delete the stale one in the same change,
along with its restatements. Never resolve a contradiction by asking the user to repeat themselves.

**Memory** (`~/.claude/projects/*/memory/`) is off by default. Write a file only to survive past this
session when the repo cannot hold the fact, or to brief a subagent you cannot brief in its prompt. Delete
it the round its purpose ends.

## Proportional effort

Match machinery to the job. Small work carries no ceremony: read, change, run the checks the change can
break, report. No reviewer, no journal, no staged plan for a rename, a config value, a copy fix.

Escalate on purpose and say why: many subsystems, a schema or public contract, security, billing, durable
data, something unverifiable locally, or the user asking for depth.

Do not add a checker to guard a rule. A rule needing a new verification layer to survive is usually a rule
that should not exist — remove the failure mode instead of inspecting for it.

## Asking

Before choosing a direction, filling a gap, or making a non-mechanical judgment, ask one focused question
and wait. Mechanical and read-only work proceeds; if it turns up an ambiguity, stop and ask. Automated work
with no channel follows the request and reports the ambiguity. Told to proceed without questions: proceed.

Never re-open a settled decision. Search before recording an open question — an unimplemented detail is a
gap in implementation, not an undecided question.

## Code

One comment per function or meaningful block — that is the floor and roughly the ceiling. Say what it does,
not an inferred why. Do not extract single-use helpers.

## Git

- Primary checkout stays on its base branch; task work goes in a linked worktree. Several sessions run at
  once, so the worktree is not ceremony — it is what keeps them from overwriting each other. It costs
  seconds.
- Land by squash merge. Where CI exists, respect it; where it is absent or unenforceable, local gates are
  the authority — do not idle in a polling loop over a check that gates nothing.
- Stage explicit paths. Never `commit -a`, never `--amend` where other agents commit.
- **Uncommitted changes you did not make are not yours.** Do not commit, stash, reset, or discard them —
  report the paths and leave them. A dirty tree you did not create is the correct outcome. Same for
  worktrees, branches, containers, volumes you cannot prove you created.
- Never `git checkout <path>` or `git restore` on a file that may hold work — no undo, no exceptions.
  Read history with `git show <rev>:<path>` or `git diff`.

## Cleanup

Per round of work, not per session; a follow-up request never postpones it. Before finishing, clear what
this round created plus anything earlier whose absence was never verified.

This covers **files as much as resources.** Scratch plans, audit ledgers, handoff notes, generated
reports — delete them when the round they served ends. A stale document is worse than none: the next
session reads it as current.

Report per category: exact identifier, command and result, the query proving absence, and anything kept
with its reason. "Cleaned up" with no identifiers is not a report.

## Verification

Judge a command by its exit code, not by grepping its output. When a check reports success, confirm it had
subjects — an empty corpus and a clean corpus print the same thing. Claim no check, merge, or UI behavior
without direct evidence.
