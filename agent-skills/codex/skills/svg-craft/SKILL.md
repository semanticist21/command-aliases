---
name: svg-craft
description: "Create, edit, optimize, or animate SVG icons, diagrams, charts, or badges."
---
# SVG Craft

Produce correct, minimal, scalable SVG by hand. Default to clean geometry, a tight
`viewBox`, semantic structure, and currentColor-friendly theming. Save real `.svg`
files with the Write tool unless the user only wants inline markup.

## When to use

- Create an icon, illustration, diagram, chart, badge, pattern, or UI ornament as SVG.
- Edit/repair existing SVG (broken paths, wrong viewBox, clipped content, off-center).
- Optimize/minify, recolor, make responsive, or add accessibility to SVG.
- Animate a vector (CSS or SMIL) or convert SVG ⇄ PNG.

Do **not** over-fire on plain CSS/HTML styling questions, raster image work, or
requests that merely mention an existing `.svg` file without wanting vector work.

## Workflow

1. **Pin the canvas.** Pick one `viewBox="0 0 W H"` and design entirely in those
   user units. Omit `width`/`height` so the graphic scales to its container; add
   them only when the user needs an intrinsic size.
2. **Structure before detail.** Group with `<g>`, name groups by role, define
   reusable bits (`<defs>`, `<symbol>`, gradients, `clipPath`, `mask`) once and
   reference with `<use>`/`url(#id)`. Keep ids unique and descriptive.
3. **Draw with intent.** Prefer primitives (`rect`/`circle`/`line`/`polygon`) when
   they fit; use `<path>` for the rest. Keep coordinates on a sensible grid, round
   to ≤2 decimals, and align stroked edges to half-pixels only when the user wants
   crisp small sizes.
4. **Theme for reuse.** Use `fill="currentColor"` (and `stroke="currentColor"`) so
   icons inherit text color; expose other colors via a small `<style>` class set or
   CSS custom properties (`fill: var(--accent, #4F46E5)`). Set
   `stroke-linecap`/`stroke-linejoin="round"` and `vector-effect="non-scaling-stroke"`
   when stroke width must stay constant across scales.
5. **Make it accessible.** Decorative → `aria-hidden="true"`. Meaningful →
   `role="img"` + `<title>` (and `<desc>` if complex), referenced via
   `aria-labelledby`.
6. **Verify it renders.** Mentally (or by opening) confirm nothing clips the
   viewBox, paths close correctly (`Z`), and the graphic is centered/balanced.
   Re-check after edits.
7. **Optimize last.** Strip editor cruft (`<metadata>`, `sodipodi:`/`inkscape:`
   attrs, empty groups, default attributes), collapse transforms where cheap, and
   trim decimals. Suggest running SVGO for heavy files:
   `npx svgo in.svg -o out.svg`.

## Path command reference

`M`/`m` move · `L`/`l` line · `H`/`h` `V`/`v` ortho line · `C`/`c` cubic bézier ·
`S`/`s` smooth cubic · `Q`/`q` quadratic · `T`/`t` smooth quad · `A`/`a` elliptical
arc (`rx ry x-rot large-arc sweep x y`) · `Z` close. Uppercase = absolute,
lowercase = relative.

## Skeleton

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="icon-title">
  <title id="icon-title">Description</title>  <!-- ids must be unique per document when inlining multiple SVGs -->
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- shapes -->
  </g>
</svg>
```

## Techniques

- **Gradients:** `<linearGradient>`/`<radialGradient>` in `<defs>`, refer with
  `fill="url(#id)"`. Keep stops minimal.
- **Reuse/symbols:** define a `<symbol id>` then `<use href="#id" x.. y.. />` for
  sprites and repeated marks.
- **Clip/mask:** `clipPath` for hard cuts, `mask` for soft/alpha edges.
- **Animation:** prefer CSS (`@keyframes` on `transform`/`stroke-dashoffset`) for
  control and theming; use SMIL (`<animate>`, `<animateTransform>`) for
  self-contained, standalone files. `pathLength` normalizes draw-on animations.
- **Responsive embed:** inline for full CSS control; `<img src=...>` for simplicity;
  set `preserveAspectRatio` (default `xMidYMid meet`) intentionally.

## Convert SVG → PNG

```bash
npx svgexport in.svg out.png 1024:   # width-locked
rsvg-convert -w 1024 in.svg -o out.png
inkscape in.svg --export-type=png --export-width=1024
magick -background none -density 384 in.svg -resize 1024x out.png   # needs -density; rsvg/inkscape give better fidelity
```

## Output

Show the SVG markup in a fenced block, then write it to a `.svg` file when the user
wants a file. For multiple variants, write each to a clearly named file
(`name-filled.svg`, `name-outline.svg`). Keep the markup minimal — no editor
metadata, no dead defs.
