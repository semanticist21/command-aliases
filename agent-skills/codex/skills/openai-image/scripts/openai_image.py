#!/usr/bin/env python3
"""Generate or edit images via the OpenAI image API (gpt-image-1).

Stdlib only. Reads the key from $OPENAI_API_KEY, else from a key file
(default ~/.private_keys/openai.md) by grabbing the first sk-... token.

Examples:
  openai_image.py "a red fox in snow" -o fox.png
  openai_image.py "icon, flat" --size 1024x1024 --quality high -o icon.png
  openai_image.py "make the sky purple" --edit base.png -o out.png
  openai_image.py "merge these" --edit a.png --edit b.png -o out.png
"""
import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

GEN_URL = "https://api.openai.com/v1/images/generations"
EDIT_URL = "https://api.openai.com/v1/images/edits"
DEFAULT_KEY_FILE = os.path.expanduser("~/.private_keys/openai.md")


def load_key():
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key.strip()
    path = os.environ.get("OPENAI_KEY_FILE", DEFAULT_KEY_FILE)
    try:
        with open(path, encoding="utf-8") as fh:
            m = re.search(r"sk-[A-Za-z0-9_-]+", fh.read())
            if m:
                return m.group(0)
    except OSError:
        pass
    sys.exit("error: no API key. Set OPENAI_API_KEY or put it in " + path)


def post_json(url, key, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", "application/json")
    return _send(req)


def post_multipart(url, key, fields, files):
    boundary = "----oai" + uuid.uuid4().hex
    body = bytearray()
    for name, val in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        body += f"{val}\r\n".encode()
    for name, path in files:
        fn = os.path.basename(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        with open(path, "rb") as fh:
            content = fh.read()
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{name}"; filename="{fn}"\r\n'.encode()
        body += f"Content-Type: {ctype}\r\n\r\n".encode()
        body += content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=bytes(body), method="POST")
    req.add_header("Authorization", "Bearer " + key)
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    return _send(req)


def _send(req):
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        sys.exit(f"error: HTTP {e.code} {e.reason}\n{detail}")
    except urllib.error.URLError as e:
        sys.exit(f"error: request failed: {e.reason}")


def main():
    p = argparse.ArgumentParser(description="OpenAI image generate/edit")
    p.add_argument("prompt", help="text prompt")
    p.add_argument("-o", "--out", default="image.png", help="output PNG path (or prefix when n>1)")
    p.add_argument("--edit", action="append", default=[], metavar="IMG",
                   help="input image to edit; repeat for multiple")
    p.add_argument("--size", default="1024x1024",
                   help="1024x1024 | 1536x1024 | 1024x1536 | auto")
    p.add_argument("--quality", default="high", help="low | medium | high | auto")
    p.add_argument("--background", default=None, help="transparent | opaque | auto")
    p.add_argument("-n", type=int, default=1, help="number of images")
    p.add_argument("--model", default="gpt-image-1")
    args = p.parse_args()

    key = load_key()
    if args.edit:
        for img in args.edit:
            if not os.path.isfile(img):
                sys.exit(f"error: input image not found: {img}")
        fields = {"model": args.model, "prompt": args.prompt,
                  "size": args.size, "quality": args.quality, "n": str(args.n)}
        if args.background:
            fields["background"] = args.background
        files = [("image[]", img) for img in args.edit]
        result = post_multipart(EDIT_URL, key, fields, files)
    else:
        payload = {"model": args.model, "prompt": args.prompt,
                   "size": args.size, "quality": args.quality, "n": args.n}
        if args.background:
            payload["background"] = args.background
        result = post_json(GEN_URL, key, payload)

    items = result.get("data", [])
    if not items:
        sys.exit("error: no image returned\n" + json.dumps(result)[:500])

    base, ext = os.path.splitext(args.out)
    ext = ext or ".png"
    written = []
    for i, item in enumerate(items):
        b64 = item.get("b64_json")
        if not b64:
            url = item.get("url")
            if url:
                with urllib.request.urlopen(url, timeout=120) as r:
                    raw = r.read()
            else:
                continue
        else:
            raw = base64.b64decode(b64)
        path = args.out if len(items) == 1 else f"{base}-{i + 1}{ext}"
        with open(path, "wb") as fh:
            fh.write(raw)
        written.append(path)

    usage = result.get("usage")
    print("saved: " + ", ".join(written))
    if usage:
        print("tokens: " + json.dumps(usage))


if __name__ == "__main__":
    main()
