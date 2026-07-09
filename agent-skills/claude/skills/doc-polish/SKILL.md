---
name: "doc-polish"
description: "Compact repo harness docs through edit-review cycles."
---
# Doc Polish

Compact and de-duplicate repository harness documents so future Claude Code or
Codex sessions can load them with less context cost and fewer contradictions.

Use this skill when the user asks to compact, polish, compress, or reduce redundant
content in repo-local agent/harness docs such as `AGENTS.md`, `CLAUDE.md`,
`.agents/`, `.codex/`, `.claude/`, `harness.config.json`, or harness handoff docs
that define agent operating rules. Do not use it for general product docs, API
docs, release notes, or status updates unless the user explicitly includes them
in the harness-doc scope.

## Goal

Preserve every durable rule, command, ownership boundary, gotcha, and safety
constraint while removing redundant wording, stale repetition, and low-signal
process narration. A document that is already concise, canonical, and
non-duplicative should be left unchanged and reported as skipped.

## Workflow

1. **Map the repo.**
   - Resolve the repo root with `git rev-parse --show-toplevel`.
   - Read root `AGENTS.md` and/or `CLAUDE.md` first, then any nested `AGENTS.md`
     that governs the harness docs being edited.
   - Inventory harness docs with `rg --files` before editing. Include obvious
     agent runtime folders and harness config, but exclude generated/vendor/build
     output.
   - Build a short index: document path, owner/scope, canonical subjects, and
     duplicate subjects found elsewhere.

2. **Choose document order.**
   - For each duplicated subject, identify the canonical owner first: the most
     local applicable doc wins unless a root doc explicitly owns that policy.
   - Move or preserve the full rule in that canonical owner, then replace other
     copies with short references only when the owner is unambiguous.
   - If two docs both claim ownership, or if moving a rule would weaken a local
     constraint, stop and ask instead of choosing a winner.

3. **Compact one document at a time.**
   - Keep facts that affect future agent behavior: commands, file paths, review
     rules, safety constraints, hidden setup requirements, and durable decisions.
   - Remove redundant restatements, obsolete narration, repeated examples, vague
     reminders, and long explanations that do not change agent behavior.
   - Preserve stricter local rules. Do not weaken safety, test, doc, secret,
     approval, or ownership constraints.
   - Keep trigger wording and headings clear enough that Claude Code and Codex can
     route future work without rereading the whole repo.
   - Do not invent new project lore or infer history from code shape. If a fact is
     ambiguous, report it instead of encoding it.

4. **Run the per-document review loop as a before/after comparison.**
   - After editing each document, run an independent review that compares the
     BEFORE and AFTER side by side — not the AFTER in isolation. BEFORE comes
     from `git show HEAD:<path>` (or a saved pre-edit copy for files outside the
     repo); AFTER is the working-tree file. Use a review subagent when available,
     or a clearly separate review pass when the runtime has no subagent tool. Do
     not count the edit pass as review.
   - Give the reviewer both versions and ask for severity-tagged findings on
     durable rules, commands, paths, ownership/safety constraints, and
     Why-trade-offs present in BEFORE but missing or weakened in AFTER; plus
     over-compression, unclear triggers, stale references, contradicted owner
     docs, and remaining redundant content. Have it confirm the line-count goal
     was met (tolerate over-target when content is necessary — do not demand
     cutting a rule to hit a number).
   - Fix confirmed findings, then review the same document again.
   - Repeat `agent edit -> before/after review` until the reviewer returns zero
     findings. If findings stop decreasing or require product/ownership judgment,
     stop and report the blocker instead of guessing.

5. **Global pass.**
   - Re-read the index after all per-document loops. Confirm every duplicated
     subject has exactly one canonical owner or an intentional short reference.
   - Search for broken references to renamed headings or moved docs.
   - Run the repo's narrow doc/harness check if one exists; otherwise run
     `git diff --check`.

6. **Report.**
   - List docs changed and the reason each changed.
   - List docs skipped because they were already optimized.
   - Report review convergence: rounds per changed doc, final findings count
     (zero unless a blocker was surfaced), and the before/after line-count delta.
   - Mention verification commands and any unresolved ownership questions.

## Guardrails

- Do not touch application code unless the user explicitly asks for code changes.
- Do not delete rules just because they are verbose; preserve the behavior in
  shorter language.
- Do not merge runtime-specific instructions when Claude Code and Codex genuinely
  need different wording or mechanisms.
- Do not compact secrets, credentials, or private machine paths into broader docs.
  Remove accidental secret-like material only after confirming it is not required
  harness context.
- Do not create a status log. This skill improves durable harness docs only.
