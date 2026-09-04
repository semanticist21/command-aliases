# Private inputs and consumers

Read this reference together with [operations.md](operations.md) before
inspecting unknown private material or changing a collection, manifest, secret,
variable, mapping, or deployment consumer.

## Resolve ownership and destination

Inspect the registered bootstrap source and only the relevant local project,
selected collection, NAS records, compatible working machines, repository
configuration, consumers, and chronology. Ignore rules and filenames are clues,
not authority.

Classify each complete candidate:

- Wholly non-secret portable project input belongs in its canonical project Git
  repository.
- Wholly non-secret portable common machine input belongs in the private
  bootstrap Git repository.
- Secrets, device-private material, and mixed files stay private. Do not
  silently split or redact mixed files.

A stale or absent mapping is repair work when owner, scope, destination, source
record, and consumer converge. Record and verify the non-secret mapping, then
create and verify the exact private collection and NAS allowlist before transfer
or use. Preserve every existing collection and allowlist entry. When two valid
copies diverge and chronology or provenance does not establish an authority,
preserve both and ask one focused source-version question.

A promotion or mapping repair is complete only after its exact canonical Git
change is committed, pushed, and verified remotely. Only then retire the exact
former private record and manifest entry. Never perform archive-wide deletion.

## GitHub consumers

A GitHub secret or variable needs a durable verified private source before a
write. If GitHub is the only remaining holder, reissue or rotate it at the
issuing service, archive and verify the replacement, then update GitHub.

Resolve the canonical repository, Environment, kind, name, private source
record, intended consumer, and allowed workflow/ref/inputs before writing. A
missing consumer mapping must be committed, pushed, and remotely verified before
creating an Environment or changing a value.

Write only the resolved values through protected stdin or an owner-only file
descriptor. Never place values in arguments, environment dumps, output, or
read-back checks. Re-list only registered names after a write. A value write
does not authorize arbitrary execution; dispatch only the registered workflow,
protected ref, and allowed inputs after its required writes succeed, then verify
the repository, workflow, and resulting revision.

## Boundaries and checks

Scope work to the selected project, common baseline, collection, and exact
records. Do not sweep every collection, publish private material, copy device
keys, or infer a consumer from one workflow reference.

Verify with safe dummy fixtures or value-free assertions: current mappings,
unambiguous legacy migration, creation and verification of one absent collection
with exact allowlist preservation, focused questions for competing consumers,
projectless common recovery, GitHub-only secret replacement, verified Git
promotion and exact retirement, and preservation of mixed files.
