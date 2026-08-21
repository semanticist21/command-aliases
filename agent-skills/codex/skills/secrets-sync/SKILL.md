---
name: secrets-sync
description: Restore and synchronize a project's inputs plus the machine access needed to use them across Macs. Use on a new or repaired machine, after clone/worktree recovery fails, or when configuration, credentials, or deployment inputs change.
---

# Secrets Sync

Make a machine ready to work, not merely able to find a secret. A successful
sync leaves the requested project and its registered common machine baseline
usable on this Mac, and leaves durable sources ready for the next Mac.

Keep ordinary, portable configuration in Git. Keep only secrets and
device-private material in private storage. Never expose a secret value in
chat, Git, logs, commands, manifests, or a read-back check.

## Requests and outcome

- `$secrets-sync` in a repository reconciles that canonical project and its
  registered common machine baseline: required inputs, CLIs, profiles, device
  identity, NAS access, and managed-host access. It does not restore unrelated
  project collections.
- `$secrets-sync user` restores the common machine baseline plus the registered
  default collection. `$secrets-sync user <owner-id>/<collection-id>` selects
  that exact registered collection. Use it before a project checkout exists.
- A normal sync is autonomous. Request an unavoidable OS, browser, device, or
  administrator approval explicitly; it is not a request to guess a value,
  credential, host, or target.
- Finish only after the resolved inputs are usable and every required
  non-destructive connection probe succeeds. A healthy source machine must also
  reconcile its current state so later machines and agents can recover it.

## Bootstrap discovery

`~/.agents/doc/AGENTS.local.md` is the stable pointer to the registered private
bootstrap repository. After its declared one-time OS/account enrollment, fetch
or clone that repository with the registered bootstrap credential when no
checkout exists. If the pointer or credential is absent, request only that
exact enrollment repair; never guess a path, host, account, or substitute
credential.

## Reconcile with judgment

Before inspecting the contents of an unknown ignored, private, or archive
candidate, read [operations.md](references/operations.md). The only policy-only
shortcut is material already established as wholly non-secret Git content.

1. Read the registered private bootstrap source and inspect the relevant local
   project, selected collection, NAS records, compatible working machines,
   repository configuration, consumer/deployment evidence, and chronology.
   Do not treat an old manifest or mapping as stronger than the full evidence.
2. Classify every candidate by its complete private contents and owner:
   - Promote a wholly non-secret, portable project input to its canonical
     project Git repository.
   - Promote a wholly non-secret, portable common machine input to the private
     bootstrap Git repository.
   - Keep secrets, device-private material, and mixed files private. Do not
     silently split or redact a mixed file.
   Ignore rules and filenames are leads, never a classification or authority.
3. A stale or missing mapping is repair work, not a blocker. When the evidence
   converges, record the resulting current non-secret mapping in the private
   bootstrap source and continue. It must identify the resolved source record,
   scope/destination, and consumer when one exists.
4. Ask one focused question only when materially different, plausible mappings
   would send data to different destinations or consumers. Absence of an old
   registration alone is not ambiguity; investigate and repair it.
5. A promotion or mapping repair is complete only after its exact canonical Git
   update is committed, pushed, and verified at the remote revision. On a push
   or verification failure, retain the private source and repair/report the
   failure; do not retire anything.
6. For two valid, divergent copies of one resolved private record, overwrite or
   retire neither unless chronology or provenance establishes an authoritative
   copy. Otherwise preserve both and ask one focused source-version question.
7. After a verified canonical Git promotion, retire the exact former private
   archive record and manifest entry. Keep no second source of truth and never
   use recursive or archive-wide deletion.

## Secrets and deployment consumers

- A GitHub secret or variable needs a durable, verified private source before a
  write. If its value exists only in GitHub, recover it from the issuing service
  by reissuing or rotating it, then archive and verify the replacement before
  updating GitHub.
- Resolve each GitHub write from the same holistic evidence. Establish the exact
  canonical repository, Environment, kind, name, private source record, and
  intended consumer before writing; do not infer a target from one filename or
  one workflow reference.
- When that consumer mapping was stale or missing, first record its exact
  non-secret contract in private bootstrap, commit and push it, and verify the
  remote revision. Until then, do not create an Environment, write a value, or
  dispatch a workflow.
- Write only the resolved value(s) for that consumer. Revalidate names and
  source integrity without reading values back.
- Value writes do not authorize arbitrary execution. Dispatch only the resolved
  intended workflow, protected ref, and allowed inputs, after its relevant
  writes succeed. Otherwise report the verified state without dispatching.

## Machine recovery

Restore or install the registered CLI configuration and connection profiles.
When the provider supports both, prefer the owner's registered durable access
key over an expiring temporary credential; use a temporary credential only when
the provider requires it or the declared recovery path calls for it.
Create a fresh device key when the profile requires one, enroll it through the
registered recovery path, and verify the configured identity rather than a
bare hostname or ambient SSH identity. Repair NAS access and every registered
managed-host path before reporting readiness.

## Operational reference

Read [operations.md](references/operations.md) before inspecting any unknown
private candidate, or before a secret read, write, transfer, mapping or manifest
mutation, GitHub secret/variable update, or deployment action. Ordinary
diagnosis and already-established non-secret Git material may use this policy
alone.

## Boundaries

- Never publish, delete, or bulk-transfer secret, mixed, device-private, or
  out-of-scope material. A verified, wholly non-secret promotion to its
  resolved canonical Git destination is permitted.
- Keep private work scoped to the selected project, common baseline, collection,
  and exact resolved records. Never sweep every user collection to make a
  recovery convenient.
- Preserve current state only: private bootstrap owns non-secret mappings;
  private manifests own file-integrity metadata. Neither owns secret values or
  a migration/process ledger.

## Verification scenarios

Use safe dummy fixtures or value-free assertions to verify the changed behavior:

- a current mapping restores normally;
- a legacy NAS record with one evidenced consumer migrates without a question;
- competing consumers produce one focused question;
- both standalone and project requests recover the common machine baseline and
  reach NAS plus each registered managed host;
- a GitHub-only secret is rotated into a durable source before GitHub changes;
- a non-secret configuration is promoted to Git and its exact old archive record
  retires; and
- a mixed file remains private with no value exposure or out-of-scope mutation.
