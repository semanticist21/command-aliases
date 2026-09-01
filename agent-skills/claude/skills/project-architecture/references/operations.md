# Deployment and operations default

Use this only when the project deploys to a host the team owns. It assumes containers on one or a few servers, not a managed platform.

## Declare host facts, then check them

A bootstrap script that only installs leaves no way to ask whether the host still matches what it installed. Undeclared host state drifts silently and is discovered by an outage. Declare the facts that script creates — packages, services and their enabled state, users, directory owners and modes, sudoers, swap, sysctl — and check them before a release trusts the host. `goss` expresses this as YAML and runs as a single pinned binary; a few dozen facts replace several hundred lines of shell assertions.

Include the facts an outage taught, not only the ones the installer writes. A healthcheck that names a database which does not exist reports healthy, because `pg_isready` answers for a reachable server regardless of the database.

Classify drift before rollout. Security or readiness contract violations — including permissions, ownership, service enablement, credential mounts, and database readiness — fail closed immediately. A report-only first cycle is permitted only for explicitly classified, acknowledged noncritical legacy drift; after that cycle, make it refuse.

## Derive contracts, never enumerate them

A duplicated list of filenames, columns, services or counts maintained by hand is a defect when a trustworthy authoritative contract can derive it. Derive both sides and compare them; keep explicit security allowlists when the allowlist itself is the authority.

- Credentials a runtime needs: let the env declare its mounts, let the bundle carry files, and require the two sets to match exactly. Adding one is an env line plus a file. Rejecting a carried file the env never names is stronger than a name allowlist, because nothing unreferenced can ride along.
- Mounted services: derive the expected set from the contract and the router rather than pinning a count.
- Configuration schemas and budget arithmetic: `CUE` states them once as constraints instead of restating them in a script and in prose that later disagree.

## Edge and orchestration

Choose the edge proxy by what the application actually speaks, and prove it with the traffic the application actually sends. A proxy that terminates HTTP/2 from the client may still fail to carry gRPC to the backend; a reflection call is not evidence when production disables reflection.

Do not adopt a deployment orchestrator to shrink a deploy script whose bulk is admission gates, slot choreography and crash-recovery journalling. Those are domain logic and no orchestrator provides them. Extract the gates into their own scripts first; whether an orchestrator is worth adding is easier to judge against what remains.

## Backups

Logical dumps on a timer give a recovery point as old as the interval. If that is unacceptable, add WAL archiving for point-in-time recovery and keep the logical dump at a lower cadence as a second line in a different format, since a physical repository restores logical corruption faithfully.

A restore procedure that has never been run is a document, not a capability. Rehearse it once against a disposable instance before it is needed, and list what the backup does not carry — TLS material, host configuration, deployment state files.
