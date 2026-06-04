---
name: figma-lookup
description: Use when the user provides a Figma link to a storyboard/planning board that mixes mobile screens with right-side planning/spec tables, and wants a lightweight list of screen links plus the matching planning/spec node. Trigger explicitly with /figma-lookup or $figma-lookup. Use figma-use/use_figma shallow indexing, not get_metadata/get_design_context, for storyboard lookup.
---

# Figma Lookup

Use this skill to index a large Figma storyboard without flooding context. Assume the user usually provides one or more large bundle nodes, not single clean screen nodes. The target pattern is a canvas/frame containing one or more mobile screens on the left and one right-side planning/spec table or several smaller planning/spec fragments on the same board.

If the current repository provides a local `$figma-agent` skill, follow it for
shared target resolution, persistence, and Figma MCP boundary rules. In that
setup, this is a single-screen worker skill: it only defines the storyboard
lookup mechanics and `FIGMA.md` output shape for one page/screen.

## Goal

Return a concise list of:

- full screen names with direct Figma links
- partial/case crop names with direct Figma links when a frame is only part of a larger screen
- case/modal/popup names combined with their actual popup/screen links
- matching planning/spec node links

Then persist the result to a page-local Markdown context file when working in a codebase. The lookup is page-scoped, so the save target must come from explicit user input. An explicit app/page folder path from the user is a valid save target even if that folder does not exist yet. Do not infer the domain/page from the local tree, Figma node names, or nearby files. The lookup is not considered complete until either the file is saved or the user has been asked for the missing save location.

Do not list separate label links unless the user explicitly asks. Labels are only helpers for naming nearby screens/popups.

## Required Tool Pattern

Use the Figma `figma-use` skill before every `use_figma` call, then call `use_figma` with `skillNames: "figma-use"`.

Allowed Figma inspection tool for this skill:

- `use_figma` with `skillNames: "figma-use"`

Forbidden as lookup tools:

- `get_metadata`
- `get_design_context`
- `get_screenshot`
- any generated UI/design extraction tool

Default to `use_figma` for lookup. The first Figma inspection call after the save target is resolved must be `use_figma`, not any forbidden lookup tool.

Rationale:

- `get_design_context` on a large board can time out.
- `get_metadata` on a large board can return too much XML or time out.
- `get_screenshot` is visual-only and does not provide exact child node links.
- `use_figma` can return only the small JSON you intentionally select.

Read-only mode is expected for lookup. Never describe read-only itself as a
problem. If a lookup script reports `Operation attempted to modify the file while
in read-only mode`, treat it as a script-shape problem and reduce the script;
do not imply that the file needs write access.

Exception: after `use_figma` has already found a small candidate node, `get_screenshot` may be used only for visual confirmation if the user explicitly needs it. Do not use `get_metadata` or `get_design_context` in this skill.

## Workflow

1. Extract `fileKey` and optional `nodeId` from the user URL.
2. Resolve the save target before Figma inspection. If the user explicitly provides a page folder path such as `apps/.../(page)` or `libs/.../src/pages/...`, use it as the target and append `.context/FIGMA.md`. If the folder does not exist, create it along with `.context`; do not ask whether to use a nearby existing route. If the user did not explicitly provide `save=...`, `path=...`, a page folder path, or both `domain=...` and `page=...`, ask for the page path and stop. Do not run Figma lookup first.
3. Start Figma inspection with a small `use_figma` direct node lookup. Do not use forbidden lookup tools.
4. If the user provides multiple Figma links, treat them as fragments of the same screen/flow by default and merge the results into one list.
5. Treat each given `nodeId` as a likely bundle/storyboard node. If `nodeId` exists, start with direct node lookup. Do not scan every page first.
6. From each node, inspect whether it already looks like a screen/planning bundle. If it is too small or label-like, walk the parent chain upward to identify the containing page, section, and bundle.
7. Inspect only each bundle's immediate children first. For large storyboards,
   inspect one root/frame per `use_figma` call; do not batch multiple root child
   scans until the one-root script has proven stable.
8. If no useful bundle is found from the direct node path, then list pages and top-level `SECTION` / `FRAME` nodes as a fallback.
9. Switch pages with `await figma.setCurrentPageAsync(page)` only when needed.
10. Inside each bundle, return:
   - full screen candidates: named frames that appear to represent a whole route/page
   - partial/case crop candidates: frames that look like cropped subsections, zoomed states, or numbered cases inside a larger screen
   - popup/modal candidates: nodes named `popup`, `Alert`, `Modal`, `팝업`, `모달`, etc.; use their internal text to name them
   - planning/spec candidates: a right-side large table frame or smaller planning/spec fragments near the screens
11. Merge candidates from multiple links by node id, remove duplicates, and group them into one output.
12. Build links with `https://www.figma.com/design/{fileKey}?node-id={idWithDash}&m=dev`, where `idWithDash = id.replace(':', '-')`.
13. Keep output short. If there are many candidates, list the most relevant 10-20 and say more can be expanded.
14. Save the final list as Markdown to the already-resolved page-local target.

