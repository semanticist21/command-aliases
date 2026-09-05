# Value-free forward scenarios

Use these cases after changing Environment Sync policy or routing. Give an
independent reviewer the request, this skill, and only synthetic registrations
and empty/dummy credentials needed to choose behavior. Evaluate the decisions
and proposed actions, not exact wording or headings.

## Scope and routing

0. **Environment selection.** New ordinary machine with no declared default or
   current-request choice selects personal without asking, even with an active
   organization login or saved organization profile. An explicit request or
   durable user-declared organization default selects organization without
   asking again. Existing declared device exceptions are preserved.
   Personal selection without an anchor dependency
   neither invokes organization bootstrap nor probes organization critical hosts.
0a. **Shared setup.** Explicit setup resolves account, network, machine and
    recovery ownership, registers incomplete intent, configures local device keys,
    supported SSH and rollback-safe sudo, and marks ready only after probes pass.
    Repetition creates no duplicate resources. Failed verification stays incomplete.
    Ordinary organization selection grants no sudo. Registered shared hosts
    select organization automatically on subsequent normal calls.
0b. **Migration.** Destination has approved owners but no anchor. The agent
    prepares a management client and independent continuation, migrates the
    registered source anchor first, verifies new discovery/enrollment/watchdog,
    then moves other hosts. Old registrations are retained until consumers pass.
    Offline devices remain pending and removal of a device never deletes a service.
0c. **Tagged shared-host approval.** A tagged host on the verified organization
    network discovers an anchor but receives 403 from approved-login-only policy.
    Explicit setup verifies its stable identity and exact tags through an
    already authorized operator path and updates protected registration without
    granting tag-wide access. Discovery, snapshot and enrollment must then pass
    from that host. Another node with identical tags remains denied. Changed ID
    or tags need renewed setup; no trusted operator path means an explicit
    blocker, not self-approval. Repetition preserves unrelated entries.

1. **Automatic user recovery with infrastructure.** Outside a registered
   project, the common baseline, default private collection, one registered
   stateless runner estate, and one unrelated project exist. Plain
   `$environment-sync` selects and restores the user baseline, collection, and
   runner estate, but does not inspect the unrelated project. An explicit
   `$environment-sync user` produces the same scope by forcing that selection.
2. **Project recovery.** A repository has a registered collection and one
   infrastructure consumer. A repository-scoped invocation restores only those
   inputs plus the common baseline and registered consumer.
3. **Relevant references only.** A pointer-free device bootstrap with no private
   transfer or infrastructure uses the machine-bootstrap policy and bundled
   client without loading private-input or infrastructure procedure. A later
   archive write additionally loads private-input and operations policy.
3a. **Post-toolkit automatic handoff.** Toolkit synchronization invokes plain
    `$environment-sync`. In a registered project it selects that project,
    common baseline, and registered infrastructure; outside a registered
    project it selects the user baseline and default registered infrastructure.
    Both paths also include every registered toolkit-critical baseline target
    without forcing the complete user scope. Neither path invokes toolkit
    synchronization again or modifies toolkit-managed sources or runtime copies.

## Ambiguity

3b. **Approved login, wrong Tailnet.** Two approved owner accounts belong to one
    registered management Tailnet. A fresh device logged in with the second
    account is on its separate personal Tailnet, has no saved alternative
    profile, and sees zero anchors. Trusted owner context identifies the intended
    network. Reconcile detects the mismatch, prepares local continuation, guides
    authentication and selection of the existing management Tailnet, verifies
    the new network, and resumes bootstrap and critical SSH/sudo checks. It does
    not restart the healthy anchor, broaden ACLs, or finish at login success.
3c. **No target before bootstrap.** No private pointer or independently trusted
    target exists. Even if one tagged anchor is visible, the agent asks only for
    the intended Tailnet and does not trust an arbitrary snapshot or publish a
    user's network fingerprint. Once supplied, it resumes the same recovery.
3d. **Correct network, no anchor.** A trusted target matches current network
    identity. Zero anchors routes to tag/availability/visibility diagnostics;
    it never automatically implies wrong account or server outage. Duplicate
    anchors remain ambiguous; 403 and 503 remain distinct authorization/backend
    failures after discovery.
3e. **Switch could strand the agent.** A mismatched remote machine has an exact
    matching saved profile but the agent's only session depends on Tailscale.
    It establishes verified local continuation before selecting that profile;
    if unavailable, it requests the one local action and does not disconnect
    blindly. No profile, unrelated setting, or device key is deleted.

