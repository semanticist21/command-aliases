# Agent Harness Best Practices (distilled)

Distilled reference for AI coding agent harnesses (not CI/CD, not test harnesses). Sources as of mid-2026: Andrej Karpathy lectures/tweets/podcasts [K], Anthropic engineering blog and Claude Code docs [A], OpenAI Codex docs and security posts [O], general community synthesis [Gen].

---

## Why harnesses matter (Karpathy's framing)

Karpathy frames "agentic engineering" as "orchestrating spiky, stochastic, mistake-prone agents to increase speed without compromising quality standards" [K]. Under this frame, a harness:

- **Keeps the human-AI loop fast.** Humans are the validation bottleneck. The harness makes validation cheap (small diffs, runnable evidence, readable output) and "pens in" the agent [K] to avoid runaway giant diffs.
- **Is infrastructure for a "ghost".** Karpathy calls LLMs "summoned ghosts" — shaped by data and reward functions but with no intrinsic motivation [K]. The harness provides the sensors (read tools) and actuators (write tools) for this ghost, favoring "agent-first" infrastructure that describes work in structured, machine-readable form (markdown, JSON, `lm.txt`) [K].
- **Ratchets autonomy incrementally.** A harness should expose an "autonomy slider" that has always been there, turning first into an Iron Man suit and later into an Iron Man robot [K]. Gradual, partial autonomy > flashy fully-autonomous demo agents.
- **Frees humans from understanding bottleneck.** Karpathy's frame: "You can outsource AI thinking, but not understanding" [K]. The harness keeps the director holding judgment, taste, and direction while the agent operates.

**Rule:** A harness's goal is not to maximize autonomy — it is to maximize autonomy *in small, verifiable, reversible increments* [K, A].

---

## Context engineering (Anthropic's framing)

Anthropic defines context engineering as "finding the smallest high-signal set of tokens that maximizes the probability of the desired outcome" [A]. It replaces prompt engineering: as models get better, the bottleneck moves to *what goes into the model's limited attention budget*.

### What to load

- **Hybrid strategy wins.** Some data is up-front for speed (CLAUDE.md/AGENTS.md), some is just-in-time via tools (glob, grep, web) [A]. Claude Code is this hybrid: context files are dumped naively; file contents are searched via tools [A].
- **Keep identifiers light.** Instead of memorizing the whole corpus, agents keep file paths, saved queries, URLs as references and load at runtime [A]. Mirrors cognitive working memory.
- **Progressive disclosure.** Agents should build context one layer at a time, taking cues from file size, timestamps, and naming [A]. This is why Claude Code replaces RAG: let the agent build its own context [A].
- **Background first, task later.** Start with general background, add specific details incrementally. Give the model "altitude" before asking it to land [Gen].

### When to change it

- **Context length ≠ quality.** Model quality degrades as context grows long, even within window limits. 11 of 13 models drop to half baseline at 32k tokens [Gen].
- **Actively manage context to avoid contamination.** As the context window fills, the model "forgets" early instructions and makes more errors [A]. Anthropic recommends three techniques:
  - **Compaction** — summarize the conversation, keep key architecture, open bugs, implementation state, and restart with the last 5 files + a new window [A]. Maximize recall first, iterate on precision.
  - **Structured notes / agent memory** — regular NOTES.md / to-do / progress files that live outside the context window [A]. Low overhead, persistence across milestones.
  - **Sub-agents** — do deep work in their own window to keep the main agent clean (see below) [A].

**Rule:** Every additional line of static context costs budget before the task is even seen. Do not load what is only needed once per request; make it a tool/skill and fetch on demand [A, Gen].

---

## File size and structure for agent readability

### The 200-500 line rule [Gen, Anthropic codebase analysis]

- **Target: 150-500 lines of pure code per file; most files under 200 lines.** Anthropic's own Claude Code TypeScript codebase has ~64% of files under 200 lines [Gen]. Python/Django practitioners report the same 150-500 range for AI edits [Gen].
- **Why it matters:**
  - Files fit in working memory without truncation.
  - Diffs stay reviewable (a 2000-line file edited produces an unreviewable diff).
  - `git status` tells you what changed meaningfully.
  - Token cost scales with the whole file at read/write, not fragments.
