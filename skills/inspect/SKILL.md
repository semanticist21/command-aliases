---
name: inspect
description: Investigate bugs, audit systems, research technical questions, improve project quality, or remove demonstrably dead code.
---

# Inspect

Choose the narrowest mode from the request; ask only when modes would materially change scope.

- `bug`: lock the symptom and last-known-good boundary, test adversarial hypotheses, reproduce the winner, and report cause, evidence, reach, and uncertainty. Do not fix unless asked.
- `audit`: define scope and invariants, inspect code/config/tests/history, and report only reachable evidence-backed findings. Never edit.
- `research`: cross-check the open question against primary sources and give a decisive conclusion with uncertainty.
- `quality`: read and follow [references/quality.md](references/quality.md). Edit only when improvement was requested.
- `dead-code`: prove unreachability across references, entrypoints, reflection/config/generated consumers, and public compatibility; remove the smallest complete chain only when removal was requested.

Start read-only, preserve applicable instructions, verify proportionally, and create no handoff or process file.
