---
name: figma-lookup
description: Extract useful screen/spec links from mixed Figma boards.
---

# Figma lookup

Require an explicit save/page target. Use `figma-use` and targeted node lookup, not page-wide metadata/screenshots; expand only to the nearest useful frame/section and immediate children. Classify full screens, partial cases, popups, and planning/spec nodes; dedupe by node ID, cap normal output to 10–20 relevant links, and save one concise `.context/FIGMA.md`. Never infer a target folder or request write access for read errors.
