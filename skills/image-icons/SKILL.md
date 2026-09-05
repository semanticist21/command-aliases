---
name: image-icons
description: Create consistent raster UI icons with GPT Image in ChatGPT or Codex app environments, normalize transparent WebP assets, and integrate them into an app when requested.
---

# Image icons

Use the app-provided image-generation tool when available. Follow its current tool contract and applicable image-generation instructions; do not invent a tool name or claim a particular model version unless exposed. If unavailable, explain that limitation and ask before switching to a paid API/CLI workflow. Existing `openai-image` is a separate API workflow, not an automatic fallback.

## Design and generate

- Inspect the actual icon locations, display sizes, and existing reference images. Inherit material, palette, and visual weight from the selected reference, not a fixed brand or a previous project. Keep project-specific imagery out of this public skill.
- Preserve the user's chosen concept. Brand style does not imply adding mascots, ears, paws, leaves, hearts, or other decoration to unrelated symbols. Prefer a simple silhouette that communicates the feature at its real size.
- For a new set, establish one representative icon before expanding unless the user has already approved the style and scope. Reuse the same asset across equivalent concepts.
- Keep a common canvas, optical padding, lighting, perspective, and detail level. Generation resolution is independent of the rendered UI size; do not assume the tool obeyed requested pixel dimensions.
- Request genuine transparent alpha, clean antialiased edges, and no text, checkerboard, enclosing tile, or external shadow unless explicitly desired. Use references as style references or edit targets according to the tool contract. Generate each distinct asset separately unless the user explicitly requests a sprite sheet.

## Normalize and inspect

For user-authorized deterministic crop/resize/format conversion, run `python3 <skill-dir>/scripts/normalize.py INPUT OUTPUT.webp [--size 256] [--fill 0.72] [--threshold 1]`. Requires ImageMagick 7 (`magick`). The helper rejects opaque/empty input and existing output; it does not remove an opaque background.

- Defaults are a 256px square and maximum subject dimension of about 184px (72%); adapt them to the UI's maximum size and device pixel ratio. Match optical weight as well as bounding boxes, especially for thin and wide subjects.
- Inspect the actual alpha. An alpha channel alone is insufficient; a baked checkerboard is not transparency. If extraction fails, report it and use an available authorized background-removal workflow. Do not erase light-colored foreground with a global white-color key or substitute an approximate silhouette mask.
- Trim using alpha bounds, not RGB colors in transparent pixels; keep antialiasing and internal holes. The threshold ignores faint outliers when determining crop bounds, so inspect faint/thin foreground for clipping.
- Preserve the generation original. Default to lossless transparent WebP, measure the real byte size, and consider lossy WebP only when useful and visually verified. Never describe WebP as universally smaller.
- Inspect the decoded export over light and dark backgrounds, then at actual UI sizes. If a viewer shows artifacts, cross-check another decoder or a composited preview before attributing them to the file.

## Integrate only when requested

- Store consumed assets inside the project. Inspect its asset registry, canonical source directory, copy/sync mapping, hashes, and build manifest; register all required owners so regeneration cannot restore old artwork.
- Use a shared feature-icon component or the project's existing equivalent. Preserve labels, accessibility, navigation, selected states, and reduced-motion behavior. Decorative imagery must not duplicate spoken labels. Do not remove a vector icon dependency while controls or lookup code still use it.
- For refresh indicators, preserve rotation center, pull progress, loading transition, clipping, and reduced-motion behavior unless the user requests changes to those behaviors. Replace the artwork independently of the animation.
- Verify real image decoding and layout after refreshing the asset bundle. In widget captures, await image decoding and load the app font; a passing layout test can capture blank images or missing glyphs.
- Show a contact sheet or representative rendered screen, and report saved assets, applied locations, meaningful verification, and any unfinished work. Preview-only requests do not authorize repository integration or publication.