## Search Order

Use this order to avoid wandering:

1. **Direct URL node path**: for every supplied `nodeId`, call `figma.getNodeByIdAsync(nodeId)` -> parent chain -> immediate children.
2. **Sibling/parent bundle**: if a URL points to a label, popup, small crop, or spec fragment, inspect its nearest large `FRAME`/`SECTION` parent.
3. **Merge pass**: combine all nodes from all supplied links into one de-duplicated list for the same screen/flow.
4. **Page/top-level fallback**: only if direct lookup fails or the target is not loaded.

Avoid deep traversal helpers such as `findAll` during the first pass on a large
storyboard. Use direct node lookup and immediate children first; only ask for a
smaller frame link or run a targeted popup/text read after a stable one-root
child listing exists.

When summarizing progress, say that the provided link is being treated as a large storyboard/bundle by default. Do not present page-wide scans as the default path if the URL already had a valid node id.

## Classification Rules

Do not treat every mobile-sized frame as an independent screen. Storyboards often duplicate or crop parts of a larger screen to document a case.

- **Full screen**: a route/page-level frame, usually named like a real screen and showing the whole screen state.
- **Partial / case crop**: a frame that shows one section, one numbered case, or a zoomed state from a larger screen.
- **Popup / modal**: a dialog-like node or instance; use internal text to name it when the node name is generic like `popup`.
- **Planning / spec**: a right-side description/table container or nearby planning fragment. Return the useful container/fragment links, not every table cell, unless asked.

When uncertain, classify the node as **partial / case crop** and say it may be part of a larger screen.

## Multiple Links

If the user provides two or more Figma links in one request, assume they refer to one screen/flow unless they explicitly say otherwise.

- Process each link with the direct node path.
- Merge screen, crop, popup/modal, and planning/spec candidates into one output.
- Preserve source links only when needed for disambiguation; otherwise show one clean list.
- If two links point to overlapping parent bundles, prefer the larger common bundle and de-duplicate repeated children by node id.
- If one link is a screen bundle and another is a planning/spec fragment, use the screen bundle for screen/popup candidates and include the spec fragment under planning/spec.

## Persistence

Before the lookup starts, resolve where the page-local Markdown file will be saved. This is part of the workflow, not an optional nice-to-have.

Do not infer the save path. In particular:

- Do not infer `domain` from existing folders under `libs/domains`.
- Do not infer `page` from Figma board names like `홈`, `home`, or screen labels.
- Do not inspect the repository tree to guess the target page.
- Do not replace an explicitly supplied new path with a similar existing path. If
  the user gives `apps/.../ai-menu-image-new/(home)` and only
  `apps/.../ai-menu-image/(home)` exists, create the `ai-menu-image-new` path.
- Do not run Figma inspection while the page path is still unknown.
- Do not call `get_metadata`, `get_design_context`, or `get_screenshot` while the page path is still unknown.

Completion rule:

- If a save target is known from explicit input, run the lookup and write the Markdown file before the final answer.
- If the explicit save target's parent directory does not exist, create it.
- If the save target is unknown, ask a short direct question for the page path and stop before calling Figma tools.
- Do not mark the task as started or done when the lookup cannot proceed because persistence is unresolved.

If the user already specifies the save path or page folder path, use it. A page
folder path resolves to `<that folder>/.context/FIGMA.md`. If not, ask a short
question for the domain/page location before Figma lookup:

```text
어느 페이지에 저장할까요? 예: libs/domains/{domain}/src/pages/{page}/.context/FIGMA.md
```

For the `sosanggongin` layout, use this convention:

```text
libs/domains/{domain}/src/pages/{page}/.context/FIGMA.md
```

The page segment must match the user's requested target, including route groups
such as `(home)`. It does not need to already exist in the source tree; create
new page folders when the user supplies a new path.

Examples:

- home page in ai-menu-image: `libs/domains/ai-menu-image/src/pages/(home)/.context/FIGMA.md`
- nested page: `libs/domains/{domain}/src/pages/{feature}/{page}/.context/FIGMA.md`
- new app route folder supplied by user:
  `apps/microepbus/app/(pages)/ai-menu-image-new/(home)/.context/FIGMA.md`

Create the page folder and `.context` directory if needed. Update an existing `FIGMA.md` rather than creating duplicates. Keep the file focused on lookup artifacts: source links, planning/spec links, full screens, partial/case crops, and popups/modals.

If the current task is explicitly read-only or the user only asks for a quick preview, show the list first and still ask whether/where to persist it.

Suggested skill input examples:

- `/figma-lookup <figma-url> domain=ai-menu-image page=(home)`
- `/figma-lookup <figma-url> save=libs/domains/ai-menu-image/src/pages/(home)/.context/FIGMA.md`
- `/figma-lookup <figma-url>` means ask for the page/domain before lookup.
- `/figma-lookup apps/microepbus/app/(pages)/ai-menu-image-new/(home) <figma-url>` means create that route folder if needed and save to its `.context/FIGMA.md`.

## `use_figma` Snippets

