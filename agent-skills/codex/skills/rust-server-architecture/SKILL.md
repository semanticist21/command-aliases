---
name: "rust-server-architecture"
description: "Rust server architecture: axum/tonic, modules, layering, errors, observability."
---
# Rust Server Architecture

Use this skill when the user wants a Rust backend shaped, audited, or refactored
for durable production structure. Optimize for the existing codebase first:
preserve local conventions unless they block correctness, testing, or operability.

## Root-Scope Constraint

This is a user-scope root skill. Keep guidance project-agnostic:

- Do not encode one repository's folder layout, product boundaries, local docs,
  private conventions, hostnames, or historical decisions as mandatory rules.
- Read the current repo's instructions and follow its conventions before applying
  this skill.
- If a rule is only true for one project, put it in that repo's `AGENTS.md`, docs,
  or a project-local skill instead.
- Treat the structures below as adaptable examples, not mandatory templates.

## Operating Loop

1. Read the nearest repo instructions and current server layout before proposing
   structure.
2. Identify framework and boundary style: axum/actix/tonic, SQLx/Diesel, REST,
   gRPC, event workers, background jobs, or mixed transports.
3. Draw the current call flow in words, usually transport -> application ->
   domain plus application -> infrastructure. Then verify compile-time
   dependencies keep domain independent from transport and infrastructure. Name
   any cycle, leaked DTO, global state, hidden I/O, unbounded concurrency, or
   missing cancellation.
4. Choose the smallest architecture change that makes the next feature safer.
   Do not impose hexagonal/clean architecture ceremony on a small service.
5. If the user asked for code changes, implement incrementally with tests around
   pure logic, mappers, error/status contracts, DB boundaries, and
   regression-prone behavior. If they asked for advice or review, stop at a
   concrete plan.
6. Verify with the repo's lint/test/build commands and report any skipped check.

## Example Shape

When the repo lacks a stronger convention, consider feature-first modules for
product code and shared adapters for external systems:

```text
src/
  main.rs              # process boot only
  lib.rs               # public module graph for tests/bin reuse
  app.rs               # router/server assembly
  config.rs            # env/config parsing
  error.rs             # app-level error envelope/mapping
  telemetry.rs         # tracing/metrics setup
  features/
    <feature>/
      mod.rs
      routes.rs        # HTTP handlers, if any
      grpc.rs          # tonic service impl, if any
      dto.rs           # transport request/response structs
      service.rs       # use cases and transactions
      repo.rs          # persistence boundary for this feature
      model.rs         # domain/value types/invariants
      mapper.rs        # proto/db/dto conversion when non-trivial
      tests.rs
  infra/
    db.rs
    queue.rs
    clients/
```

Use a flatter shape for small crates. Split only when a file has multiple reasons
to change or hides important contracts.

## Boundary Rules

- `main.rs`: parse config, init telemetry, connect resources, call server run.
- Router/service assembly owns dependency wiring. Handlers do not construct pools,
  clients, clocks, ID generators, or feature services ad hoc.
- Transport handlers are thin: extract, validate, call use case, map response.
  No DB queries, business decisions, retries, or cross-feature orchestration.
- Application/use-case layer owns transactions, authorization decisions,
  idempotency, cancellation checks, and calls to repos/clients.
- Domain layer owns invariants and value types. Keep it async-free unless the
  domain truly performs I/O.
- Infrastructure owns SQL/client implementation details. It does not return HTTP
  DTOs or tonic statuses.
- Use traits only at real seams: alternate implementations, tests/fakes, external
  services, or cross-crate public contracts. Avoid Java-style trait-per-struct.
- Keep `AppState` explicit and cheap to clone. Put pools/clients in `Arc` when
  needed; avoid mutable global state.

## Errors

- Use typed errors at feature/application boundaries. `thiserror` is usually a
  good fit for libraries and service internals; `anyhow` is acceptable in binaries,
  one-off tasks, or test setup, but not as a public API contract.
