---
name: natural-writing
description: "Rewrite or draft natural Korean/English text while preserving intent. Use for humanize, tone cleanup, copy edits, or message polish."
---
# Natural Writing

## Overview

Use this skill to make text sound written by a careful person in the target language. Preserve the user's meaning, facts, names, numbers, constraints, and level of certainty.

## Workflow

1. Identify the target language, audience, medium, and tone from the user's request and source text.
2. If tone is unspecified, choose a plain, direct, context-appropriate tone:
   - Korean: natural modern Korean, not translated English.
   - English: clear native-sounding prose, not inflated business filler.
3. Rewrite the text first. Keep explanations short unless the user asks for reasoning.
4. If meaning is ambiguous, preserve the likely intent and mention the ambiguity briefly after the rewrite.
5. When the user asks for variants, provide clearly labeled options with distinct tone differences.

## Rules

- Keep the original intent. Do not add claims, promises, dates, legal meanings, or technical details.
- Remove AI-like markers: over-polished symmetry, generic enthusiasm, excessive transitions, vague compliments, and unnatural summary phrasing.
- Prefer concrete verbs and normal sentence rhythm.
- Keep the user's domain terms and product names unless they ask for localization.
- Match formality:
  - Casual Korean: use natural endings like `해요`, `했어요`, `하면 돼요`.
  - Polite business Korean: use concise `합니다/드립니다` without stiff bureaucratic phrasing.
  - Direct Korean note/chat: allow fragments when they sound natural.
  - English business: be direct and courteous without padding.
- Preserve line breaks, bullets, markdown, tables, and code blocks unless the user asks to restructure.
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

Over-polish guard: if more than ~30% of the text changes, roll back to a more conservative pass. Preserve facts, numbers, names, quotes, domain terms, and the source's formality.

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

For edits with important caveats:

```text
[rewritten text]

메모: [brief ambiguity or assumption]
```
