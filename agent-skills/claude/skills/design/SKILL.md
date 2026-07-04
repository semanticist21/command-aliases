---
name: "design"
description: "Use when creating or modifying UI screens to keep them minimal, non-duplicative, and conventional."
---
# Design

Apply this before changing screens or UI.

- Show each metric or fact once per relevant UI unit or summary surface. Do not repeat the same value across a header, card, row, modal, or template instance. Repeated list items may use the same label/CTA pattern when each item describes a different object or action.
- Do not show the same visible information twice in one UI unit. Status, plan state, count, date, price, limit, benefit, and CTA labels must each have one owner; do not repeat them between title, helper text, badge, trailing value, button text, or empty-state copy.
- Before implementing or approving UI, scan every row/card/modal for semantic duplicates. If two labels would make the user say "this says the same thing twice" (for example `Subscribed` in both helper text and badge), treat it as a design defect and remove or rewrite one surface.
- Keep decoration minimal. Avoid decorative badges, large icon backdrops, arbitrary accent colors, and non-essential graphics.
- Keep typography uniform within a group. Emphasize only the core value or next action/date.
- Compress layout height. Use tight rows, modest padding, dividers, and no required eyebrow/caption when parent context already says it.
- Keep interaction direct and conventional. Prefer one tap for the expected action; avoid extra modals or confirmation steps except destructive or undo-like actions.
- Use one active/check color across items. Do not assign different status colors unless the meaning is real and user-facing.
- Surface only information the user can act on or needs to notice now. Before adding a status/badge/list item, ask "does this change what the user does next?" — if a fact is stale, already resolved, or has no follow-up action (e.g. a one-time step that was already completed and never recurs), drop it rather than displaying it as if it still needs attention. Don't let a data field exist just because the model has it.
