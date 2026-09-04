---
name: secrets-sync
description: Compatibility alias for environment-sync. Use existing $secrets-sync invocations to restore registered machine, project, private inputs, access, and infrastructure while callers migrate to $environment-sync.
---

# Secrets Sync Compatibility

This name is retained so existing prompts and automation do not break. Treat
`$secrets-sync` and all of its arguments exactly as the equivalent
`$environment-sync` invocation.

Read [the Environment Sync skill](../environment-sync/SKILL.md) completely and
follow its routing, references, authority boundaries, and verification rules.
Do not create a separate mapping, archive, desired state, or implementation for
this compatibility name. New documentation and automation should use
`$environment-sync`.
