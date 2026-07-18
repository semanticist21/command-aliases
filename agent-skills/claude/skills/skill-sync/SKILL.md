---
name: "skill-sync"
description: "Create, update, rename, compact, and sync user/project skills end-to-end."
---
# Skill Sync

Keep one developer's user-scope skills consistent across three places:

- `~/.claude/skills/<name>/SKILL.md` — Claude Code user scope.
- `~/.codex/skills/<name>/SKILL.md` — Codex user scope (may also carry `agents/openai.yaml`).
- `semanticist21/command-aliases` repo → `agent-skills/claude/skills/<name>/` and
  `agent-skills/codex/skills/<name>/` — the GitHub mirror of the two dirs above.

A **skill** = a folder whose name is the skill name and whose entrypoint is
`SKILL.md`. It may also carry support files such as `agents/openai.yaml`,
references, scripts, assets, README, LICENSE, or AGENTS.md. Preserve those support
files unless the user explicitly asks to remove them. The two runtimes are
independent targets: a skill may exist for one runtime only.

Pick the operation the user wants — **full reconcile**, create, update, compact,
replicate, publish, pull, or delete — and follow that section. A bare `/skill-sync`
or any "sync everything / match the repo / 맞춰줘" request means **Full reconcile**:
do not act on one skill in isolation. Always surface a one-line summary of what
changed and in which direction before writing.

This is the only skill-management entrypoint. Use an operation followed by scope
when the operation writes one skill:

- `skill-sync add <user|project> <skill name and behavior>` creates a skill.
- `skill-sync update [user|project] <skill name and changes>` revises a skill.
- Bare `skill-sync` retains the full-reconcile behavior above.

Accept `root` as a compatibility spelling for `user`, but do not create separate
`skill-add`, `root-skill-add`, or `skill-update` aliases.

## Autonomous completion (default: finish the push)

Publishing the mirror is part of the job, not a separate step to wait for. After any
create, update, or compact of a user-scope skill that already lives in the mirror or
is deliberately new, carry the work all the way to a pushed commit WITHOUT waiting for
a separate "push"/"publish" request: sync the intended copies, run the review + secret
scan, bump version markers, stage explicit pathspecs, commit, switch to the required
GitHub identity, push, and restore the previous identity. The same holds when the user
explicitly asks to commit/push/publish or to handle the sync end-to-end.

For project scope, finish through that repository's own task and verification
harness: verify, commit, and land the isolated worktree through its required PR or
merge-back workflow. Never copy a project-scoped skill into the user-scope mirror
or bump the user-scope skill-set version.

On drift where both sides changed, **auto-merge by default**: combine non-overlapping
edits, and for a true line-level clash prefer the newer edit; then commit, push, and
report exactly what was merged and which side won each clash — do not block. Stop and
ask ONLY when: the action is destructive, the two edits **semantically contradict**
(both cannot be true at once), the secret/private-context scan hits, the required
identity cannot be activated, or the target is unclear. A bare full reconcile still
leaves discovered local-only skills quarantined (see Full reconcile) — those need an
explicit publish naming the skill.

## Required worktree isolation

Before any repo-side write for `skill-sync`, `task`, or delegated task-style work,
create a dedicated git worktree and branch from a clean fetched base. Do not edit
or commit in the caller's current checkout, especially when `git status --short`
shows unrelated changes. Keep the original checkout untouched; stage only explicit
pathspecs in the worktree. If the target repo cannot use a worktree or branch, stop
and explain the blocker instead of continuing on the dirty checkout.

## Full reconcile (default — sweep every skill, both directions)

Triggered by a bare invocation or "sync all / 전부 맞춰". Never piecemeal: inventory the
whole surface first, classify every skill, then act per category.

1. **Inventory** both runtimes on both sides:
   ```bash
   cd <repo> && git status --short && git fetch -q
   for rt in claude codex; do
     ls ~/.$rt/skills/                          # local
     ls agent-skills/$rt/skills/                # repo
   done
   ```
2. **Classify** each skill name into one bucket, per runtime:
   - **identical** — `diff -rq` clean → nothing to do.
   - **drift** — exists both sides, differs → decide direction (see Update step 1;
     auto-merge when both sides were independently edited, per Autonomous completion;
     ask only on a semantic contradiction).
   - **repo-only** — in repo, missing locally → install (Replicate).
   - **local-only** — local, not in repo → treat as **local-private** by default.
     Do not publish during a reconcile unless the user explicitly names the skill
     and says to publish it. Keep it in the user-scope inventory/quarantine list.
3. **Surface the full table** to the user before writing: one row per skill with its
   bucket and the planned action/direction. Call out every drift conflict and every
   skill the user named that does not exist anywhere (e.g. "`memo` 스킬 없음").
4. **Refresh the mirror only after the plan is known.** If the mirror worktree is
   clean and the plan does not depend on local repo changes, run `git pull --ff-only`.
   If that changes classifications, re-surface the changed rows before writing.
