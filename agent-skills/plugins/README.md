# plugins

Plugin **install references**, not vendored copies. Reinstall from the original
marketplace rather than committing the full plugin tree.

## caveman

Ultra-compressed "talk like a caveman" output mode (cuts tokens ~75%) plus
companion skills (cavecrew, caveman-commit, caveman-review, …).

- Source: `github:JuliusBrussee/caveman` (see `known_marketplaces.json`)
- Pinned commit at install time: see `gitCommitSha` in `installed_plugins.json`

Reinstall in Claude Code:

```
/plugin marketplace add JuliusBrussee/caveman
/plugin install caveman@caveman
```

## Files

- `known_marketplaces.json` — marketplace sources (the reusable part: git repo).
- `installed_plugins.json` — install snapshot (scope + pinned commit). The
  `installPath` is machine-local and only informational.
