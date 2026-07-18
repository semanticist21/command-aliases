---
name: figma-lookup
description: "Extract screen or spec links from mixed Figma planning boards."
---
# Figma Lookup

Index a supplied Figma storyboard into concise screen, crop/case, popup, and planning/spec links. If a local `$figma-agent` exists, follow it for shared target resolution and MCP boundaries; this skill supplies the one-screen lookup and `FIGMA.md` shape.

## Contract

- Return full screens, partial/case crops, popups (named from internal text where needed), and useful planning/spec containers—not label/cell links unless requested.
- Persist one de-duplicated result to `<explicit page folder>/.context/FIGMA.md`. The user must supply `save=`, `path=`, a page path, or both `domain=` and `page=` before inspection. A supplied nonexistent path is valid: create it. Never infer a page/domain from board names or local folders.
- If no save target is supplied, ask and stop; completion requires save or that question.
- Use `figma-use` before every `use_figma`; use `use_figma` with `skillNames: "figma-use"`. Lookup must not use `get_metadata`, `get_design_context`, generated extraction, or screenshots. A screenshot is allowed only after a small candidate is found and the user explicitly needs visual confirmation.
- Read-only errors mean reduce the lookup script; do not request write access.

## Workflow

1. Parse `fileKey` and every optional `nodeId`; treat multiple links as fragments of one flow unless told otherwise.
2. Start with one small direct-node lookup per root. Inspect parent chain only to find its nearest useful `FRAME`/`SECTION`, then immediate children; do not first scan pages, batch roots, or deep-traverse (`findAll`).
3. If direct lookup fails, list pages/top-level `SECTION`/`FRAME`, switch page only when needed, and retry a targeted root.
4. Classify children: route-level frame = full screen; numbered/zoomed subsection = partial; dialog-like or `popup`/`Alert`/`Modal`/`팝업`/`모달` = popup; right-side table/nearby fragment = planning/spec. When unsure choose partial and state uncertainty.
5. Merge by node id, prefer a shared larger bundle, and cap normal output at the relevant 10–20 entries. Link format: `https://www.figma.com/design/{fileKey}?node-id={id.replace(':','-')}&m=dev`.
6. Save concise Markdown grouped as Screens, Partial/cases, Popups, Planning/spec; mention any unresolved classification.

## Safety

- Do not inspect repository folders to guess the save path or replace an explicit new path with a similar existing one.
- Do not treat every mobile-sized frame as an independent route, or report page-wide scans as default when a valid node URL exists.
