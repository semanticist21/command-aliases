# Database default

Use this only when the project needs a relational database. For PostgreSQL, keep a domain-ordered declarative SQL baseline as the current-state schema SSOT: one file set describes the schema as it should be, and nothing else describes it.

Adopt a declarative diff-apply tool from the first day, not at cutover. An idempotent `create ... if not exists` baseline applied by hand looks like it converges and does not: on a database that already exists it is a silent no-op for every added column, dropped column, changed constraint and renamed object, so the live schema diverges with no signal until a query fails in production. The baseline is the declaration; the tool is what makes the live database match it.

Pick a tool that can parse the schema the project actually writes. Verify that before adopting: schemas with functions, triggers, views or extensions disqualify tools whose free tier models tables only. `pgschema` handles plain-SQL PostgreSQL schemas including functions and triggers with no account, is schema-scoped, and emits a machine-readable plan that can be reviewed before it is applied.

Gate destructive changes on that plan rather than on discipline. Drops, truncations and narrowing type changes must refuse to auto-apply and route to an explicit approval; set a lock timeout so a waiting DDL cannot hold connections a small host cannot spare. This replaces the written ritual of backup, stop writers, apply in a reviewed transaction — keep the ritual's steps, let the tool enforce them.

Prove the gate with a negative case. A fixture that drops one column must make the check fail; a check that has only ever passed has not been tested.

For disposable pre-production schema evolution, there is no migration chain or migration-history table: schema history lives in version control, and current state lives in the declaration. Before the first durable production data, explicitly choose the lifecycle for backfills, phased or zero-downtime changes, and data transformations. Those may require a separate ordered data-change chain even when schema remains declarative.

If production data exists, the platform has its own migration runner, or SQL is not the primary data model, settle that lifecycle with `$grilling` before `$harness` documents or structures it.
