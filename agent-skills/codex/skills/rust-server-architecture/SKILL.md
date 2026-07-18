---
name: "rust-server-architecture"
description: "Rust server architecture: axum/tonic, modules, layering, errors, observability."
---
# Rust Server Architecture

Design or review production Rust services (primarily axum/tonic) with explicit boundaries, reliable errors, and observability. Follow existing repository conventions before introducing patterns.

## Architecture

- Keep transport handlers thin: parse/authenticate/request context, call application use cases, map typed errors to protocol responses. Put business logic in application/domain modules and I/O in adapters.
- Depend inward through traits at boundaries; construct concrete clients in composition/root. Avoid framework/database types leaking into domain APIs.
- Model validated identifiers and state with types. Validate at edges, make invariants explicit, and use transactions/idempotency keys for externally retryable mutations.
- Separate commands from queries when complexity warrants it; avoid speculative layers for small services.
- Design async ownership deliberately: no blocking work on async runtime, bounded concurrency/timeouts, cancellation propagation, and no locks across `.await`.

## Errors, security, operations

- Use a typed error taxonomy: validation/auth/not-found/conflict/transient/internal. Preserve sources internally, expose stable safe messages/codes, and never leak secrets or database details.
- Authenticate/authorize near the edge and enforce resource ownership in application logic. Validate untrusted input, parameterize queries, minimize credentials, and make dangerous actions auditable.
- Propagate correlation/request IDs, structured logs, metrics, tracing spans, health/readiness, and bounded retry/backoff only for safe transient operations.
- Version API/protobuf deliberately; make compatibility and migration behavior explicit. Prefer graceful shutdown and cleanup for workers/background tasks.

## Delivery

Map existing modules and constraints, make the smallest coherent change, and test domain behavior plus handler/integration boundaries. Run `cargo fmt`, relevant `clippy`, tests, and project checks. Document non-obvious cross-layer decisions briefly at the owning boundary.
