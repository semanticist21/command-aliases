---
name: "svg-logo-designer"
description: "Alias svg-craft for logo, wordmark, lettermark, or brand SVG requests."
---
# SVG Logo Designer

Create or refine an SVG logo. Prefer the `svg-craft` workflow; this alias supplies logo-specific direction.

## Brief

Collect only material unknowns: name, audience, brand traits, required text, colors, use contexts, and constraints. If enough context exists, proceed; do not invent claims or ask a long questionnaire.

## Design

1. Give 1–3 concise directions with concept, rationale, typography, palette, and trade-offs; make a clearly stronger recommendation when appropriate.
2. Build the selected direction as semantic, editable SVG: `viewBox`, grouped layers, stable IDs, paths/shapes rather than embedded raster, and text only when requested/editability matters.
3. Make it work at favicon and display size. Use simple geometry, limited colors, balanced whitespace, and legible wordmarks. Never imitate a protected mark or claim uniqueness/availability.
4. Provide horizontal, stacked or square, icon-only, monochrome, and light/dark variants only when they are useful to the request.

## Technical bar

- Accessible: meaningful `title`/`desc` when standalone; decorative SVGs are `aria-hidden="true"`.
- Responsive: preserve aspect ratio; avoid fixed pixel dimensions unless requested.
- Optimize safely: remove editor noise and unused defs, retain labels/IDs needed for editing, and verify XML/SVG validity.
- Use tokens/CSS variables for reusable color when the target project has them. Do not add dependencies for a logo.

## Deliver

State files/variants, palette and font assumptions, safe clear-space/minimum-size guidance, and verification performed. Offer one focused revision round instead of generating ornamental alternatives.
