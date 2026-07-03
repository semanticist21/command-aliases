---
name: "coding-rule"
description: "Use when writing or modifying code to keep it minimal, contextual, and idiomatic for the project."
---
# Coding Rule

Apply this before changing code.

- Write minimal code. Do not add speculative features, abstractions, files, variables, or types.
- Do not extract single-use helpers. Split only when code is reused or a file becomes genuinely too long.
- Follow YAGNI. Keep behavior and surface area limited to the requested need.
- Preserve context with concise comments on new code units and non-obvious decisions; avoid filler comments.
- Follow the best convention for the project's current language, framework, and library versions.
- Do not export anything that is not used outside the module or package.
- Do not create unused variables, types, constants, or wrappers for possible future use.
