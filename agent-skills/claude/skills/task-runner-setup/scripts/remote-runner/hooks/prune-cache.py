#!/usr/bin/env python3
"""Bound a disposable cache tree while preserving recently used entries."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from pathlib import Path

GIB = 1024**3
RECENT_SECONDS = 15 * 60


def allocated_bytes(root: Path) -> int:
    total = 0
    for path in root.rglob("*"):
        try:
            if path.is_file() and not path.is_symlink():
                total += path.stat().st_blocks * 512
        except FileNotFoundError:
            pass
    return total


def candidates(root: Path) -> list[tuple[float, int, Path]]:
    cutoff = time.time() - RECENT_SECONDS
    result: list[tuple[float, int, Path]] = []
    for path in root.rglob("*"):
        try:
            stat = path.stat()
        except FileNotFoundError:
            continue
        if not path.is_file() or path.is_symlink() or stat.st_mtime >= cutoff:
            continue
        if path.name.endswith((".lock", ".lck")):
            continue
        result.append((stat.st_mtime, stat.st_blocks * 512, path))
    result.sort(key=lambda item: item[0])
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--max-gb", required=True, type=int)
    parser.add_argument("--min-free-gb", required=True, type=int)
    parser.add_argument("--backing-root", type=Path)
    parser.add_argument("--backing-image", type=Path)
    parser.add_argument("--enforce", action="store_true")
    args = parser.parse_args()

    if args.max_gb <= 0 or args.min_free_gb < 0:
        print("cache limits must be positive", file=sys.stderr)
        return 2

    root = args.root.resolve()
    if str(root) in {"/", "/cache/.."} or not root.is_dir():
        print(f"unsafe or missing cache root: {root}", file=sys.stderr)
        return 2

    backing_root = args.backing_root.resolve() if args.backing_root else root
    if not backing_root.is_dir():
        print(f"missing cache backing root: {backing_root}", file=sys.stderr)
        return 2
    backing_image = args.backing_image.resolve() if args.backing_image else None
    if backing_image and not backing_image.is_file():
        print(f"missing cache backing image: {backing_image}", file=sys.stderr)
        return 2

    def required_backing_free() -> int:
        if not backing_image:
            return min_free
        stat = backing_image.stat()
        remaining_growth = max(0, stat.st_size - stat.st_blocks * 512)
        return min_free + remaining_growth

    max_bytes = args.max_gb * GIB
    target_bytes = int(max_bytes * 0.85)
    min_free = args.min_free_gb * GIB
    size = allocated_bytes(root)
    free = shutil.disk_usage(root).free
    backing_free = shutil.disk_usage(backing_root).free
    backing_required = required_backing_free()
    print(
        f"runner cache: {size / GIB:.1f} GiB; "
        f"data free: {free / GIB:.1f} GiB; backing free: {backing_free / GIB:.1f} GiB; "
        f"backing required: {backing_required / GIB:.1f} GiB"
    )

    if size > max_bytes or free < min_free or backing_free < backing_required:
        for _, blocks, path in candidates(root):
            try:
                path.unlink()
                size = max(0, size - blocks)
            except FileNotFoundError:
                pass
            except OSError as error:
                print(f"cache prune skipped {path}: {error}", file=sys.stderr)
            free = shutil.disk_usage(root).free
            backing_free = shutil.disk_usage(backing_root).free
            backing_required = required_backing_free()
            if size <= target_bytes and free >= min_free and backing_free >= backing_required:
                break

        for directory in sorted(root.rglob("*"), reverse=True):
            try:
                directory.rmdir()
            except OSError:
                pass

    size = allocated_bytes(root)
    free = shutil.disk_usage(root).free
    backing_free = shutil.disk_usage(backing_root).free
    backing_required = required_backing_free()
    healthy = size <= max_bytes and free >= min_free and backing_free >= backing_required
    print(
        f"runner cache after prune: {size / GIB:.1f} GiB; "
        f"data free: {free / GIB:.1f} GiB; backing free: {backing_free / GIB:.1f} GiB; "
        f"backing required: {backing_required / GIB:.1f} GiB"
    )
    if args.enforce and not healthy:
        print("runner cache guard: insufficient free space", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
