# Rust/backend default

Use this only for a requested Rust backend. Prefer a modular monolith before separate deployable services: each `features/<domain>/` owns its service/use cases, cross-domain workflows belong in `orchestration/`, and shared pure rules belong in a small shared crate only when genuinely shared.

Prefer Tonic gRPC for an explicitly selected internal or shared contract and SQLx for PostgreSQL access. Keep server authority separate from client state and presentation. A public REST surface, a second deployable service, or asynchronous transport needs an explicit architecture decision.

When an authoritative database mutation requests deferred external work, persist its outbox intent in the same transaction and let a worker execute it. Do not substitute a detached in-process side effect for durable recovery.

For a Rust-only project, create this root `Makefile`. For a `web/` + `server/` project, use the concrete root delegation template in [makefile.md](makefile.md) and keep these targets in `server/Makefile`.

```make
.PHONY: dev check lint test build format verify

dev:
	cargo run

check:
	cargo check

lint:
	cargo clippy -- -D warnings

test:
	cargo test

build:
	cargo build --release

format:
	cargo fmt

verify: check lint test build
```
