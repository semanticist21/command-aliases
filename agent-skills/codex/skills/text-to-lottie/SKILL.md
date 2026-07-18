---
name: text-to-lottie
description: "Create/edit Lottie for SVG/logo/type, loaders, UI motion, charts, scenes, Skottie."
---
# Text To Lottie

Create production-ready, renderable Lottie JSON for the official local Skia Skottie player—never a custom viewer or unverified standalone JSON. Keep instructions portable and ask only when a material decision (background, brand, target, source assets) is unknown.

## References

Always read `references/player-contract.md` for new/edit/fix/verification. Then load only the primary recipe plus needed secondary references: logo, typography/lower-third, loaders/icons/states, UI microinteraction, SVG compatibility, camera/scene, diagram, data, product promo, chapterization, effects, starter projects, `design-taste`, or `motion-taste`. If absent, continue with these inline rules.

## Workflow

1. Resolve target authority: explicit file path, URL route, known project/scene, then a safe new scene. `/__context` is discovery/playback only; overwrite `main-project/scene-1` only if still placeholder.
2. Re-read the resolved `public/projects/<project>/<scene-N>/lottie.json` immediately before writing; the UI may save slots. Choose transparent versus full-frame background first.
3. Write `lottie.json` (and useful `controls.json`) at that exact path. Include `v`, `fr`, `ip`, exclusive `op`, `w`, `h`, `nm`, `assets`, and `layers`.
4. Validate JSON, run/reuse the official player, confirm the scene in `/__context`, and inspect frame 0, midpoint, and `op - 1`. Fix rendering, composition, assets, crop, layer order, text, and motion before completion.

## Design and scene rules

- Premium/minimal means restraint: default chrome budget is zero; use whitespace/alignment before cards, borders, shadows, dividers, glow, or stacked surfaces. One background tone; one deliberate divider treatment if required.
- Full-frame outputs use a visible background with `bgColor` slot/control. Logos, icons, loaders, overlays, lower thirds, and SVG outputs default transparent.
- Use purposeful staged easing, not universal linear/default easing. Expose important editable values as slots and controls when helpful.
- Preserve SVG viewBox and styling; check fills/intersections in Skottie. Fixed prompt text should be vector/shape text because native text is unreliable without verified font blobs; native text slots require explicitly requested editable text plus verified loading.

## Finish

Confirm target, valid JSON, player render, frames, and matching background policy. Check blank canvas, missing assets, overflow, artifacts, and awkward timing. Use eval files only when testing/changing this skill, not normal work.
