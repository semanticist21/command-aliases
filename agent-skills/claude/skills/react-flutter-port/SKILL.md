---
name: react-flutter-port
description: "Port/convert/migrate React UI to Flutter with visual parity, especially demo -> app."
user-invocable: true
argument-hint: "<source React path/screen and target Flutter path/screen>"
---
# React Flutter Port

Port a specified React UI to Flutter with behavior and visual hierarchy intact; follow the target app’s architecture over a literal file-by-file translation.

1. Read project instructions and the complete source screen: routes, state, models, assets, interactions, responsive states, loading/empty/error states, and accessibility.
2. Inspect the Flutter app’s navigation, state management, theme/tokens, localization, asset conventions, and existing analogous screens. Reuse them; do not import React assumptions or add dependencies without need.
3. Map components to idiomatic widgets and lifecycle/state boundaries. Port theme/tokens first if a missing shared primitive genuinely blocks parity.
4. Implement incrementally: semantic labels, touch targets, keyboard/focus behavior, overflow/scaling, platform-safe interactions, and deterministic state transitions.
5. Verify analyzer, formatter, tests, and build required by the repo. Compare rendered states at relevant device sizes against the source; UI code inspection alone is insufficient. Fix material visual or interaction gaps.

## Acceptance

The target route works, compiles without new warnings, preserves core flows and states, uses target conventions, and leaves no placeholder behavior unless explicitly accepted. Report source/target paths, mapping decisions, checks, visual comparison, and deliberate deviations.