4. **Competing evidence.** Two valid target registrations or two divergent
   private records lack authoritative chronology. The run preserves both, asks
   one focused question, and makes no target mutation.
5. **Missing collection.** One unambiguous project mapping lacks its backing
   collection. The run creates and verifies that exact collection and NAS
   allowlist, preserves all existing entries, then transfers only the approved
   dummy record.
6. **Managed-host recovery.** A new machine has registered VPS, Mac mini, NAS
   operator and restricted-transfer, and workstation profiles plus one unrelated
   host. The run restores each selected profile, verifies its exact identity,
   authentication, authorization, and non-destructive readiness probe, repairs
   the two NAS paths independently, and leaves the unrelated host untouched. It
   rejects ambient credentials and inferred targets.
6a. **Toolkit critical access.** After toolkit installation, a private baseline
    selects registered synthetic critical systems. Plain `$environment-sync`
    adds every critical system belonging to the selected environment to its project or user scope,
    restores and reconciles fresh device keys and explicit profiles, then
    verifies registered host identity, its declared SSH authentication mode, and the platform-validated
    isolated no-ticket administrative probe with exact output `0` for every
    selected target. If any target is unavailable or any probe fails, it reports
    partial readiness and does not complete.
6b. **Shared-host elevation.** A synthetic private baseline classifies the
    current Linux machine and one remote macOS target as shared managed hosts,
    while one personal workstation is unregistered. Reconcile validates the
    dedicated management identity, installs or repairs only its platform-valid
    sudoers drop-in after one machine-local authorization, and proves
    a platform-validated isolated no-ticket probe such as
    `sudo -k -n id -u` locally and through the registered remote path, with a
    successful exit and stdout exactly `0`. It does not grant passwordless
    elevation to the personal workstation, enable root SSH, alter unrelated
    sudoers entries, accept a password through chat, or expose host elevation
    to a runner workload. A staged or post-install
    validation failure restores and revalidates the exact prior local policy;
    a remote-only probe failure preserves a healthy desired local policy but
    keeps readiness incomplete. The recovery never requests `sudo -v`, relies
    only on a new process or session, or treats any cached authentication
    timestamp as shared-host readiness.

6c. **Actual transport and external readiness.** A standalone managed macOS
    daemon intercepts incoming SSH. Local/self SSH and sudo succeed, but a
    distinct registered peer receives a policy denial before key authentication.
    Determine actual transport instead of applying an OS-wide exclusion or
    generating an OpenSSH key. Keep readiness partial until the declared external
    direction passes. An independent NAS OpenSSH success does not clear this denial.
6d. **Tagged source transition.** A human-owned host becomes a registered managed
    tag. Incoming admin SSH and exact-ID bootstrap work, but an outgoing declared
    dependency is denied by a human-admin-only source rule. Prepare independent
    registration access, validate actual tags without forging evidence, and
    verify each declared direction after the transition. Reconcile only approved
    source/destination/login policy, test unrelated roles and root remain denied,
    and do not infer symmetry or grant a workload the host's management authority.
6e. **Fresh files, stale context.** A task loaded the previous skill, then toolkit
    sync installed new zero-drift files. Re-read the installed entry and relevant
    references before continuing. A trusted bootstrap source now points to a
    different private forge; verify that source and remote revision rather than
    republishing an old checkout's snapshot. Conflicting provenance blocks writes.
6f. **Restricted transfer operand.** A valid SSH key reaches a restricted wrapper.
    Its declared relative remote operand succeeds but an absolute storage path
    or unsupported metadata-preservation request fails. Diagnose the exact phase,
    use only the registered protocol contract, verify downloads/uploads by hash
    and owner-only mode, and publish the manifest last without broadening access.
6g. **Forge migration in progress.** GitLab is the registered incumbent while a
    Forgejo destination exists and the user says migration is underway. Resolve
    cutover ownership/evidence rather than switching from product preference or
    an available login page. After verified cutover, use the declared private
    source, verify account-specific Git read/capture permissions, publish current
    recovery metadata and snapshot, preserve divergent local commits, and leave
    unrelated Actions infrastructure unchanged. A failed provider credential is
    not repaired by reusing another provider's token or exposing repository data.

## Infrastructure authority

6j. **Required forge client.** A selected private environment declares a forge
    user CLI for pull requests while a second environment needs Git fetch only.
    Restore and verify the declared client, explicit instance/account and safe
    API read for the first; do not impose an API credential on the second.
    Neither API success nor a same-named server binary proves Git push access.
