---
name: task-runner-setup
description: Set up self-hosted Actions runner consumers and providers without pinning workloads to one machine.
---

# Runner setup

Classify the request before acting. A repository workflow or onboarding request is
consumer setup. A runner host, runner group, scale set, backend, or new estate is
provider setup. Ask which mode only when the request and current scope leave both
plausible.

For consumer setup, read [capability-labels.md](references/capability-labels.md),
[consumer.md](references/consumer.md), and only the applicable parts of
[runtimes.md](references/runtimes.md). Inspect the repository, select observed
catalog labels, add the smallest safe lane, and verify dispatch.

For any provider setup, read
[capability-labels.md](references/capability-labels.md),
[provider.md](references/provider.md), and the applicable parts of
[runtimes.md](references/runtimes.md). For a new provider, ask once which
implementation to use, with an evidence-based recommendation. Offer
Kubernetes/ARC, native Linux service, native macOS service, VM/OrbStack, and any
already registered implementation; never choose from the host OS alone. Pass the
choice to `$environment-sync`, which creates or verifies the canonical registration
and then reconciles the selected host, cluster, service, storage, and recovery
declarations. Reapplying a registered estate keeps its declared implementation
without asking again unless valid registrations conflict or the user requests a
change.

GitHub-hosted runners are forbidden. Verify GitHub authority and the current estate
before writes, never alter organization-wide runners without request, and never let
public or untrusted fork code reach self-hosted runners. Consumer workflows select
capabilities, not machines or provider implementations. Validate configuration, run
a non-destructive smoke, verify routing/logs/cache/cleanup, and independently review
safety and behavior. When changing this skill, use the value-free cases in
[verification-scenarios.md](references/verification-scenarios.md).
