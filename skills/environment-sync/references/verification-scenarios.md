# Value-free forward scenarios

Use these cases after changing Environment Sync policy or routing. Give an
independent reviewer the request, this skill, and only synthetic registrations
and empty/dummy credentials needed to choose behavior. Evaluate the decisions
and proposed actions, not exact wording or headings.

## Scope and routing

1. **User recovery with infrastructure.** The common baseline, default private
   collection, one registered stateless runner estate, and one unrelated project
   exist. `$environment-sync user` restores and probes the baseline, collection,
   and runner estate, but does not inspect the unrelated project.
2. **Project recovery.** A repository has a registered collection and one
   infrastructure consumer. A repository-scoped invocation restores only those
   inputs plus the common baseline and registered consumer.
3. **Relevant references only.** A pointer-free device bootstrap with no private
   transfer or infrastructure uses the machine-bootstrap policy and bundled
   client without loading private-input or infrastructure procedure. A later
   archive write additionally loads private-input and operations policy.

## Ambiguity

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
    selects two synthetic critical systems. Apply restores fresh device keys
    and explicit profiles, verifies registered host identity, public-key SSH,
    and `sudo -n id -u == 0` for both, and fails overall if either probe fails.

## Infrastructure authority

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
