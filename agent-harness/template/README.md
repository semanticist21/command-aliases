# New project template

Two files, ~13 lines. Everything shared lives in `../AGENTS.md`, which every project reads through a
symlink — so there is nothing here to keep in sync later.

```bash
cp <this-repo>/agent-harness/template/AGENTS.md .
ln -sf AGENTS.md CLAUDE.md
git add AGENTS.md CLAUDE.md && git commit -m "chore: 에이전트 하네스 추가"
```

Edit three things: the name, the one-line description, and the run/test/build commands.

`## Decisions` starts empty. A decision arrives as:

```markdown
### D-auth-ttl 세션 만료
2026-08-07 — access token 15분, refresh 30일 미사용. 모바일·웹 공통, 판정은 서버 시각.
```

and the line implementing it carries the tag:

```ts
// [D-auth-ttl] 만료 임계.
const ACCESS_TTL_MIN = 15
```

`git grep '\[D-auth-ttl\]'` finds the code. The tag repeats no rule text, so the two can never disagree.

**The `CLAUDE.md` symlink is not decoration.** Keeping two real files drifts: one repo here reached
`AGENTS.md` 10 lines against `CLAUDE.md` 682 lines, five months apart.
