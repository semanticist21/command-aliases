---
name: project-architecture
description: Plan a new project's architecture and set up only its minimum durable structure.
disable-model-invocation: true
---

# Project architecture

Use only when explicitly invoked. Start a new project by making its architecture stable and legible, not by pre-building speculative layers.

First read the repository instructions, current code and configuration when present, and git state. Identify only the requested runtimes: Rust/backend, React/web, database, mobile, worker, or another concrete surface. Do not assume a runtime because it appears in a reference.

Work in this order:

1. Plan before writing. Establish the product boundary, selected runtimes, authority/ownership boundaries, public contracts, durable-data needs, and success criteria.
2. Invoke `$grill-me` for each consequential unknown or conflict, one at a time with a recommended answer. Required triggers include an unclear runtime or transport, an existing structure that might be preserved or migrated, an unclear database lifecycle, or production data/platform constraints.
3. Read only the applicable references below after those decisions. They are defaults, not requirements; an intentional alternative must have an explicit decision and owner.
4. Once the plan is decision-complete, invoke `$harness` with the selected runtimes and `setup`. Let it create the minimum root/local harness and compatible structure. Preserve established structure unless the user explicitly approves migration.

Do not create a sample domain, vertical slice, generic helper layer, extra service, or documentation history. Stop after the minimum setup requested by the user.

References:

- Rust/backend: [rust.md](references/rust.md)
- React/web: [react.md](references/react.md)
- Database: [database.md](references/database.md)
- Code style: [code-style.md](references/code-style.md)
