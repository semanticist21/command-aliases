# Runner setup operations

This compatibility index keeps older links valid. Route by responsibility:

- Repository workflow and onboarding: [consumer.md](consumer.md)
- New or existing runner providers: [provider.md](provider.md)
- Shared provider/consumer label catalog: [capability-labels.md](capability-labels.md)
- ARC, native, VM, container, and scale-to-zero behavior: [runtimes.md](runtimes.md)
- Policy decision checks: [verification-scenarios.md](verification-scenarios.md)

The public entrypoint is `task-runner-setup`. Provider infrastructure mutation is
performed through `$environment-sync` after the implementation choice is explicit.
