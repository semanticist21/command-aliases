---
name: "design"
description: "Use when creating or modifying UI screens to keep them minimal, non-duplicative, conventional, and clearly hierarchical."
---
# Design

Apply this before changing screens or UI.

## Minimal, not empty (hierarchy first)

Density here means more *information* (a meta sub-line, real trailing content), never more chrome — the "keep decoration minimal / compress height / no required eyebrow" rules below still bind, and a meta sub-line is not an eyebrow. When unsure, cut chrome and keep content.

- Minimal ≠ sparse. Stripping structure until rows read as "label on the left, button on the right, empty middle" looks unfinished, not clean — users call it "덜 만든 것 / 구림". Minimal means cutting the unnecessary while keeping clear hierarchy and enough content density that each surface feels intentional. If a card looks bare, add a supporting sub-line (meta: tier · count) or richer trailing content before you add decoration.
- One hero, one accent per unit (강약조절). The entity name or primary value is the single loudest element; exactly one action carries the accent; demote secondary actions to muted or text-link weight. When a title plus two buttons all share the same weight, that reads as "everything striking" — fix the hierarchy, don't reach for another color.
- Drop titles that only restate context. A section title that repeats what the screen header or parent already says (e.g. "내 가구 관리" on the household screen) is dead weight — lead with the meaningful content (the entity name as the card title) instead. Reinforces the "no required eyebrow/caption" rule below.
- Balance rows; keep the trailing slot filled. Every list row should end with a trailing element so it isn't left-crammed with a void on the right. For a current/unavailable state, show a disabled control (e.g. a greyed "사용 중" where others show "전환") rather than hiding it — alignment stays consistent and the state still reads. Make mutually-exclusive trailing actions actually exclusive (don't render both a "leave" and a disabled "current" on the same row).

## Loading and verification

- Load inside the surface, not on the trigger. For an action that fetches (create invite link, etc.), open the modal/panel immediately and show skeletons inside; don't spin the trigger button and then pop the finished result. Reserve each element's height (validity line, image/QR box, buttons, code block) so real content fills in with zero layout shift.
- See it before shipping. Code review of UI is not enough — render the screen and look. When the live app is reachable, use it; when login/setup is blocked, build a throwaway static preview that links the project's already-built CSS and hand-writes the markup, then screenshot. Weak hierarchy, sparse rows, and clashing weights are obvious visually and invisible in a diff.

## Alignment defaults

- Treat icon + label controls as one layout group. Buttons, tabs, chips, and menu rows that pair an icon with text should use flex/inline-flex with explicit cross-axis centering, main-axis alignment, and `gap`; give the icon a fixed box and prevent it from shrinking. The control owns alignment — do not rely on the SVG and font sharing a baseline.
- Do not repair control alignment with magic nudges such as negative baseline offsets, relative `top`, transforms, or asymmetric icon margins. Those values drift with fonts, browsers, zoom, and runtime ports. Baseline alignment is appropriate only for a genuinely inline icon inside prose, and still requires rendered verification.
- Keep sibling states on the same alignment contract. Icon + label, label-only, loading, and disabled variants should preserve the control's height, center line, and hit area. Center the actual visible group by default; reserve an absent icon's slot only when a stable shared column or in-place state transition genuinely requires it.
- Verify alignment visually at the target viewport and font. Check the icon and label as a group, not each child in isolation; confirm horizontal centering, optical vertical centering, fixed control height, and no shift across active/disabled/loading states.

## Copy

- Match verb mood to purpose. Action prompts and CTAs take the request form (…하세요); status, result, and error copy stay descriptive (…해요/…돼요). Don't mechanically convert a whole screen one way — a status toast in 하세요 or a call-to-action in 해요 both read wrong. Pick words that match the surrounding section vocabulary and the audience (a warm consumer app, not a corporate tool).

## De-duplication and density

- Show each metric or fact once per relevant UI unit or summary surface. Do not repeat the same value across a header, card, row, modal, or template instance. Repeated list items may use the same label/CTA pattern when each item describes a different object or action. If an active filter/selection already states an identity or grouping fact (e.g. filtered to one entity), drop that fact from each row and keep it only at the filter level — don't drop fields still needed for scanning, comparison, or per-row copy (date, status, amount).
- Do not show the same visible information twice in one UI unit. Status, plan state, count, date, price, limit, benefit, and CTA labels must each have one owner; do not repeat them between title, helper text, badge, trailing value, button text, or empty-state copy.
- Before implementing or approving UI, scan every row/card/modal for semantic duplicates. If two labels would make the user say "this says the same thing twice" (for example `Subscribed` in both helper text and badge), treat it as a design defect and remove or rewrite one surface.
- In rows/cards, place elements by importance and role instead of packing details into one text block: primary title/summary leads, secondary details support it, and status or quick actions sit in trailing or distinct slots.
- Keep decoration minimal. Avoid decorative badges, large icon backdrops, arbitrary accent colors, and non-essential graphics.
- Keep typography uniform within a group. Emphasize only the core value or next action/date.
- Compress layout height. Use tight rows, modest padding, dividers, and no required eyebrow/caption when parent context already says it.
- Keep interaction direct and conventional. Prefer one tap for the expected action; avoid extra modals or confirmation steps except destructive or undo-like actions.
- Use one active/check color across items. Do not assign different status colors unless the meaning is real and user-facing.
- Unify chip/badge shapes; differentiate by role, not by ad-hoc styling: a structural tag (outline) vs a live-status tag (soft fill), same size and radius.
- On action/status/attention surfaces, show only information the user can act on or needs to notice now. Before adding a status, badge, or list item, ask "does this change what the user does next?" If a fact is stale, already resolved, or has no follow-up action, do not present it as current or attention-worthy. Preserve it where read-only history, audit trails, receipts, or completed-step confirmations are the point.
