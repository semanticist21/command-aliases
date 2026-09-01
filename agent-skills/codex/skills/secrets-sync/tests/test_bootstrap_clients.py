#!/usr/bin/env python3

from __future__ import annotations

import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tarfile
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
SHELL_CLIENT = ROOT / "scripts" / "bootstrap.sh"
POWERSHELL_CLIENT = ROOT / "scripts" / "bootstrap.ps1"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def make_snapshot(path: Path, *, link: bool = False) -> None:
    with tarfile.open(path, "w:gz") as archive:
        directory = tarfile.TarInfo("projects")
        directory.type = tarfile.DIRTYPE
        directory.mode = 0o700
        archive.addfile(directory)
        content = b"fixture bootstrap input\n"
        item = tarfile.TarInfo("projects/example.md")
        item.mode = 0o600
        item.size = len(content)
        archive.addfile(item, io.BytesIO(content))
        if link:
            unsafe = tarfile.TarInfo("linked")
            unsafe.type = tarfile.SYMTYPE
            unsafe.linkname = "projects/example.md"
            archive.addfile(unsafe)


def write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


class ClientHarness:
    def __init__(self, root: Path, fixture: str = "tailscale-linux.json") -> None:
        self.root = root
        self.home = root / "home"
        self.bin = root / "bin"
        self.state = root / "state"
        self.snapshot = root / "snapshot.tar.gz"
        self.home.mkdir()
        self.bin.mkdir()
        self.state.mkdir()
        make_snapshot(self.snapshot)
        self.fixture = FIXTURES / fixture
        python = shutil.which("python3") or "/usr/bin/python3"
        write_executable(
            self.bin / "tailscale",
            f"#!{python}\nimport os, pathlib\nprint(pathlib.Path(os.environ['FAKE_STATUS']).read_text(), end='')\n",
        )
        fake_curl = textwrap.dedent(
            f"""\
            #!{python}
            import json, os, pathlib, sys
            args = sys.argv[1:]
            output = None
            data_file = None
            method = 'GET'
            headers = []
            i = 0
            while i < len(args):
                arg = args[i]
                if arg in ('--output', '-o'):
                    output = args[i + 1]; i += 2; continue
                if arg in ('--header', '-H'):
                    headers.append(args[i + 1]); i += 2; continue
                if arg == '--data-binary':
                    data_file = args[i + 1].lstrip('@'); method = 'POST'; i += 2; continue
                if arg == '--request':
                    method = args[i + 1]; i += 2; continue
                if arg in ('--write-out', '-w', '--proto', '--max-redirs'):
                    i += 2; continue
                i += 1
            url = args[-1]
            expected = 'X-Secrets-Sync-Device-ID: ' + os.environ['FAKE_DEVICE_ID']
            authorized = expected in headers
            status = int(os.environ.get('FAKE_HTTP_STATUS', '200')) if authorized else 403
            body = b'{{"error":"forbidden"}}'
            if status == 200 and url.endswith('/.well-known/secrets-sync'):
                body = b'{{"version":1,"snapshot":"/v1/bootstrap.tar.gz","enroll":"/v1/enroll"}}'
            elif status == 200 and url.endswith('/v1/bootstrap.tar.gz'):
                body = pathlib.Path(os.environ['FAKE_SNAPSHOT']).read_bytes()
            elif status == 200 and url.endswith('/v1/enroll') and method == 'POST':
                value = json.loads(pathlib.Path(data_file).read_text())['public_key']
                assert value.startswith('ssh-ed25519 ') and len(value.split()) == 2
                pathlib.Path(os.environ['FAKE_STATE'], 'enrolled').write_text('yes')
                body = b'{{"enrolled":true,"changed":true}}'
            elif status == 200 and url.endswith('/v1/enroll') and method == 'DELETE':
                pathlib.Path(os.environ['FAKE_STATE'], 'revoked').write_text('yes')
                body = b'{{"revoked":true,"changed":true}}'
            if status == 200 and url.endswith('/v1/enroll') and os.environ.get('FAKE_BAD_ACTION_BODY') == '1':
                body = b'{{}}'
            if output:
                pathlib.Path(output).write_bytes(body)
            print(status, end='')
            """
        )
        write_executable(self.bin / "curl", fake_curl)

    def env(self) -> dict[str, str]:
        status = json.loads(self.fixture.read_text(encoding="utf-8"))
        return {
            **os.environ,
            "HOME": str(self.home),
            "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
            "FAKE_STATUS": str(self.fixture),
            "FAKE_DEVICE_ID": status["Self"]["ID"],
            "FAKE_SNAPSHOT": str(self.snapshot),
            "FAKE_STATE": str(self.state),
        }

    def run(self, action: str = "bootstrap", **extra: str) -> subprocess.CompletedProcess[str]:
        env = self.env()
        env.update(extra)
        return subprocess.run(
            ["/bin/sh", str(SHELL_CLIENT), action],
            env=env,
            capture_output=True,
            text=True,
            timeout=20,
        )

    def macos_jxa_env(self) -> dict[str, str]:
        compat = self.root / "macos-bin"
        compat.mkdir()
        for name in (
            "cat", "chmod", "cmp", "cut", "find", "grep", "ln", "mkdir", "mktemp", "mv",
            "osascript", "rm", "sed", "ssh-keygen", "tar", "tr", "uname", "wc",
        ):
            source = shutil.which(name)
            if source is None:
                raise unittest.SkipTest(f"{name} is unavailable")
            (compat / name).symlink_to(source)
        env = self.env()
        env["PATH"] = str(self.bin) + os.pathsep + str(compat)
        return env


