---
name: "react-flutter-port"
description: "Port/convert/migrate React UI to Flutter with visual parity, especially demo -> app."
---
# React → Flutter Port

Port a scoped React UI to idiomatic Flutter while preserving behavior, states, accessibility, and visual hierarchy. Treat React as a behavioral/design reference, not a line-by-line implementation template.

## Workflow

1. Read governing instructions and inventory source routes/components/styles/assets/data flow plus Flutter app architecture, navigation, state management, themes, and supported platforms. Resolve scope before editing.
2. Map React concepts to Flutter: component tree → widgets, CSS/tokens → Theme/extensions, state/effects → existing state pattern, route semantics → navigator/router, assets/fonts → Flutter declarations. Reuse existing Flutter primitives first.
3. Implement the smallest coherent screen/feature. Keep business logic out of widgets, make async/loading/error/empty states explicit, preserve input/validation interactions, and use semantic labels/focus/tap targets.
4. Match layout through constraints and responsive breakpoints, not fixed screenshots. Support text scaling, long Korean/localized strings, safe areas, keyboard/insets, dark/light conventions when app supports them, and reduced motion.
5. Verify `flutter analyze`, targeted tests, and actual emulator/device rendering at relevant sizes/states. Compare screenshots/interaction flows with the React reference; fix material deltas.

Report mapping/paths, visual and behavior verification, intentional deviations, and blockers from missing source assets/spec.
