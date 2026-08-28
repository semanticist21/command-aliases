# Code style default

Prefer SSOT and YAGNI. Keep short, single-use helpers, types, constants, and variables inline. Extract only for actual reuse or when one responsibility can no longer be read and changed clearly in place; line count alone is not a reason to split a file or function.

Do not create generic layers, wrapper types, or utility modules in anticipation of reuse. Keep each concept with its owner and remove duplicate responsibility instead of synchronizing copies.

In TypeScript, use `function` declarations for module-scope functions and `const` for functions inside a scope. In other languages, use the idiomatic declaration form while applying the same ownership and extraction rules.