5. **Act** per bucket: install repo-only and sync each drift its decided
   direction. Do not publish local-only skills from a reconcile; report them as
   local-private candidates needing a separate publish request. Batch all repo-side
   changes into one commit, then push once under the identity below.
6. **Re-verify** with a second `diff -rq` sweep; report residual drift, conflicts left
   to the user, and skills intentionally left local-only.

## Create or update one skill

Use this for `skill-sync add`, `skill-sync update`, or any request to create,
revise, rename, compact, or fix one skill.

1. **Resolve operation, scope, and runtime before writing.**
   - `skill-sync add` requires an explicit `user` or `project` scope. Accept
     `root` as a compatibility spelling for `user`; missing or invalid scope
     requires clarification.
   - `skill-sync update` uses the requested scope. If none is given,
     inventory all copies and infer scope only when the skill exists in exactly
     one scope; ask when both user and project copies exist or neither exists.
   - `user` targets `~/.claude/skills/<name>` and/or
     `~/.codex/skills/<name>` plus the matching `command-aliases` mirror.
   - `project` targets the nearest trusted repository's `.claude/skills/<name>`
     and/or `.codex/skills/<name>` only; never mirror it into user scope.
   - `add` targets both runtimes unless the request explicitly names one.
     `update`, rename, and compact preserve the runtimes where the skill already
     exists in the selected scope; never create a missing runtime copy unless the
     request explicitly asks for it.
2. **Find every copy before editing.** Check Claude user scope, Codex user scope,
   project `.claude/skills`, project `.codex/skills`, and both mirror runtimes.
   Surface any pre-existing drift; if both sides changed independently, auto-merge per
   Autonomous completion (ask only on a semantic contradiction).
3. **Create/update the body.** Keep the skill self-contained, concise, and
   runtime-safe. Do not encode one repo's private paths, hostnames, credentials, or
   transient decisions into a user-scope skill.
4. **Frontmatter.** Prefer only `name` and quoted `description`. `name` is lowercase
   kebab-case, under 64 chars, and matches the directory. The description is the
   trigger surface: make it short, specific, and hard to over-fire.
5. **Rename.** If the name changes, create the new directory, update `name:`, grep
   other skills for literal references to the old name, then remove the old
   directory only after the user has clearly asked for the rename/delete.
6. **Sync without bypassing isolation.**
   - For project scope, write the intended runtime copies inside the target
     repository's isolated worktree.
   - For user scope, edit the isolated `command-aliases` mirror. If a local
     user-scope target is a symlink into the mirror checkout, never write through
     it while the worktree is active; landing the mirror change updates it. Merge
     any detached real-directory copy into the worktree first, then copy the
     landed result back afterward. Keep only deliberate runtime wording
     differences.
7. **Review.** Spawn a read-only reviewer for meaningful skill edits. Ask for
   severity-tagged findings on trigger quality, over-fire risk, workflow
   soundness, actionability, concision, and contradictions. Apply high/medium
   fixes to every copy.
8. **Finish the selected scope.**
   - For user scope, copy changed skills into `command-aliases`, update
     `agent-skills/README.md` for brand-new skills, bump `agent-skills/VERSION`
     when repo-side content changes, and land and push once. After landing, verify
     symlinked local installs resolve to the new content, sync any detached local
     copies from the landed mirror, and update both local version markers.
   - For project scope, run the target repository's required verification, commit,
     and PR/merge-back lifecycle. Do not touch the user-scope mirror or version.

## Compact skills

Use this when the user says there are too many skills, descriptions overflow, or
similar skills should be merged.

1. Inventory Claude, Codex, and mirror skill names plus frontmatter descriptions.
2. Prefer non-breaking compaction first: move broad instructions into one canonical
   skill, shorten other descriptions, and leave thin compatibility aliases.
3. Delete or remove aliases only after explicit second confirmation naming the
   exact skill(s), runtime(s), and side(s) to delete.
4. Keep descriptions short enough for the global skill list. Long rationale,
   examples, and edge cases belong in the body or references, not frontmatter.
5. Re-run frontmatter and drift checks after compaction.

## Versioning (internal generation counter)

The skill-set carries a single monotonic version so any machine can tell whether it is
behind the mirror without diffing every skill.

- **Repo marker:** `agent-skills/VERSION` — one integer, the current sync generation.
  Source of truth.
- **Local markers:** `~/.claude/skills/.sync-version` and `~/.codex/skills/.sync-version`
  — the generation each machine last reconciled to. Not a skill; ignored by runtimes.
- **On every reconcile that writes repo-side changes:** bump `agent-skills/VERSION` by 1,
  write the same number into both local markers, and reference `vN→vN+1` in the commit
  subject and the user-facing summary. A pure repo→local pull (no repo change) only
  advances the local markers to match the repo — it does not bump VERSION.
- **At the start of a reconcile,** read all three markers and report the gap
  (`local v3 → repo v6: 3 generations behind`). A bare check with no other drift can stop
  there. The integer is a coarse "are we in sync" signal; `diff -rq` remains the
  authority on actual content drift.

