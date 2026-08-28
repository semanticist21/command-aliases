# Rust/backend default

Use this only for a requested Rust backend. Prefer a modular monolith before separate deployable services: each `features/<domain>/` owns its service/use cases, cross-domain workflows belong in `orchestration/`, and shared pure rules belong in a small shared crate only when genuinely shared.

Prefer Tonic gRPC for an explicitly selected internal or shared contract and SQLx for PostgreSQL access. Keep server authority separate from client state and presentation. A public REST surface, a second deployable service, or asynchronous transport needs an explicit architecture decision.

When an authoritative database mutation requests deferred external work, persist its outbox intent in the same transaction and let a worker execute it. Do not substitute a detached in-process side effect for durable recovery.
