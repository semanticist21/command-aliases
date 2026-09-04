# Runner runtime behavior

Read only the sections relevant to the selected consumer capability or provider
implementation.

## Kubernetes and ARC

Kubernetes is one provider option, not the global default. Pin reviewed ARC charts
and images in the canonical estate. Separate controller/listener and runner
workloads as declared, protect GitHub authentication, use least-privilege service
accounts, and retain logs. Verify the installed ARC version's label behavior rather
than relying on documentation for another release.

Ephemeral runners may scale to zero and disappear from the organization runners API.
Confirm the persistent runner group or scale-set declaration and then dispatch a
job; an empty idle runner list does not prove absence. ARC scale sets carry only
labels explicitly registered for them, so do not add habitual automatic labels to
consumer workflows.

## Native Linux and macOS services

Native services must declare installation, service supervision, upgrade and reboot
behavior, work/cache paths, resource limits, cleanup hooks, and readiness probes.
macOS-native providers are appropriate for capabilities such as Xcode that cannot be
substituted by a Linux VM. Long-lived runners require stronger residue and
cross-repository cleanup checks than ephemeral pods.

## VM providers and emulation

A VM provider declares its guest OS and architecture as capabilities; the host OS
and VM product are implementation inventory. Verify boot, shutdown, restart,
storage, networking, guest update, and host-replacement recovery through the
canonical estate.

QEMU or another emulation path must advertise a distinct fallback capability and
must be selected explicitly. Do not let it share ordinary native routing labels:
GitHub does not provide priority scheduling, so two matching providers race even
when one was intended only for emergencies. Verify correctness and proportionate
performance for the exact fallback workload.

## Containers and shared hosts

A self-hosted image is not `ubuntu-latest`; install or pin every required tool. Use
`uses: docker://image@sha` or an explicit container command for step isolation.
There is no step-level `container:`. A job-level container can break JavaScript
actions on musl images when the runner's Node runtime or externals mount is
incompatible, so test checkout and other JavaScript actions in the declared image.

Shared hardware takes no project's name. Runner groups, service units, cgroup
slices, metrics, and dashboard filters use neutral provider inventory names and are
renamed together. No workflow may share mutable database or worktree state across
repositories or concurrent jobs.
