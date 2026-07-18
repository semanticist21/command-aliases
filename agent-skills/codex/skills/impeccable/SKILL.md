---
name: "impeccable"
description: "Design, audit, or polish frontend UI, UX, and app/site interfaces."
---
# Impeccable

Use for interface design, implementation, audit, or polish. Prioritize the user's primary task, established product language, accessibility, and real interaction over decorative novelty.

## Process

1. Run `node .agents/skills/impeccable/scripts/context.mjs`; read matching `reference/<command>.md` for a subcommand and the product/brand register. Inspect components/tokens/routes and target users/actions/states/constraints; for a new project run `node .agents/skills/impeccable/scripts/palette.mjs`. Reuse the design system before adding primitives.
2. Establish hierarchy: clear page purpose, one primary action, readable grouping, intentional spacing, predictable navigation, and obvious feedback. Reduce visual noise before adding effects.
3. Build all states: loading, empty, error, disabled, validation, focus, hover, active, selected, overflow, long localized text, and narrow/mobile layout. Ensure keyboard access, semantic controls, visible focus, contrast, target size, and motion reduction.
4. Keep components coherent and responsive; avoid duplicated controls, magic layout hacks, hard-coded inaccessible colors, and unnecessary animation. Preserve performance and progressive enhancement.
5. Verify in the browser at relevant sizes and interaction states; code inspection alone is insufficient. Compare against supplied Figma/spec when present, but resolve conflicts with explicit product constraints.

## Finish

Run focused checks, inspect screenshots/rendered UI, and review the diff for hierarchy, consistency, accessibility, resilience, and regression risk. Report changed experience, verification, remaining tradeoffs, and any assumptions.
