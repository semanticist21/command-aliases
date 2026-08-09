---
name: openai-image
description: Generate or edit raster images with the bundled OpenAI script.
user-invocable: true
argument-hint: <prompt> [--edit image] [--size WxH] [--quality level] [-o path]
---

# OpenAI image

Resolve this skill's directory, then run `python3 <skill-dir>/scripts/openai_image.py "<prompt>" -o <path>`; add `--edit`, `--size`, `--quality`, `--background`, or `-n` as requested. The script reads `OPENAI_API_KEY`/`OPENAI_KEY_FILE`; never print or commit credentials. Use a clear prompt and sensible path, inspect the result, avoid unrequested paid retries, and surface API errors verbatim.
