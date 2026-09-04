# Runner capability label catalog

Provider and consumer setup both use this reference. Its machine-readable catalog
is the closed source for portable labels and selectors. A provider publishes only
labels it has proved, and a consumer selects only catalog labels. Neither side
creates aliases, changes spelling or case, or derives labels from a hostname,
backend, distribution, or product name.

<!-- capability-catalog:start -->
```json
{
  "schema_version": 1,
  "estate": {
    "count": 1,
    "source": "canonical-estate",
    "aliases_allowed": false
  },
  "portable_labels": {
    "os": ["os-linux", "os-macos"],
    "architecture": ["arch-x64", "arch-arm64"],
    "capability": [
      "cap-container-build",
      "cap-xcode",
      "cap-qemu-x64-fallback"
    ]
  },
  "selectors": {
    "native-linux-x64": ["os-linux", "arch-x64"],
    "native-linux-arm64": ["os-linux", "arch-arm64"],
    "native-xcode": ["os-macos", "arch-arm64", "cap-xcode"],
    "arm64-qemu-x64-fallback": [
      "os-linux",
      "arch-arm64",
      "cap-qemu-x64-fallback"
    ]
  },
  "invariants": {
    "architecture_semantics": "native-execution",
    "qemu_x64_fallback_forbidden_labels": ["arch-x64"]
  }
}
```
<!-- capability-catalog:end -->

## Required labels

Every provider publishes exactly one label from each required dimension:

- one estate label: the exact stable value in the canonical estate's
  machine-readable capability contract;
- operating system: `os-linux` or `os-macos`; and
- native execution architecture: `arch-x64` or `arch-arm64`.

The estate label is the only estate-specific value. Every backend in that estate
publishes the same single value, consumers copy it exactly, and aliases are
forbidden. Placeholders such as `<estate>` and local variants are never valid in a
workflow. GitHub-provided labels such as `self-hosted`, `Linux`, and `X64` are not
part of this portable contract.

## Optional capability labels

Publish an optional label only after its capability probe passes:

- `cap-container-build`: the runner can perform the estate's declared container
  build workflow;
- `cap-xcode`: the runner provides the declared Xcode toolchain; and
- `cap-qemu-x64-fallback`: a non-native path can execute the estate's declared x64
  fallback workload through QEMU or equivalent emulation.

`cap-qemu-x64-fallback` never grants `arch-x64`. The architecture label describes
the runner's native execution architecture, not an artifact target or emulated
guest. A fallback job must request the fallback label explicitly.

## Consumer selectors

Labels form an AND contract. Start with the estate, OS, and architecture labels,
then add only capabilities the job requires:

| Workload | Required selector after the estate label |
| --- | --- |
| Native Linux x64 | `os-linux`, `arch-x64` |
| Native Linux ARM64 | `os-linux`, `arch-arm64` |
| Container build | matching OS and architecture, `cap-container-build` |
| Native Xcode | `os-macos`, `arch-arm64`, `cap-xcode` |
| ARM64-hosted x64 fallback | `os-linux`, `arch-arm64`, `cap-qemu-x64-fallback` |

Provider inventory may contain implementation or machine labels for operations,
but consumer workflows never use them.

## Extending the catalog

New portable labels require a deliberate update to this catalog and the canonical
estate before any provider advertises or consumer requests them. Define the probe,
routing semantics, and collision behavior with the new label. Until that change is
landed and synchronized, reject unknown labels instead of approximating them with a
new spelling.
