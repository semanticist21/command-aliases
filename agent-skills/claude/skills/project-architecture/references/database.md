# Database default

Use this only when the project needs a relational database. For a pre-commercial PostgreSQL project, keep a domain-ordered, idempotent declarative SQL baseline as the current-state schema SSOT. Edit that baseline directly in non-production; do not mix migration history, backfills, or destructive patches into it.

At commercial cutover, freeze the tested baseline and bootstrap production once. Later approved durable production changes use a separate ordered append-only migration chain. Never rewrite that frozen baseline or mix the chains.

If production data exists, the platform has its own migration runner, or SQL is not the primary data model, settle the lifecycle with `$grill-me` before `$harness` documents or structures it.
