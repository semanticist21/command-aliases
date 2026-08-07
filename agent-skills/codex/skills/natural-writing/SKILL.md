---
name: natural-writing
description: "Rewrite or draft natural Korean/English text while preserving intent. Use for humanize, AI-like or TMI cleanup, over-explanation, concise rewriting, tone cleanup, copy edits, or message polish."
---
# Natural Writing

## Overview

Use this skill to make text sound like the user, not like a polished template. The main failure to remove is unsolicited writing: background, explanation, examples, summaries, or conclusions the text does not need.

## Minimal-change ladder

Use the first sufficient operation:

1. Omit: do not add text the user did not request.
2. Preserve: keep wording that already works.
3. Delete: remove filler, repetition, and redundant framing.
4. Reorder: move the answer or main point forward.
5. Rewrite: repair only the awkward or unclear passage.
6. Add: write a new sentence only when required for meaning, accuracy, safety, or the requested effect.

Do not optimize for a fixed word count. Match the source's density and the task's complexity, then stop when the purpose is met.

## Workflow

1. Identify the target language, audience, medium, and tone from the user's request and source text.
2. If tone is unspecified, choose a plain, direct, context-appropriate tone:
   - Korean: natural modern Korean, not translated English.
   - English: clear native-sounding prose, not inflated business filler.
3. Apply the minimal-change ladder. Keep the user's phrasing, roughness, fragments, and rhythm when they work.
4. If meaning is ambiguous, avoid inventing a resolution. Ask when it blocks the rewrite; otherwise preserve the ambiguity.
5. When the user asks for variants, provide clearly labeled options with distinct tone differences.

## Rules

- Keep the original intent. Do not add claims, promises, dates, legal meanings, or technical details.
- Return the requested text directly. Do not add a preamble, explanation of the edit, recap, offer to help, or closing note unless requested or materially necessary.
- Remove AI-like structure: repeated conclusions, unnecessary headings or lists, rule-of-three padding, `not X but Y` symmetry, generic enthusiasm, excessive transitions, vague compliments, and formal wrap-ups.
- Do not replace one set of stock phrases with another. Word blacklists are a cleanup aid, not the method.
- Prefer concrete verbs and normal sentence rhythm.
- Keep the user's domain terms and product names unless they ask for localization.
- Match formality:
  - Casual Korean: use natural endings like `해요`, `했어요`, `하면 돼요`.
  - Polite business Korean: use concise `합니다/드립니다` without stiff bureaucratic phrasing.
  - Direct Korean note/chat: allow fragments when they sound natural.
  - English business: be direct and courteous without padding.
- Preserve line breaks, bullets, markdown, tables, and code blocks unless the user asks to restructure.
- Use headings and bullets only when they make real structure easier to read; do not turn ordinary prose into a template.
- For user-facing copy, reduce cognitive load before adding flourish.
- For sensitive messages, prioritize clarity and respect over cleverness.

## Korean Guidance

- Avoid translationese such as `~에 대한`, `~를 통해`, `~하는 데 있어`, `다양한`, `최적의`, `원활한` unless they are genuinely needed.
- Prefer compact Korean:
  - `확인 부탁드립니다` -> `확인 부탁드려요` or `확인 부탁드립니다` depending on formality.
  - `문제가 발생하였습니다` -> `문제가 발생했습니다` or `문제가 생겼어요`.
  - `사용자의 경험을 개선합니다` -> `사용자가 더 편하게 쓸 수 있게 합니다`.
- Use spacing and particles naturally. Do not overuse nouns where verbs sound better.
- Keep honorifics consistent. Do not mix `합니다` and `해요` styles unless the source intentionally does.

## Korean AI-tell cleanup

Korean AI text tends to over-use a small set of translationese patterns. When the user asks for humanize / Korean cleanup, scan for these and fix surgically — do not rewrite the whole text.

High-frequency AI tells (fix when present):
- `~에 대한`, `~를 통해`, `~하는 데 있어` — replace with direct Korean (`~의`, `~로`, `~할 때`).
- `다양한`, `최적의`, `원활한` — drop unless genuinely needed.
- `문제가 발생하였습니다` → `문제가 생겼습니다` or `문제가 발생했습니다`.
- `사용자의 경험을 개선합니다` → `사용자가 더 편하게 쓸 수 있게 합니다`.
- Over-nounification (`-성`, `-적`, `-화`, `-tion` calques) — convert to verbs where natural.
- `합니다` / `해요` mixed within one passage — keep one formality level unless the source intends the shift.
- English-like relative clause stacking before a noun — break into two sentences or move the modifier after.
- Inanimate subject + transitive verb (`이 시스템은 ... 제공합니다`) — often fine, but if it reads stiff, switch to a human subject.

Over-polish guard: if more than ~30% of the text changes, verify that the request truly requires it; otherwise roll back to a more conservative pass. Preserve facts, numbers, names, quotes, domain terms, uncertainty, and the source's formality.

## Output Shape

Default response:

```text
[rewritten text]
```

For variants:

```text
1. 담백
[text]

2. 조금 더 부드럽게
[text]
```

Only when a brief note is materially necessary, such as for unresolved ambiguity or safety:

```text
[rewritten text]

메모: [brief ambiguity or assumption]
```