class BootstrapClientTests(unittest.TestCase):
    def test_pointer_free_linux_bootstrap_sends_device_header(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            result = harness.run()
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertTrue((harness.home / ".agents/bootstrap/projects/example.md").is_file())
            self.assertEqual(
                "# Machine-local agent context\n\n- Private bootstrap source: `~/.agents/bootstrap`\n",
                (harness.home / ".agents/doc/AGENTS.local.md").read_text(encoding="utf-8"),
            )
            self.assertTrue((harness.state / "enrolled").is_file())
            self.assertTrue((harness.home / ".ssh/secrets-sync_ed25519").is_file())

    @unittest.skipUnless(shutil.which("osascript"), "macOS JXA is unavailable")
    def test_pointer_free_macos_bootstrap_uses_jxa_without_python_or_jq(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory), "tailscale-macos.json")
            result = subprocess.run(
                ["/bin/sh", str(SHELL_CLIENT), "bootstrap"],
                env=harness.macos_jxa_env(),
                capture_output=True,
                text=True,
                timeout=20,
            )
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertTrue((harness.home / ".agents/doc/AGENTS.local.md").is_file())

    def test_anchor_403_and_redirect_are_terminal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            denied = harness.run(FAKE_HTTP_STATUS="403")
            self.assertNotEqual(0, denied.returncode)
            self.assertFalse((harness.home / ".agents/doc/AGENTS.local.md").exists())
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            redirected = harness.run(FAKE_HTTP_STATUS="302")
            self.assertNotEqual(0, redirected.returncode)
            self.assertFalse((harness.home / ".agents/doc/AGENTS.local.md").exists())

    def test_requires_exactly_one_online_tagged_anchor(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            value = json.loads(harness.fixture.read_text(encoding="utf-8"))
            value["Peer"]["nodekey:second"] = dict(value["Peer"]["nodekey:anchor"])
            ambiguous = Path(directory) / "ambiguous.json"
            ambiguous.write_text(json.dumps(value), encoding="utf-8")
            result = harness.run(FAKE_STATUS=str(ambiguous))
            self.assertNotEqual(0, result.returncode)

    def test_snapshot_links_and_existing_pointer_are_not_installed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            make_snapshot(harness.snapshot, link=True)
            result = harness.run()
            self.assertNotEqual(0, result.returncode)
            self.assertFalse((harness.home / ".agents/bootstrap").exists())
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            pointer = harness.home / ".agents/doc/AGENTS.local.md"
            pointer.parent.mkdir(parents=True)
            pointer.write_text("preserve\n", encoding="utf-8")
            result = harness.run()
            self.assertNotEqual(0, result.returncode)
            self.assertEqual("preserve\n", pointer.read_text(encoding="utf-8"))

    def test_enroll_rotate_and_revoke_use_same_authenticated_action(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            first = harness.run("enroll")
            self.assertEqual(0, first.returncode, first.stderr)
            key = harness.home / ".ssh/secrets-sync_ed25519"
            before = key.read_bytes()
            rotated = harness.run("rotate")
            self.assertEqual(0, rotated.returncode, rotated.stderr)
            self.assertNotEqual(before, key.read_bytes())
            revoked = harness.run("revoke")
            self.assertEqual(0, revoked.returncode, revoked.stderr)
            self.assertTrue((harness.state / "revoked").is_file())

    def test_malformed_success_preserves_a_pending_rotation_for_retry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            self.assertEqual(0, harness.run("enroll").returncode)
            key = harness.home / ".ssh/secrets-sync_ed25519"
            before = key.read_bytes()
            failed = harness.run("rotate", FAKE_BAD_ACTION_BODY="1")
            self.assertNotEqual(0, failed.returncode)
            self.assertEqual(before, key.read_bytes())
            self.assertTrue((harness.home / ".ssh/.secrets-sync_ed25519.pending").is_file())
            retried = harness.run("rotate")
            self.assertEqual(0, retried.returncode, retried.stderr)
            self.assertNotEqual(before, key.read_bytes())

    def test_rotate_rejects_non_regular_canonical_key_before_enrollment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            key = harness.home / ".ssh/secrets-sync_ed25519"
            key.mkdir(parents=True)
            result = harness.run("rotate")
            self.assertNotEqual(0, result.returncode)
            self.assertFalse((harness.state / "enrolled").exists())

    def test_bootstrap_enrollment_failure_is_resumable_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            failed = harness.run("bootstrap", FAKE_BAD_ACTION_BODY="1")
            self.assertNotEqual(0, failed.returncode)
            self.assertTrue((harness.home / ".agents/doc/AGENTS.local.md").is_file())
            marker = harness.home / ".agents/bootstrap/.secrets-sync-enrollment-pending"
            self.assertTrue(marker.is_file())
            retried = harness.run("bootstrap")
            self.assertEqual(0, retried.returncode, retried.stderr)
            self.assertFalse(marker.exists())

    def test_install_without_pointer_resumes_from_owned_markers(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            install = harness.home / ".agents/bootstrap"
            install.mkdir(parents=True)
            (install / ".secrets-sync-install").write_text("version=1\n", encoding="utf-8")
            (install / ".secrets-sync-enrollment-pending").write_text("pending=1\n", encoding="utf-8")
            result = harness.run("bootstrap")
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertTrue((harness.home / ".agents/doc/AGENTS.local.md").is_file())
            self.assertFalse((install / ".secrets-sync-enrollment-pending").exists())

    def test_macos_linux_and_windows_fixtures_share_the_contract(self) -> None:
        for name in ("tailscale-macos.json", "tailscale-linux.json", "tailscale-windows.json"):
            value = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
            peers = list(value["Peer"].values())
            anchors = [
                peer for peer in peers
                if peer["Online"] is True and "tag:secrets-sync-anchor" in peer.get("Tags", [])
            ]
            self.assertEqual(1, len(anchors), name)
            self.assertGreaterEqual(len(value["Self"]["ID"]), 8, name)
        powershell = POWERSHELL_CLIENT.read_text(encoding="utf-8")
        self.assertIn("ConvertFrom-Json", powershell)
        self.assertIn("AllowAutoRedirect = $false", powershell)
        self.assertIn("X-Secrets-Sync-Device-ID", powershell)
        self.assertIn("OpenSSH Client is required", powershell)


if __name__ == "__main__":
    unittest.main()
