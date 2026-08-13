---
name: dead-code-removal
description: Find and remove demonstrably unused code, files, assets, exports, or dependencies.
---

# Dead code removal

Prove unreachability with references, build/runtime entrypoints, reflection/config/generated consumers, and public compatibility. Delete the smallest complete dependency chain plus stale tests/docs/config, then run affected build/tests and search removed names. Ask before public API, data, migration, or ambiguous dynamic-use removal.