## Ground rules

- **Two runtimes, two targets.** `claude/skills/<name>` ↔ `~/.claude/skills/<name>`;
  `codex/skills/<name>` ↔ `~/.codex/skills/<name>`. Keep names identical across
  runtimes when the skill exists for both.
- **Never auto-publish these to the repo** even when told to "sync everything" —
  confirm explicitly first:
  - `ktbase-push` — contains KT-internal registry IPs/hostnames; user-scope only.
  - Codex `.system/*` (skill-creator, plugin-creator, skill-installer) — Codex
    built-ins, regenerated on install.
  - Codex `chronicle`, `codex-primary-runtime` — Codex-shipped built-ins.
- **Public mirror hygiene.** Before publishing any skill, scrub secrets, private hostnames/IPs, credential paths, account IDs, and company-internal implementation details.
- **Local-private quarantine.** Local-only skills stay user-scope by default.
  Surface them in the reconcile table as "local-private / no action"; do not copy,
  commit, or push them until the user explicitly asks to publish the named skill.
- **Get the repo.** Operate in a local clone. If none exists, clone it:
  `gh repo clone semanticist21/command-aliases /tmp/command-aliases`.

## Push identity (required before any push)

The repo is owned by GitHub `semanticist21`, but a dev machine often has a work
`gh` account active. Before pushing, switch identity and restore it after:

```bash
gh auth status                                       # note the Active account
gh auth switch -u semanticist21 -h github.com
git push origin HEAD
gh auth switch -u <previous-account> -h github.com   # restore
```

If `semanticist21` cannot be activated (keyring/login failure), STOP and tell the
user — do not push under the wrong identity. Offer `git push` instructions for them
to run, or `gh auth login -u semanticist21` first.

## Replicate (install repo skills onto this machine)

Default to **symlink** so the machine stays live-synced with the repo (one edit
updates both). Use `cp -R` only for a detached snapshot.

```bash
cd <repo>
for d in agent-skills/claude/skills/*/; do
  ln -sfn "$PWD/$d" ~/.claude/skills/"$(basename "$d")"
done
for d in agent-skills/codex/skills/*/; do
  ln -sfn "$PWD/$d" ~/.codex/skills/"$(basename "$d")"
done
```

Before overwriting an existing **real (non-symlink)** skill dir, check it is not a
locally-improved version — see Update.

## Update (bidirectional — both sides drift)

The dev edits skills locally while using them AND pulls repo improvements, so
updates flow both ways. Classify direction before writing.

1. **Detect drift** per skill:
   ```bash
   diff -rq ~/.claude/skills/<name> <repo>/agent-skills/claude/skills/<name>
   ```
   - Symlinked install → no drift possible (local *is* the repo file); just
     `git pull` / `git push`.
   - Identical → nothing to do.
   - Differs → decide which side is newer (ask the user if unclear).
2. **Repo → local** (pull improvements): `git pull`, then re-run Replicate
   (no-op for symlinks, `cp -R` for copies).
3. **Local → repo** (publish a local edit): only after an explicit publish
   request naming the skill. Before copying, show the files that would be
   published and run a local scan for secrets/private context:
   ```bash
   rg -n --hidden -S "(AKIA|AIza|ghp_|github_pat_|sk-|BEGIN .*PRIVATE KEY|private_key|client_secret|access_key|secret_access|password\\s*[:=]|10\\.|172\\.(1[6-9]|2[0-9]|3[0-1])\\.|192\\.168\\.|~/(\\.private_keys|\\.ssh)|/Users/[^/]+)" ~/.claude/skills/<name> ~/.codex/skills/<name>
   ```
   If any hit is not clearly safe documentation, stop and ask before publishing.
   ```bash
   cp -R ~/.claude/skills/<name> <repo>/agent-skills/claude/skills/
   cd <repo> && git add agent-skills && git commit -m "feat(<name>): <what changed>"
   ```
   Then push under the semanticist21 identity above.
4. **Both sides changed** = auto-merge (default). Combine non-overlapping edits; for a
   true line clash prefer the newer, then commit/push and report the merge and each
   resolved clash. Only when the two edits **semantically contradict** (cannot both
   hold) do you stop, show the `diff`, and ask which wins.

When publishing a **new** skill, also add its row to `agent-skills/README.md`'s
skill table (columns: skill, claude ✓, codex ✓, one-line description).

## Delete (destructive — always re-confirm)

Require an **explicit second confirmation naming the skill(s)** — never infer it
from a vague request. Restate which skill, which runtime, and which side (repo /
local / both) before acting, then wait.

- **From the repo:** `git rm -r agent-skills/<runtime>/skills/<name>`, commit, push.
- **From a machine:** `rm -rf ~/.claude/skills/<name>` (or `~/.codex/...`). If it is
  a symlink, prefer `rm ~/.claude/skills/<name>` (unlinks only — repo file untouched).

If asked to "delete a skill" without scope, ask whether they mean the repo, the
machine, or both.
