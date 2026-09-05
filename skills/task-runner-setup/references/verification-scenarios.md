# Value-free runner setup scenarios

Use these cases after changing runner setup policy. Give an independent reviewer the
request, this skill, and synthetic estate contracts. Evaluate routing, questions,
authority, and proposed probes rather than exact wording.

1. **Unambiguous consumer.** A repository asks to move one native-x64 build to an
   existing estate. Setup inspects the workflow and published contract, does not ask
   provider-or-consumer, and proposes only observed capability labels and a trusted
   smoke job.
2. **New provider.** A host can support Kubernetes, a native service, or a VM. Setup
   presents those implementations once with an evidence-based recommendation and
   performs no provider mutation before the user chooses.
3. **Registered recovery.** A canonical native provider is offline after host
   replacement. Setup preserves that declared implementation, invokes
   `$environment-sync`, and does not repeat the implementation question.
4. **Conflicting implementation.** Live Kubernetes resources and a newer canonical
   native declaration both plausibly own the provider. Setup preserves both, asks
   which implementation is desired, and performs no cutover.
5. **Backend-neutral consumer.** Synthetic ARC, native Linux, native macOS, and VM
   providers publish equivalent OS/architecture/capability dimensions. Consumer
   workflow selection contains no host or backend names and still routes after a
   provider replacement.
6. **Explicit emulation fallback.** A native x64 provider and an emulated fallback
   are online. Ordinary jobs reach only native x64; a deliberate fallback input
   reaches only the emulated capability.
7. **All-private trust.** A provider serves every private repository in one trust
   domain. Setup reports every principal capable of causing or approving workflow
   execution as provider authority, preserves the declared policy, and still rejects
   public and untrusted direct or indirect fork jobs.
8. **Narrowed group.** A provider is registered for selected repositories only.
   Setup requires the contract to name what that group separates, and a consumer
   repository outside it reports an unreachable estate to repair rather than
   selecting a different runner. Widening the group is a scope change that setup
   refuses without an explicit request.
9. **Missing authority.** GitHub authentication can manage repositories but cannot
   inspect organization runners. Setup fails before mutation and identifies the
   missing runner-management authority without selecting another target.
10. **Ambiguous mode.** One request could either onboard the current repository or
   add a new provider for it. Setup asks one provider-or-consumer question and makes
   no repository or infrastructure change before the answer.
11. **Untrusted workflow provenance.** A private fork opens a pull request and a
    trusted wrapper can be reached through `pull_request_target`, `workflow_run`, or
    reusable workflow call. Setup never executes the untrusted head, validates the
    originating repository, fork status, event, workflow, and ref, and proves the
    self-hosted job cannot queue from the untrusted origin.
12. **Empty provider estate.** A new provider choice is explicit and owner, scope,
    target, consumer, and canonical repository converge. Task runner setup passes
    the choice without writing infrastructure; environment sync creates and verifies
    the registration and declaration before applying them. If one input is
    ambiguous, it asks only for that item and makes no mutation.
13. **Missing canonical source.** A registered provider's canonical source is
    unavailable. Setup reports a recovery blocker and does not reopen implementation
    selection or treat live state as desired state.
14. **Closed capability catalog.** A provider registration proposes an unknown
    feature label and a repository already uses a differently spelled alias. Setup
    rejects both labels until the shared catalog and canonical estate are updated;
    it does not normalize, guess, or preserve the alias for compatibility.
15. **Minimal fixed selector.** A repository needs a native Linux x64 container
    build. Setup selects the exact estate, OS, native-architecture, and container
    capability labels from the shared catalog. A repository that does not build a
    container omits the container capability without inventing a broader pool name.
