---
name: "rust-server-architecture"
description: "Rust server architecture: axum/tonic, modules, layering, errors, observability."
---
# Rust Server Architecture

Use for Rust service design or refactoring. First read repository instructions and current boundaries; propose the smallest change that improves correctness and maintainability.

## Shape

- Keep transport (axum/tonic handlers), application/use cases, domain rules, and infrastructure/adapters directionally separated. Dependencies point inward; transport/DB types do not leak into domain APIs.
- Make ownership, validation, authorization/tenant scope, transactions, idempotency, retries, and timeouts explicit at their boundary.
- Use typed inputs/outputs and `thiserror`-style domain errors; map errors once at HTTP/gRPC boundaries to stable public codes/messages. Never expose internal errors or silently discard failures.
- Pass dependencies via narrow traits/structs; avoid global mutable state and premature generic abstraction. Keep modules cohesive and public surfaces small.

## Operations and tests

Instrument request IDs, structured logs, metrics, tracing spans, latency/error outcomes, and health/readiness consistent with the project. Redact secrets/PII.

Test domain/use cases without transport, adapter contracts with real/test infrastructure, and boundary mapping/auth/error cases. For tonic, validate proto compatibility, status codes, deadlines, metadata, streaming cancellation, and generated-code ownership.

Implement only when asked. Verify fmt, clippy, tests, and project-required build; report the call flow, boundary decision, trade-offs, and skipped checks.