- **Thresholds:**
  - **< 150 lines:** leave alone; short focused files are fine [Gen].
  - **~300 lines:** look for natural split points and start extracting classes/modules [Gen].
  - **~500 lines:** soft hard limit.
  - **250 / 500 / 1000 lines:** common upper bounds in coding rules. 250 LOC of pure code triggers a refactor; 500 is a warning; 1000 is strong pressure to split [Gen, this repo's rule].
- **Anti-pattern that hurts performance:** over-splitting into one-file-per-class (navigation overhead), arbitrary splits that break single responsibility [Gen].

### Structure rules

- **Bulletproof-style slices.** One folder per feature: `api/` (requests + queryOptions), `hooks/`, `schemas/` (zod + inferred types), `utils/`. Components consume these directly [Gen].
- **Co-located tests.** `*.test.ts[x]` next to source; increases discoverability and documents patterns [Gen].
- **Per-extension wildcard exports (no barrel).** Package exports expose folders by `*.ts` / `*.tsx`. Per-extension fallback breaks Bun/Next [Gen].
- **Constants and types accessible.** Document cycle-breaking decisions in file headers; use `import type` for type-only imports [Gen].
- **Golden rule [Gen]:** "Can Claude load fewer than 5 files and understand the full context of a feature?"

---

## Tool design principles

Anthropic's frame: "Tools are the contract between the agent and the information/action space" [A]. Good tools are token-efficient and shape agent behavior efficiently.

### Shape

- **Small, composable, single-purpose.** [A] Claude Code has ~20 tools; the bar for adding a new one is high [A].
- **One responsibility per tool.** Pick names that reflect natural sub-tasks. If the agent makes mistakes, redesign the tool itself (pokayoke) [A].
- **When to promote a dedicated tool over bash:**
  - **Security boundary.** Irreversible actions (email, delete, external API) should have a dedicated tool the user can gate [A].
  - **Freshness checks.** `edit` can refuse if file changed — bash cannot enforce this [A].
  - **Rendering.** Modal questions, confirmations [A].
  - **Scheduling.** Read-only tools like `glob`/`grep` can be marked parallel-safe; bash cannot [A].
- **Start with bash, promote when needed.** When you must gate, render, audit, or parallelize [A].

### Names and schema

- **Clearly distinguishable names.** Group by prefix: `asana_projects_search`, `asana_users_search` [A].
- **Unambiguous parameters.** `user_id` not `user`. Strict data model [A].
- **Write descriptions like docs for a junior.** Include usage examples, edge cases, input format requirements, clear boundaries with other tools [A].
- **Add usage examples when schema alone is ambiguous.** 1-5 examples with real data; avoid placeholders like "string" / "value" [A].

### Response hygiene

- **Token efficiency.** Claude Code limits tool responses to 25,000 tokens by default [A]. Use pagination, filtering, truncation, meaningful defaults.
- **Low-level IDs regress.** Avoid `uuid`, `mime_type`, `256px_image_url`. Return task-relevant fields like `name`, `image_url`, `file_type` [A].
- **Enrich context.** Combine frequent multi-step calls into one, add related metadata [A].
- **Concise vs verbose on request.** Expose `response_format: "concise" | "detailed"` enum so the agent controls token cost [A].

### Iteration

- **Evaluate on real workloads.** Use real data and multi-call tasks, not toy sandboxes [A].
- **Watch the agent and fix the loop.** If the agent passes the wrong parameter 3 times in a row, rename the parameter or redesign the tool [A].

**Rule:** Anthropic spent more time on tools than on the overall prompt on SWE-bench [A].

---

## Sub-agent and multi-agent patterns

### When to delegate

- **Use sub-agents to isolate large outputs** (logs, search results, file reads) into their own window, returning only a summary [A].
- **Define custom sub-agents** when you spawn the same kind of worker repeatedly [A].
- **Run independent sub-tasks in parallel, not sequential.** Sub-agents complete in the time of the slowest sub-task [A].

### Context-saving rules

- **A sub-agent can spend tens of thousands of tokens in its own window while returning a 1,000-2,000 token summary** [A]. This is the most powerful context-preservation tool.
- **Multi-agent systems consume ~15x more tokens** to produce better results [A, Gen] — use them only when the outcome justifies the cost.
- **Keep to 3-7 custom agents** in most production setups. More than 10 dilutes discovery signal [Gen]. Use "voluntarily uses" prompts to drive autonomous delegation [A].

### Patterns

- **Specialist pool:** one per domain (test, security, docs, perf) [Gen].
- **Gatekeeper:** one agent checks preconditions before another operates (e.g. pre-deploy inspector) [Gen].
- **Scoped specialist:** an agent scoped to a monorepo package (e.g. db-migrations agent) [Gen].
- **Adversarial reviewer:** a sub-agent with a separate context from the implementation session is not biased toward its own code [A]. Tell reviewers to "find flaws" but instruct them to report only correctness/requirement issues — otherwise they cause over-engineering [A].
- **Fork vs named sub-agent:** use fork when trying multiple approaches from the same context to reuse prompt cache and keep the main clean [A].
- **Keep delegation one level deep.** Deeply nested delegation dilutes context and increases cost [Gen].

### Long-running multi-agent harness

Anthropic's 3-agent architecture [A]:
- **Planner:** expands a 1-4 sentence prompt into a full spec; focus on product intent, avoid detailed technical spec (cascading errors).
- **Generator:** one feature task at a time; self-evaluates after each sprint.
- **Evaluator:** uses Playwright MCP to click through the UI/API/DB like an end-user; hard thresholds on each criterion; feedback to Generator on bugs found.

Key iteration learning: **every component of a harness encodes an assumption about what the model cannot do itself.** When a new model ships, stress-test what is no longer load-bearing and remove it [A].

**Rule:** "Find the simplest solution that could possibly work, and only increase complexity when needed" [A].

---

## Documentation hierarchy: AGENTS.md → docs/ → folder-local AGENTS.md

### Hierarchy

1. **Repo root `AGENTS.md`** (or symlinked CLAUDE.md): project direction, build/test/lint commands, architecture pointers, workspace rules, backlinks to per-folder AGENTS.md [Gen].
2. **`docs/`:** topic docs like coding-rule, component-spec, playbooks, security notes. AGENTS.md points to these [Gen].
3. **Folder-local `AGENTS.md`:** ownership, constraints, decisions, gotchas for that folder. 10-30 lines, no dates, no routine edits [Gen].
4. **Skills (task knowledge):** `SKILL.md` folders load only the description by default, full content when a task matches. AGENTS.md is for project context; skills are for repeatable workflows [Gen, A].

### Root AGENTS.md rules

- **~100-150 lines of pointers, not an encyclopedia.** Knowledge lives in `docs/`, the agent navigates as needed [Gen]. Target length 200-500 lines applies to single files that contain everything inline; split if too large [Gen].
- **Statements, not README prose.** "Use pnpm, not npm." Exact shell commands in backticks, not "prefer" [Gen].
- **Use negative examples freely.** "Don't use class components in /web" blocks a whole class of repeated mistakes [Gen].
- **Make CI commands statements.** "Run `./gradlew detektFix` before committing" turns self-talk into a forced step; pair with a pre-commit hook [Gen].
- **Pin tool versions.** Unpinned, agents drift to common patterns from training data [Gen].
- **Include a Definition of Done checklist** so agents can self-verify before declaring a task complete [Gen].

### Monorepo / hierarchical loading

- **The nearest AGENTS.md wins.** Explicit user chat overrides everything [Gen]. Avoid conflicting rules (root: single quotes, subdir: double quotes → inconsistent output).
- **Single source + symlink.** For multi-tool teams (Codex + Claude Code + Cursor), keep one `AGENTS.md` and symlink (`CLAUDE.md` → `AGENTS.md`) to avoid drift [Gen].
- **Distributed convention can be agent-written.** Ask an agent to work on a context it does not find, have it write the appropriate AGENTS.md, then review before commit [Gen, OpenAI Sora Android case].

### Failure modes

- **Stale content:** agents faithfully follow commands that no longer exist. Treat AGENTS.md as code, update it in the same PR [Gen].
- **Context over-consumption:** ETH Zürich eval says context files increase inference cost by 20% on average [Gen]. Link instead of inlining knowledge.
- **Mismatch with dynamic environment:** a single root file cannot cope with frequent toolchain changes; prefer hierarchical local files or MCP/skills [Gen].

**Rule:** Treat AGENTS.md as code: review in PRs, assign owners, pin versions [Gen].

---

## Safety harnesses

### Sandbox and approvals [O]

OpenAI Codex's principle: **"productive within a restricted environment, low-risk routine work should be frictionless, and high-risk work should halt for review"** [O].

- **Sandbox modes:**
  - `read-only` — exploration only.
  - `workspace-write` (default for most real work) — read, edit within workspace, run routine commands [O].
  - `danger-full-access` / `--yolo` — sandbox off. Never on critical machines [O].
- **Approval policy:** `untrusted`, `on-request` (default), `never`. Pick the narrowest [O].
- **Network is off by default.** Cloud Codex has outbound disabled [O]. Local `workspace-write` network is opt-in. Since most exfil paths need network, this is the most valuable guardrail Codex offers [O, CybeDefend].
- **OS-level enforcement:** Seatbelt on macOS, Landlock + seccomp + bwrap on Linux, dedicated sandbox on Windows (separate `CodexSandboxOffline`/`CodexSandboxOnline` accounts with restricted tokens) [O].
- **Auto-review mode** (where available): auto-approves low-risk approval requests within the same sandbox boundary; critical actions still surface [O].
- **Isolate untrusted work.** Unfamiliar repos, third-party issues, anywhere prompt injection can reach — run in a container/VM with no host passwords mounted [O].

### Local hook layer [Gen, this repo's rules]

- **Pre-commit fast and narrow:** staged secret scan, staged-diff policy, source-pattern rules [Gen].
- **Scan staged content, not working tree** — partial staging is normal, so otherwise the hook lies [Gen].
- **Critical-path protection:** `.github/workflows`, CI config, deployment manifests, scanner config, suppression files (`// nosemgrep`, `@SuppressWarnings`) are not normal edit surface [Gen].
- **Pre-push hooks:** typecheck, `biome check .` (or equivalent), import-boundary check. Keep the Biome `noRestrictedImports` group in sync when adding a new app [this repo].

### Worktree isolation [Gen, Anthropic agent team guide]

- **One worktree per session** (Claude Code's `--worktree`, `claude-squad`, Conductor etc). Cheapest structural isolation [Gen].
- **Worktree is isolation by convention only.** Absolute paths can still resolve to the parent checkout [GitHub issue #56137]. You need PreToolUse hooks:
  - Reject any Write/Edit/MultiEdit that resolves outside the active worktree.
  - Reject sub-agent dispatches that do not pin the worktree root (sub-agents do not inherit cwd reliably).
- **Serialized merge path.** N parallel worktree branches → N PRs → one-at-a-time merge through a passing-CI gate [Gen].
- **Be aware of shared things:** git internals (ref packing, object store), global state (`~/.claude.json`), runtime (ports, DBs, Docker daemon). Worktree does not isolate these [Gen].
- **Handle runtime conflicts:** unique ports per session, database instances, dependency installs. Use a container per agent for heavy isolation [Gen].

### Diff size guards [Gen, this repo]

- **Hard limit per diff:** commonly 500 lines, 20 files. If the agent consistently hits the limit, the task should be split or the limit recalibrated [Gen].
- **Beware rename cascades:** one rename can cause a hundreds-file diff [Gen].
- **Separate test path limits.** Blocking the tests dir prevents the agent from adding tests [Gen].

### Agent telemetry and audit [O]

- **Agent-aware logs** (OpenTelemetry): user prompt, tool approval decisions, tool results, MCP usage, network proxy allow/deny [O].
- **Traditional security logs tell you "what" happened, not "why" the agent did it.** Codex logs explain intent [O].
- **AI security triage agents** cross-reference endpoint alerts with Codex context to distinguish normal behavior, mistakes, and genuine escalation [O].

**Rule:** Local layer is for speed; CI and merge policy are for authority. [Gen]

---

## Handoff and continuation patterns

### Session boundary [A]

Anthropic's long-running harness pattern:
- **Initializer agent:** runs once. Writes `init.sh`, feature requirements JSON (often 200+ features, all "fail" initially), a progress file, an initial commit [A].
- **Coding agent:** loops. Reads progress + git log, picks highest-priority unimplemented feature, implements one feature, commits, writes progress [A].
- **JSON is better than markdown** for progress files — models are less likely to overwrite JSON incorrectly [A].
- **Strong-tone instructions:** "Do not remove or edit tests as that may mask a feature gap or a bug" [A].

### Context reset [A]

- **Explicit context reset > context anxiety.** Specific Sonnet 4.5 behavior finished early when nearing context limit. Reset + structured handoff artifact fixes it; compaction alone is insufficient [A]. (Opus 4.5+ reduced this anxiety itself.)
- **Session start routine [A]:**
  1. Run `pwd` (edits are confined to this dir).
  2. Read git log + progress notes.
  3. Pick highest-priority unimplemented item from spec.
  4. Run `init.sh` + baseline end-to-end test via Playwright/Puppeteer MCP against dev server to catch existing bugs (so new work does not get blamed for pre-existing breakage).
- **Off-board:** force the agent to leave clean — not just "done" but "ready to merge to main" [A].

### File-based communication [A]

- **Agents communicate across sessions via files** (one agent writes, another responds). Avoid concurrent access to the same memory [A].
- **Generator-Evaluator contract negotiation:** agree on what "done" means before writing code [A].

### Cross-session memory [A]

- **Memory tool / memory directory:** state across sessions (codebase patterns, debugging insights, architecture decisions).
- **Do not put memory files in the mainline.** (Repo policy: prevent `memory.md`, `CLAUDE.md` summaries, `.codex/memories` from being auto-written.)

**Rule:** A handoff artifact must be rich enough that a fresh agent can pick up the work without recovering the previous agent's reasoning [A].

---

## Failure modes and anti-patterns

### Context

- **Infinite exploration.** Unscoped "investigate" reads hundreds of files and fills the main window [A]. *Fix:* scope tightly or move to sub-agent.
- **Context window summation.** Each tool result, each file read accumulates [A]. *Fix:* track `/context` status line, manage aggressively.
- **Compaction without considering signal degradation.** Loses subtle but important details. *Fix:* maximize recall first in complex traces, then iterate on precision [A].
- **Context corruption.** Inline rarely-needed info into system prompt, distracting main task [A]. *Fix:* progressive disclosure (skills, sub-agents).
- **Giant CLAUDE.md / AGENTS.md.** 500+ line files bury rules [Gen]. *Fix:* 100-150 lines of pointers, knowledge in `docs/`.

### Tools

- **Tools that just wrap an API.** Expose raw functions that are not agent-friendly [A]. *Fix:* design around how the agent naturally subdivides.
- **Overloaded parameter names.** `user` instead of `user_id` [A].
- **Overly verbose responses.** Low-level IDs and raw payloads [A]. *Fix:* pagination, filtering, concise/detailed mode.
- **All-in-one.** "bash can do everything" — prevents gating, rendering, parallelizing, auditing [A].

### Sub-agents

- **Adversarial reviewer told to "find flaws" and fix everything.** Leads to over-engineering, defensive code, impossible tests [A]. *Fix:* restrict reviewer to correctness/requirement flaws.
- **Deeply nested delegation.** Dilutes context, increases cost [Gen]. *Fix:* keep one level deep.
- **Unnamed sub-agents need too much background.** *Fix:* use fork.
- **10+ custom agents defined.** Dilutes discovery signal [Gen]. *Fix:* start with 3-7, add when needed.

### Safety

- **`--dangerously-bypass-approvals-and-sandbox` / `--yolo` on real machines.** Removes all guardrails [O].
- **Accidental network enablement.** Exfil path. *Fix:* turn off after use, narrow target rules [O].
- **Tool overload.** All shell commands treated equally safe unless marked "untrusted". *Fix:* explicit rules, allow known-safe commands, block risky patterns [O].
- **Allow unverified package install.** Supply-chain risk, `codexui-android` token theft pattern. *Fix:* trusted registry, verify package existence before install [O].
- **Worktree not auto-isolated by absolute paths.** Sub-agents edit parent checkout [GitHub issue #56137]. *Fix:* PreToolUse write-path guard.
- **Untamed autonomy.** 10,000-line diffs you cannot review [K]. *Fix:* small, verifiable chunks.

### Documentation

- **Copy-paste README content.** Narrative, not imperative [Gen].
- **Vague guidance like "write clean code".** No decision support. *Fix:* replace with concrete rules [Gen].
- **Drift.** Agents follow commands that no longer exist verbatim. *Fix:* treat AGENTS.md as code, update in same PR [Gen].
- **Secrets in AGENTS.md.** Agents can read and commit them [Gen]. *Fix:* env vars only.
- **Agent-written AGENTS.md duplicates.** Reflect what's discoverable from code/README [Gen]. *Fix:* validate removal of what's already readable from code.

### Harness maintenance

- **Stale assumptions.** A harness component needed for 4.5 may be no longer load-bearing on 4.6 [A]. *Fix:* stress-test with new models, simplify.
- **Over-engineered harness.** "Add complexity only when it improves results" [A]. *Fix:* find the simplest solution that could possibly work, escalate only when needed.
- **Reviewer-writer separation.** Same agent grading its own work is weaker than a fresh-context reviewer [A].

---

## Quick reference: distilled rules

1. **Maximize autonomy in small, verifiable, reversible increments.** Guardrail against giant diffs [K].
2. **Find the smallest high-signal set of tokens.** Context is a budget, quality degrades [A].
3. **Use hybrid loading:** context files up-front, file contents just-in-time, identifiers light [A].
4. **Files 150-500 lines; most under 200.** Reviewable diffs, fresh tokens [Gen].
5. **Tools small, composable, single-purpose.** Promote when: gate, render, audit, or parallelize [A].
6. **Sub-agents isolate large outputs.** 3-7 custom agents, one level deep, summary-only returns [A, Gen].
7. **AGENTS.md is 100-150 lines of pointers; knowledge in `docs/`.** Statements, exact commands, negative examples, pinned versions [Gen].
8. **Sandbox + approvals + network off.** `workspace-write` as default, never `--yolo` on critical [O].
9. **One worktree per session + write-path guard + serialized merge.** Absolute paths defeat convention [Gen, issue #56137].
10. **Pre-push hooks:** typecheck, lint, import-boundary. Local for speed, CI/merge for authority [Gen].
11. **Structured handoff:** progress JSON, git commits, startup routine. Fresh agent can pick up without prior agent's reasoning [A].
12. **Stress-test harness components.** Each piece encodes an assumption about what the model cannot do; re-examine with new models and simplify [A].
13. **Keep agent-aware telemetry.** Log why, not just what [O].
14. **Treat docs as code.** Version them; update AGENTS.md in the same PR as code, assign owners [Gen].
15. **Find the simplest solution that could possibly work; only add complexity when needed.** [A]

---

## Sources

- **[K] Andrej Karpathy:** "Vibe Coding to Agentic Engineering" (Sequoia AI Ascent 2026); "Skill Issue" (No Priors, 2026); "Software Is Changing (Again)" (YC, 2025); "We're summoning ghosts, not building animals" (Dwarkesh, 2025).
- **[A] Anthropic:** "Building Effective Agents" (2024); "Effective context engineering for AI agents" (2025); "Effective harnesses for long-running agents"; "Harness design for long-running application development"; "Writing effective tools for AI agents" (2025); "Seeing like an agent: how we design tools in Claude Code" (2026); "Introducing advanced tool use"; Claude Code docs (`best-practices`, `subagents`, SDK); `anthropics/skills` GitHub `agent-design.md`.
- **[O] OpenAI:** "Building a safe, effective sandbox to enable Codex on Windows" (2026); "Running Codex safely at OpenAI"; Codex docs (`sandboxing`, `agent-approvals-security`); InfoQ summary (2026).
- **[Gen] General community synthesis:** agents.md open standard (OpenAI/agents.md GitHub); AgentPatterns.ai; thepromptshelf.dev; buildbetter.ai; aihackers.net; Factory docs; sneg55/agent-starter guide (Anthropic codebase analysis); Eamonn Faherty file-size post; how2.sh diff-guard post; Ready Solutions AI worktree post; the-main-main-thread.com protection guide; CybeDefend Codex security visibility; context patterns community sites.