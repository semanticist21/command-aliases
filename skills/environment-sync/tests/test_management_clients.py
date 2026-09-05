#!/usr/bin/env python3
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from test_bootstrap_clients import ClientHarness, SHELL_CLIENT


class ManagementClientTests(unittest.TestCase):
    def environment(self, harness, parser):
        env = harness.env()
        if parser == 'python3':
            return env
        compat = harness.root / 'parser-bin'
        compat.mkdir()
        tools = ['cat', 'chmod', 'cmp', 'cut', 'find', 'grep', 'ln', 'mkdir',
                 'mktemp', 'mv', 'rm', 'sed', 'ssh-keygen', 'tar', 'tr', 'uname', 'wc',
                 'osascript' if parser == 'jxa' else 'jq']
        for name in tools:
            source = shutil.which(name)
            if not source:
                self.skipTest(name + ' runtime unavailable')
            (compat / name).symlink_to(source)
        env['PATH'] = str(harness.bin) + os.pathsep + str(compat)
        return env

    def run_action(self, env, action):
        return subprocess.run(['/bin/sh', str(SHELL_CLIENT), action], env=env,
                              text=True, capture_output=True, timeout=20)

    def lifecycle(self, parser):
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            env = self.environment(harness, parser)
            result = self.run_action(env, 'enroll')
            self.assertEqual(0, result.returncode, result.stderr)
            archive = harness.home / '.ssh/secrets-sync_ed25519'
            original_archive = archive.read_bytes()
            management = harness.home / '.ssh/environment-sync-management_ed25519'
            result = self.run_action(env, 'management-enroll')
            self.assertEqual(0, result.returncode, result.stderr)
            original_management = management.read_bytes()
            self.assertNotEqual(original_archive, original_management)
            result = self.run_action(env, 'management-enroll')
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(original_management, management.read_bytes())
            result = self.run_action(env, 'management-rotate')
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertNotEqual(original_management, management.read_bytes())
            self.assertFalse((harness.home / '.ssh/.environment-sync-management_ed25519.pending').exists())
            result = self.run_action(env, 'management-revoke')
            self.assertEqual(0, result.returncode, result.stderr)
            self.assertEqual(original_archive, archive.read_bytes())
            self.assertFalse((harness.state / 'revoked').exists())
            self.assertTrue((harness.state / 'management-revoked').exists())
            trace = (harness.state / 'requests').read_text().splitlines()
            self.assertEqual('DELETE v1/enroll/management', trace[-1])
            self.assertFalse((harness.home / '.agents/bootstrap').exists())

    def test_python_lifecycle(self):
        self.lifecycle('python3')

    def test_jq_lifecycle(self):
        self.lifecycle('jq')

    def test_jxa_lifecycle(self):
        self.lifecycle('jxa')

    def test_management_key_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            ssh = harness.home / '.ssh'
            ssh.mkdir()
            sentinel = harness.root / 'untouched'
            sentinel.write_text('dummy')
            (ssh / 'environment-sync-management_ed25519').symlink_to(sentinel)
            result = self.run_action(harness.env(), 'management-enroll')
            self.assertNotEqual(0, result.returncode)
            self.assertEqual('dummy', sentinel.read_text())
            self.assertFalse((harness.state / 'management-enrolled').exists())

    def test_disabled_endpoint_does_not_fall_back_to_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            harness = ClientHarness(Path(directory))
            env = dict(harness.env(), FAKE_MANAGEMENT_DISABLED='1')
            result = self.run_action(env, 'management-enroll')
            self.assertNotEqual(0, result.returncode)
            trace = (harness.state / 'requests').read_text().splitlines()
            self.assertNotIn('POST v1/enroll', trace)
            self.assertFalse((harness.home / '.ssh/secrets-sync_ed25519').exists())


if __name__ == '__main__':
    unittest.main()
