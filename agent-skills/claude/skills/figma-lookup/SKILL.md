---
name: figma-lookup
description: "Extract screen/spec links from mixed Figma planning boards. Use when given a Figma board and asked for lightweight lookup."
---
# Figma Lookup

Extract the relevant screen/spec nodes from supplied Figma links and persist a short page-local index.

## Gate and target

Parse each URL’s `fileKey` and optional `nodeId`. Resolve the save target before inspecting Figma: use explicit `save=`/`path=`, an explicit page folder, or explicit `domain=` + `page=` and write `<page>/.context/FIGMA.md`. Create the stated folder if missing. If no target is provided, ask for it and stop; do not guess a nearby route.

## Lookup

1. Start at every supplied `nodeId` using direct lookup. Treat it as a likely screen/storyboard fragment; walk parents only when it is label-sized or too narrow.
2. Inspect the containing `FRAME`/`SECTION` and immediate children first. For a large board, narrow by names/types and inspect only plausible screen/spec candidates.
3. List pages/top-level frames only if the direct route fails. Switch current page only when necessary. Do not scan every page by default or use forbidden lookup paths.
4. For multiple links, merge candidates by node ID as one flow, remove duplicates, and group logical screen/spec sets.

## Classify and save

Include likely screens, variants/states, flows, components, and specs; exclude decorative labels, tiny fragments, and unrelated board material. Build links as `https://www.figma.com/design/{fileKey}?node-id={id.replace(':', '-')}&m=dev`.

Save concise Markdown with source links, title/type, hierarchy/context, and a one-line relevance note. Return the most relevant 10–20 results; say when more exist. If access/node lookup fails, report the failed link and the smallest next action rather than fabricating results.
