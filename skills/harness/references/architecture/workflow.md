# Architecture workflow

Use only when architecture setup is explicitly requested. Read repository instructions, current code/configuration, and Git state, then identify only the requested runtimes.

1. Before writing, establish product boundary, selected runtimes, authority and ownership boundaries, public contracts, durable-data needs, and success criteria.
2. Use `grilling` once per consequential unknown or conflict. This is required for unclear runtime/transport, preserve-versus-migrate decisions, unclear database lifecycle, and production-data or platform constraints.
3. After decisions, read only the applicable references in this directory. They are defaults; an alternative needs an explicit decision and owner.
4. Apply `harness setup` for the selected runtimes, preserving established structure unless migration was explicitly approved.
5. For a requested new React setup, actually scaffold and configure the baseline in [react.md](react.md), install its packages, and run its checks.
6. When a runnable surface exists, create the root Makefile described in [makefile.md](makefile.md). Do not create one for database-only or non-runnable setups until safe commands are decided. Never infer database bootstrap, reset, migration, or environment targets.

Do not create a sample domain, speculative layer, generic helper service, or documentation history. Stop after the requested minimum setup.
