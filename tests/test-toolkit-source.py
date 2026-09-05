import importlib.util
from pathlib import Path
import unittest
import subprocess
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("source", Path(__file__).parents[1] / "scripts/toolkit-source.py")
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class Handoff(unittest.TestCase):
    def run_case(self, dirty="", current=source.ENTRY, fail=None, remotes="origin", pushes=None, override="origin"):
        calls = []
        target = "ssh://git@forge.example.test/owner/toolkit.git"
        def git(repo, *args):
            calls.append(args)
            if args == fail:
                raise RuntimeError("fixture failure")
            return {("status", "--porcelain"): dirty,
                    ("symbolic-ref", "--short", "HEAD"): "main",
                    ("remote", "get-url", "origin"): current,
                    ("remote", "get-url", "--push", "--all", "origin"): current if pushes is None else pushes,
                    ("config", "--default", "origin", "--get", "remote.pushDefault"): override,
                    ("config", "--default", "origin", "--get", "branch.main.pushRemote"): override,
                    ("remote",): remotes,
                    ("remote", "get-url", "github-bootstrap"): source.ENTRY,
                    ("rev-parse", "FETCH_HEAD"): "b" * 40}.get(args, "")
        value = {"repository": target, "branch": "main", "continuity_commit": "a" * 40}
        with patch.object(source, "git", git):
            try:
                result = source.handoff(Path("."), value)
            except (ValueError, RuntimeError):
                result = "blocked"
        return result, calls

    def test_clean_switch_preserves_head(self):
        result, calls = self.run_case()
        self.assertEqual(result, "source_switched")
        self.assertFalse(any(c[0] in {"merge", "reset", "checkout"} for c in calls))
        self.assertEqual(calls[-1][:3], ("remote", "set-url", "origin"))

    def test_dirty_and_unknown_origin_untouched(self):
        for kwargs in ({"dirty": " M file"}, {"current": "https://other.test/r.git"}):
            result, calls = self.run_case(**kwargs)
            self.assertEqual(result, "blocked")
            self.assertFalse(any(c[:2] == ("remote", "set-url") for c in calls))

    def test_divergence_untouched(self):
        result, calls = self.run_case(fail=("merge-base", "--is-ancestor", "HEAD", "b" * 40))
        self.assertEqual(result, "blocked")
        self.assertFalse(any(c[:2] == ("remote", "set-url") for c in calls))

    def test_idempotent(self):
        result, calls = self.run_case(current="ssh://git@forge.example.test/owner/toolkit.git")
        self.assertEqual(result, "source_verified")
        self.assertFalse(any(c[:2] == ("remote", "set-url") for c in calls))

    def test_multiple_push_urls_and_overrides_block(self):
        for kwargs in ({"pushes": source.ENTRY + "\n" + source.ENTRY},
                       {"override": "github-bootstrap"}):
            result, calls = self.run_case(**kwargs)
            self.assertEqual(result, "blocked")
            self.assertFalse(any(c[:2] == ("remote", "set-url") for c in calls))

    def test_real_git_handoff_and_failed_fetch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            upstream, checkout = root / "upstream", root / "checkout"
            def run(*args):
                return subprocess.check_output(["git", *map(str, args)], stderr=subprocess.DEVNULL, text=True).strip()
            run("init", "-b", "main", upstream)
            run("-C", upstream, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
                "commit", "--allow-empty", "-m", "baseline")
            baseline = run("-C", upstream, "rev-parse", "HEAD")
            run("clone", upstream, checkout)
            run("-C", checkout, "remote", "set-url", "origin", source.ENTRY)
            value = {"repository": upstream.as_uri(), "branch": "main", "continuity_commit": baseline}
            self.assertEqual(source.handoff(checkout, value), "source_switched")
            self.assertEqual(run("-C", checkout, "remote", "get-url", "--push", "origin"), upstream.as_uri())
            self.assertEqual(run("-C", checkout, "rev-parse", "HEAD"), baseline)
            self.assertEqual(source.handoff(checkout, value), "source_verified")
            run("-C", checkout, "config", "branch.main.pushRemote", "github-bootstrap")
            with self.assertRaises(ValueError):
                source.handoff(checkout, value)
            run("-C", checkout, "config", "--unset", "branch.main.pushRemote")
            run("-C", checkout, "remote", "set-url", "origin", source.ENTRY)
            run("-C", checkout, "remote", "set-url", "--push", "origin", source.ENTRY)
            value["repository"] = (root / "absent").as_uri()
            with self.assertRaises(RuntimeError):
                source.handoff(checkout, value)
            self.assertEqual(run("-C", checkout, "remote", "get-url", "origin"), source.ENTRY)


if __name__ == "__main__":
    unittest.main()
