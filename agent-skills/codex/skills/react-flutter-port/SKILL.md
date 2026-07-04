---
name: react-flutter-port
description: "Port/convert/migrate React UI to Flutter with visual parity, especially demo -> app."
user-invocable: true
argument-hint: "<source React path/screen and target Flutter path/screen>"
metadata:
  short-description: "Port React UI to Flutter with visual parity"
---

# React Flutter Port

Port React UI to Flutter by reconstruction, not blind syntax conversion. Treat the
React screen as the visual and interaction source of truth.

## Goal

For each requested screen/component, produce Flutter that matches the source React
UI at Figma-handoff fidelity:

- layout structure
- viewport breakpoints and safe-area behavior
- widths, margins, padding, gaps, radii, borders, shadows
- font family, size, weight, line height, letter spacing
- icon size, icon slot size, chip/button height, control density
- colors and semantic states
- motion timing and reduced-motion behavior
- loading, empty, error, disabled, selected, pressed, focused states
- behavior, data contracts, validation, and navigation

Do not claim parity from code similarity alone. Confirm visually.

## Required Inputs

Before editing, identify:

- Source React files: component, route, shared UI, style/theme tokens, fixture/API data.
- Target Flutter files: feature folder, design-system components, route/provider/data boundary.
- Screens/states to match: at minimum happy path plus any visible loading/empty/error state.
- Viewports: mobile primary, plus tablet/desktop if the source has responsive behavior.

If the source screen belongs to a larger flow, inspect adjacent screens first so
controls, copy, density, and navigation match the flow.

## Workflow

1. Capture source first.
   - Start the React/demo/web source and take screenshots before target edits.
   - Capture the same route/state/viewport that the Flutter target must match.
   - Use browser screenshots, DevTools box measurements, DOM inspection, and
     source code together. Treat this like a Figma handoff from a live product.

2. Inventory source UI.
   - Read React component tree, CSS/Tailwind classes, shared primitives, route logic,
     data/view-model helpers, and feature `AGENTS.md`.
   - Extract a small component map: each visible region, its role, dimensions,
     spacing, typography, colors, and states.

3. Map architecture.
   - Put Flutter UI in `presentation/`.
   - Put providers/view-model orchestration in `application/`.
   - Put mock/API/fixture repositories and mappers in `data/`.
   - Put screen-friendly models in `model/`.
   - Never hardcode product behavior inside widgets. Use a repository/API boundary
     even when the backend is not ready.

4. Port design system first when needed.
   - Move source tokens before screen-specific widgets: colors, radii, spacing,
     shadows, typography, motion, icon slots, section cards, controls.
   - Match numeric density instead of inventing Flutter-default padding.
   - Bundle/source the same font family before judging text parity.

5. Implement screen.
   - Build Flutter widgets to match the extracted component map.
   - Keep one public widget per file unless local convention says otherwise.
   - Avoid Material defaults that change density, corner radius, min size, or
     typography unless explicitly restyled to match the React source.

6. Visual parity gate.
   - Run the React source locally and capture screenshots for required states.
   - Run the Flutter target and capture screenshots for the same states/viewports.
   - Compare side by side or with image diff tooling.
   - Rework until visible differences are intentional and documented.
   - Use reviewer agents for repeated visual checks when available. Give reviewers
     the source screenshot, target screenshot, and component map; ask for concrete
     mismatches only.
   - Combine methods aggressively: Browser/Playwright screenshots, DevTools
     measurements, Flutter simulator/device screenshots, golden/screenshot tests,
     coarse image diff, and independent visual reviewer passes.

7. Deterministic verification.
   - Run Flutter analyze/tests and any affected React/demo checks.
   - Add/refresh widget, provider/repository, interaction, and golden/screenshot
     tests where the project has a surface for them.
   - Run `git diff --check`.

## Acceptance Criteria

A port is not done until all are true:

- Every source visible region has a target Flutter equivalent or a documented,
  user-approved omission.
- Button/control dimensions, margins, padding, gaps, and radii are intentionally
  matched, not approximate.
- Typography and icon slots are measured against the source.
- Data behavior goes through target app layers, not widget-local fake state.
- React and Flutter screenshots exist for the same state and viewport.
- Reviewer visual pass returns zero actionable mismatches.
- Required tests/checks pass, or any blocked check is reported with exact reason.

## Output

Report:

- source files inspected
- target files changed
- states/viewports captured
- visual diffs found and fixed
- checks run with pass/fail
- residual differences, if any, with explicit rationale
