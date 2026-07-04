---
name: "skill-add"
description: "Alias skill-sync for $skill-add or reusable Claude+Codex user skills."
user-invocable: true
argument-hint: "<skill name and behavior>"
metadata:
  short-description: Add a skill to Claude and Codex together
---
# Skill Add

Load the sibling `../skill-sync/SKILL.md` under the same skill root and follow its
**Create or update one skill** workflow. Preserve the `$skill-add <skill name and
behavior>` interface, but keep the canonical workflow in `skill-sync` so
skill-management instructions do not drift.