Direct node parent-chain lookup:

```js
const fileKey = "FILE_KEY";
const nodeId = "NODE_ID";
const toLink = (id) => `https://www.figma.com/design/${fileKey}?node-id=${id.replace(":", "-")}&m=dev`;
const safe = (node) => ({
  id: node.id,
  name: node.name,
  type: node.type,
  x: "x" in node ? Math.round(node.x || 0) : null,
  y: "y" in node ? Math.round(node.y || 0) : null,
  width: "width" in node ? Math.round(node.width || 0) : null,
  height: "height" in node ? Math.round(node.height || 0) : null,
  childCount: "children" in node ? node.children.length : null,
  link: toLink(node.id),
});
const target = await figma.getNodeByIdAsync(nodeId);
if (!target) return { error: "target node not found", nodeId };
const chain = [];
let cursor = target;
while (cursor) {
  chain.unshift(safe(cursor));
  if (cursor.type === "PAGE") break;
  cursor = cursor.parent;
}
let bundle = target;
while (bundle.parent && bundle.parent.type !== "PAGE") {
  if (bundle.type === "FRAME" && bundle.width > 1000 && "children" in bundle && bundle.children.length > 4) break;
  bundle = bundle.parent;
}
return {
  target: safe(target),
  parentChain: chain,
  bundle: safe(bundle),
  children: "children" in bundle ? Array.from(bundle.children).map(safe) : [],
};
```

List pages and top-level nodes:

```js
const fileKey = "FILE_KEY";
const toLink = (id) => `https://www.figma.com/design/${fileKey}?node-id=${id.replace(":", "-")}&m=dev`;
return figma.root.children.map((page) => ({
  pageId: page.id,
  pageName: page.name,
  childCount: page.children.length,
  top: page.children.slice(0, 40).map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    width: Math.round(node.width || 0),
    height: Math.round(node.height || 0),
    childCount: "children" in node ? node.children.length : null,
    link: toLink(node.id),
  })),
}));
```

List immediate children of a section/frame:

```js
const fileKey = "FILE_KEY";
const pageId = "PAGE_ID";
const rootId = "ROOT_SECTION_OR_FRAME_ID";
const toLink = (id) => `https://www.figma.com/design/${fileKey}?node-id=${id.replace(":", "-")}&m=dev`;
const simple = (node) => ({
  id: node.id,
  name: node.name,
  type: node.type,
  x: Math.round(node.x || 0),
  y: Math.round(node.y || 0),
  width: Math.round(node.width || 0),
  height: Math.round(node.height || 0),
  childCount: "children" in node ? node.children.length : null,
  link: toLink(node.id),
});
const page = figma.root.children.find((p) => p.id === pageId);
await figma.setCurrentPageAsync(page);
const root = figma.currentPage.findOne((node) => node.id === rootId);
return { root: simple(root), children: Array.from(root.children).map(simple) };
```

Map popup nodes to readable case names:

```js
const textOf = (node) => {
  const texts = [];
  const visit = (n) => {
    if (n.type === "TEXT" && n.characters) texts.push(n.characters.replace(/\s+/g, " ").trim());
    if ("children" in n) for (const child of n.children) visit(child);
  };
  visit(node);
  return [...new Set(texts.filter(Boolean))].slice(0, 8);
};
return bundle.children
  .filter((node) => /popup|Alert|Modal|팝업|모달|toast|Toast/i.test(node.name || ""))
  .map((node) => ({ id: node.id, name: node.name, link: toLink(node.id), texts: textOf(node) }));
```

## Output Format

Use compact Markdown links.

```markdown
# Figma Lookup

Source:
- [Original bundle `node:id`](...)

**기획 / Spec**
- [기획 설명 영역 `node:id`](...)

**화면**
- [화면명 `node:id`](...)

**부분 / 케이스 캡처**
- [부분명 `node:id`](...)

**케이스 / 모달**
- 케이스명: [popup/screen `node:id`](...)
```

When a label node helped identify a popup, mention the label text in the case name, but do not include the label link unless asked.

## Failure Modes

- If a previous attempt used `get_metadata`, `get_design_context`, or screenshot-first lookup on a storyboard node, treat that attempt as invalid and restart from the required `use_figma` direct node path after the save target is known.
- If `use_figma` reports `Operation attempted to modify the file while in read-only mode`, remember that read-only mode is normal for lookup. Say the script shape was too broad, not that read-only is unexpected. Shrink to a one-node read first; then inspect one root's immediate children with `Array.from(root.children).map(...)`. Do not use `findAll`, recursive text crawls, page-wide scans, or multi-root child scans in the retry.
- If a one-root child listing still hits the read-only error, stop after that single reduced retry and ask for a smaller frame link or permission to continue. Do not keep iterating through more Figma calls.
- If page switching fails in read-only mode, first try a smaller read-only `use_figma` call. If needed, use already loaded top-level page children and ask for a smaller frame link.
- If only screenshots work, say that planning/screen flow can be summarized visually, but exact child links still need Figma tree access through `use_figma`.