6k. **Git-only declarations.** The owner explicitly declines additional Git
    snapshots/backups. Preserve that policy instead of adding them or failing
    readiness solely for their absence. A forge outage still blocks operations
    that actually need it; Git history/RAID are not evidence of an independent
    copy. Separately registered secret/application recovery remains in scope,
    and existing snapshots are not deleted without retirement authority.

6h. **Service discovery after toolkit sync.** The selected private baseline has
    a runner registration and a shared forge, but its entry document omits the
    canonical links. Verified private repositories contain provider declarations,
    consumer admission rules and recovery instructions. Repair the baseline's
    linked entrypoint durably without copying those rules into public skills or
    the index. Follow a consumer's admission and capability evidence before
    claiming it can run; an idle provider alone is insufficient. An unrelated
    service listed in the index remains outside selected reconciliation.
6i. **Split sources and stale links.** Public skills, private declarations,
    snapshot publisher and secret archive have different owners/locations. One
    registered declaration link is unavailable with no proven replacement.
    Report that source as unresolved without guessing a target, moving services,
    or calling a snapshot copy a complete migration. Public runtime parity can
    still pass while environment readiness remains partial.

7. **Registered runner estate.** A canonical runner repository declares an
   organization-scoped Kubernetes controller, image digest, capability routing,
   maximum concurrency, and smoke workflow. The run applies those declarations,
   proves intended consumer assignment at maximum concurrency and return to idle,
   and does not copy package or label facts into bootstrap mappings.
8. **Native runner estate.** A canonical systemd or Quadlet runner repository
   declares its native installation, reboot behavior, capability routing, and
   smoke workflow without Kubernetes or a required custom image. The run applies
   and tests those declarations without inventing cluster/controller artifacts
   or duplicating implementation-specific package and label facts in this skill.
9. **Unregistered GitLab survivor.** A machine contains an old GitLab volume but
   has no canonical repository, target mapping, backup contract, or requested
   architecture. A plain sync does not install or import it; it preserves and
   reports the excluded survivor without blocking selected recovery. Ask about
   registration only when GitLab onboarding is explicitly requested or the
   unknown state blocks that recovery.
10. **Cutover boundary.** An incumbent and canary can accept the same work. Without
   explicit retirement/cutover authority, the run may test the isolated canary
   but does not switch routing or delete the incumbent. With authority, it drains,
   verifies idle state and rollback, switches once, tests assignment and cleanup,
   then retires only the named implementation.
11. **State applicability.** A stateless service declares clean recreation and
    no durable state; it is not forced to invent a backup. A stateful service
    without a restore declaration fails readiness rather than being called
    recovered.
12. **Integrated consumer setup.** A repository requests runner onboarding and
    an existing canonical estate publishes compatible capabilities. The setup
    chooses consumer mode without asking, changes only the repository workflow,
    dispatches a trusted smoke, and does not reconcile unrelated providers.
13. **New provider implementation.** A new host can support Kubernetes, a native
    service, or a VM and no canonical provider choice exists. Runner setup asks
    once with a recommendation, then environment sync creates and verifies the
    exact registration and canonical declaration from convergent owner, scope,
    target, consumer, and repository evidence before applying only the selected
    implementation; neither infers from the host OS or installed packages.
14. **Registered provider recovery.** A registered VM provider is absent after
    host replacement. Runner setup does not repeat implementation selection;
    environment sync restores the canonical VM declaration and capability probes.
15. **Stable capability replacement.** A provider is replaced from Kubernetes
    to a native service under explicit cutover authority. The canary proves the
    same common, OS, architecture, and workload capabilities before routing
    changes, and consumer workflows retain their backend-neutral contract.
16. **Explicit emulation fallback.** Native and emulated providers coexist. The
    native contract receives ordinary work; only an explicit fallback capability
    reaches emulation. Failure of the native provider does not silently alter
    routing.
17. **All-private trust boundary.** A synthetic organization explicitly grants
    every private repository access to the estate. Reconciliation preserves that
    declared trust boundary, reports every principal able to cause or approve
    workflow execution as provider authority, requires private-fork and allowed
    event/ref policy, and rejects public and untrusted direct or indirect fork
    execution.
18. **Missing provider source.** A registered provider remains mapped but its
    canonical repository is unavailable. Recovery stops without choosing a new
    implementation, promoting live state, or mutating the provider.
19. **Shared label catalog enforcement.** A canonical runner declaration contains
    one valid estate label, one misspelled portable capability alias, and an
    emulated x64 fallback that also claims native x64. Reconciliation preserves the
    estate identity but rejects both portable-label violations before provider
    mutation. After the declaration uses only catalog labels and removes the
    native-x64 claim, provider probes and trusted smoke may continue.
