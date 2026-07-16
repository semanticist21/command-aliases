#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import sys
sys.dont_write_bytecode = True
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


SCRIPT = Path(__file__).parents[1] / "remote-runner" / "hooks" / "prune-cache.py"
SPEC = importlib.util.spec_from_file_location("prune_cache", SCRIPT)
assert SPEC and SPEC.loader
prune_cache = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prune_cache)


class PruneCacheTests(unittest.TestCase):
    def test_candidates_skip_recent_lock_and_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old = root / "old.bin"
            old.write_bytes(b"old")
            old_time = time.time() - prune_cache.RECENT_SECONDS - 10
            os.utime(old, (old_time, old_time))
            recent = root / "recent.bin"
            recent.write_bytes(b"recent")
            lock = root / "old.lock"
            lock.write_bytes(b"lock")
            os.utime(lock, (old_time, old_time))
            (root / "link").symlink_to(old)

            paths = [entry[2] for entry in prune_cache.candidates(root)]

            self.assertEqual(paths, [old])

    def test_invalid_limits_fail_before_pruning(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            previous = sys.argv
            sys.argv = [str(SCRIPT), "--root", directory, "--max-gb", "0", "--min-free-gb", "1"]
            try:
                self.assertEqual(prune_cache.main(), 2)
            finally:
                sys.argv = previous

    def test_enforce_checks_backing_volume_free_space(self) -> None:
        with tempfile.TemporaryDirectory() as cache, tempfile.TemporaryDirectory() as backing:
            previous = sys.argv
            sys.argv = [
                str(SCRIPT),
                "--root",
                cache,
                "--backing-root",
                backing,
                "--max-gb",
                "1",
                "--min-free-gb",
                "1",
                "--enforce",
            ]

            def disk_usage(path: Path) -> SimpleNamespace:
                free = 0 if Path(path).resolve() == Path(backing).resolve() else prune_cache.GIB * 10
                return SimpleNamespace(free=free)

            try:
                with mock.patch.object(prune_cache.shutil, "disk_usage", side_effect=disk_usage):
                    self.assertEqual(prune_cache.main(), 1)
            finally:
                sys.argv = previous

    def test_sparse_image_remaining_growth_is_reserved(self) -> None:
        with tempfile.TemporaryDirectory() as cache, tempfile.TemporaryDirectory() as backing:
            image = Path(backing) / "runner-data.ext4"
            with image.open("wb") as image_file:
                image_file.truncate(1024 * 1024)
            previous_argv = sys.argv
            previous_gib = prune_cache.GIB
            prune_cache.GIB = 1
            sys.argv = [
                str(SCRIPT),
                "--root",
                cache,
                "--backing-root",
                backing,
                "--backing-image",
                str(image),
                "--max-gb",
                "1",
                "--min-free-gb",
                "1",
                "--enforce",
            ]

            def disk_usage(path: Path) -> SimpleNamespace:
                free = 100 if Path(path).resolve() == Path(backing).resolve() else 10_000_000
                return SimpleNamespace(free=free)

            try:
                with mock.patch.object(prune_cache.shutil, "disk_usage", side_effect=disk_usage):
                    self.assertEqual(prune_cache.main(), 1)
            finally:
                prune_cache.GIB = previous_gib
                sys.argv = previous_argv


if __name__ == "__main__":
    unittest.main()