- Map errors to HTTP status or gRPC `Status` at the transport edge only.
- Separate client faults, auth faults, conflicts, not-found, validation, upstream
  failure, timeout/cancellation, and internal failure.
- Preserve source errors for logs/traces while returning stable user/API messages.
- For gRPC, use canonical status codes consistently and include structured details
  only when clients can rely on them.

## Rust Server Hardening

- Every inbound request/RPC has a timeout, deadline, or explicit session/idle
  policy for long-lived streams. Propagate remaining budget to downstream calls
  instead of inventing new full timeouts.
- Check cancellation in long-running work and streaming loops.
- Bound concurrency for fan-out, background jobs, stream processing, and uploads.
- Avoid holding DB transactions, mutex guards, or large allocations across
  unrelated awaits.
- Prefer owned request data before spawning tasks. Do not smuggle borrowed request
  context into detached work.
- Make idempotency explicit for retries, webhooks, commands, and write RPCs.
- Keep serialization contracts versionable: additive fields, stable enum zero
  values for protobuf, backward-compatible defaults.
- Hide secrets in logs and errors. Keep metric labels low-cardinality.

## gRPC / tonic Checks

- Reuse channels and generated clients/stubs; do not reconnect per call.
- Set explicit deadlines/timeouts on clients. Servers should honor cancellation.
- Use keepalive for idle proxies, mobile/unreliable networks, or first-call latency
  only after checking server/proxy policy. Avoid aggressive client pings below
  about one minute, especially without active calls.
- Use streaming only for long-lived logical flows. Streams improve some flows but
  reduce load-balancing flexibility and complicate recovery/backpressure.
- Watch HTTP/2 concurrent-stream saturation. If measured contention exists, split
  high-load areas by channel or use a small channel pool as a targeted workaround.
- For streaming, respect flow control: read while writing when bidirectional,
  bound buffers, handle slow consumers, and define reconnect/resume semantics.
- Retries and hedging only for idempotent methods, with backoff/throttling and
  metrics. Never hide duplicated side effects.

## Observability

- Add tracing spans at request/RPC, use-case, DB, external-client, and background
  job boundaries.
- Include stable request IDs and relevant domain IDs in logs/traces; keep metrics
  labels coarse.
- Track RED metrics (rate, errors, duration), saturation (pool/concurrency/queue),
  timeout/cancel counts, retry/hedge attempts, and DB query latency.
- Health/readiness checks must reflect dependencies needed to serve traffic.

## Test Strategy

- Unit-test pure domain rules, validators, mappers, enum conversions, and error
  classification.
- Integration-test route/RPC contracts, DB transaction behavior, auth boundaries,
  idempotency, and backward compatibility.
- For gRPC, test proto/domain mapping, status-code mapping, deadline/cancellation
  behavior where feasible, and stream close/error paths.
- Prefer focused tests that guard the changed contract over broad snapshot churn.

## Review Output

When reviewing or planning, return:

```text
Architecture verdict: <keep / minor reshape / refactor needed>
Main risk: <one sentence>
Recommended structure: <short tree or module list>
Changes:
- <smallest useful step>
Tests:
- <test or reason omitted>
Verification:
- <commands to run or already run>
```

## Reference Anchors

- Rust API Guidelines: https://rust-lang.github.io/api-guidelines/
- Rust Book, error handling: https://doc.rust-lang.org/stable/book/ch09-00-error-handling.html
- axum docs: https://docs.rs/axum/latest/axum/
- tonic docs: https://docs.rs/tonic/latest/tonic/
- gRPC performance: https://grpc.io/docs/guides/performance/
- gRPC deadlines: https://grpc.io/docs/guides/deadlines/
- gRPC keepalive: https://grpc.io/docs/guides/keepalive/
- gRPC retry: https://grpc.io/docs/guides/retry/
- gRPC hedging: https://grpc.io/docs/guides/request-hedging/
- gRPC flow control: https://grpc.io/docs/guides/flow-control/
