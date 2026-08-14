# Global Agent Harness

- Document only durable explicit user decisions or verified constraints that code/tests/comments cannot own.
- One fact, one owner. Keep current state; delete history, measurements, walkthroughs, routine commands, and duplicates. Partial/local docs stay under 50 lines.
- Cross-project user preferences live in `~/.agents/doc/AGENTS.md`; machine-local facts live in `~/.agents/doc/AGENTS.local.md`. Read either only when relevant.
- Do not create status, handoff, memory, plan, audit, or checklist files by default.
- Ask one focused question before a non-mechanical or conflicting choice. Match process, review, tests, and cleanup to actual risk.
- When using the `task` skill, always merge the completed task branch/worktree before reporting completion.
- Report any blocking condition to the user immediately and explicitly.
