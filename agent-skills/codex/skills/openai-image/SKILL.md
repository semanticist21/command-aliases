---
name: openai-image
description: "Generate/edit OpenAI gpt-image images via $openai-image; edits/inpaint; not Figma/SVG."
user-invocable: true
argument-hint: <prompt> [--edit base.png] [--size 1024x1024] [--quality high] [-o out.png]
allowed-tools: Bash(python3 *), Read
---

# OpenAI Image

Generate or edit images through OpenAI's `gpt-image-1` model using the bundled
script. The script is stdlib-only Python — no pip installs.

## Key handling

- The script reads `$OPENAI_API_KEY` first, then falls back to the first `sk-...`
  token in the file named by `$OPENAI_KEY_FILE`.
- Never hardcode or echo the key. Never paste it into a command line.

## Run

`SKILL_DIR` is this skill's folder. Call the script:

```bash
python3 "$SKILL_DIR/scripts/openai_image.py" "<prompt>" -o output.png
```

### Generate

```bash
python3 .../openai_image.py "a calm watercolor of a walnut" \
  --size 1024x1024 --quality high -o walnut.png
```

### Edit / inpaint (one or more inputs)

```bash
python3 .../openai_image.py "replace the background with deep navy" \
  --edit current.png -o edited.png
python3 .../openai_image.py "combine into one scene" --edit a.png --edit b.png -o out.png
```

### Transparent background

```bash
python3 .../openai_image.py "flat app icon, single walnut" \
  --background transparent -o icon.png
```

## Options

| Flag | Values | Default |
|------|--------|---------|
| `--size` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` | `1024x1024` |
| `--quality` | `low`, `medium`, `high`, `auto` | `high` |
| `--background` | `transparent`, `opaque`, `auto` | (model default) |
| `-n` | image count (out becomes `name-1.png`, `name-2.png`, …) | `1` |
| `--model` | image model id | `gpt-image-1` |
| `-o/--out` | output PNG path | `image.png` |

## Workflow

1. Resolve `SKILL_DIR` to where this SKILL.md lives.
2. Build a clear, specific prompt from the user's request (subject, style, palette,
   composition). Ask only if the request is too vague to render.
3. Run the script with sensible size/quality. Pick a meaningful output filename.
4. After it prints `saved: <path>`, Read the PNG to confirm/show the result.
5. `gpt-image-1` generation is billed per image — note that higher quality and larger
   sizes cost more; do not loop generations without the user asking.

## Notes

- Editing uses `images/edits` (multipart); generation uses `images/generations`.
- On HTTP errors the script prints the API's error body — surface it to the user
  (e.g. quota, content policy, invalid size).
