#!/usr/bin/env python3
"""Execute each shipped discovery parser against the same synthetic states."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class CandidateParserTests(unittest.TestCase):
    def run_cases(self, parser):
        command = 'osascript' if parser == 'jxa' else parser
        if shutil.which(command) is None:
            self.skipTest(command + ' runtime unavailable')
        anchor = {'ID': 'fixture-anchor-01', 'Online': True,
                  'Tags': ['tag:secrets-sync-anchor'], 'DNSName': 'anchor.example.test.',
                  'TailscaleIPs': ['100.64.0.10']}
        ordinary = {'Self': {'ID': 'fixture-client-01'}, 'Peer': {'node': anchor}}
        self_only = {'Self': anchor, 'Peer': {}}
        cases = [('ordinary', ordinary, 1), ('self-only', self_only, 1),
                 ('duplicate', {'Self': anchor, 'Peer': {'node': anchor}}, 2),
                 ('invalid-self', {'Self': [], 'Peer': {'node': anchor}}, None),
                 ('null-self', {'Self': None, 'Peer': {'node': anchor}}, None)]
        for field, value in (('Online', 'true'), ('Tags', 'tag:secrets-sync-anchor'),
                             ('Tags', [7]), ('ID', 12345678)):
            value_status = copy.deepcopy(self_only)
            value_status['Self'][field] = value
            cases.append(('invalid-' + field, value_status, None))
        offline = copy.deepcopy(self_only)
        offline['Self']['Online'] = False
        cases.append(('offline-self', offline, 0))
        shell = (ROOT / 'scripts/bootstrap.sh').read_text()
        function = shell.split('parse_status() {', 1)[1].split('parsed=$(parse_status)', 1)[0]
        shell_program = 'parse_status() {' + function + '\nparse_status\n'
        powershell = (ROOT / 'scripts/bootstrap.ps1').read_text()
        powershell_block = powershell.split('    $status = $statusText | ConvertFrom-Json', 1)[1].split('    $anchorHost =', 1)[0]
        ps_program = ("$ErrorActionPreference='Stop'; Set-StrictMode -Version 2.0\n"
                      "function Fail([string]$Message) { throw $Message }\n"
                      "$statusText = Get-Content -Raw -LiteralPath $env:status_file\n"
                      "$status = $statusText | ConvertFrom-Json\n" + powershell_block +
                      "Write-Output $anchors.Count\nWrite-Output $deviceId\n")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / ('parse.ps1' if parser == 'pwsh' else 'parse.sh')
            script.write_text(ps_program if parser == 'pwsh' else shell_program)
            for name, state, expected in cases:
                with self.subTest(parser=parser, case=name):
                    path = root / 'status.json'
                    path.write_text(json.dumps(state))
                    env = dict(os.environ, parser=parser, status_file=str(path), temp_root=str(root))
                    args = ['pwsh', '-NoProfile', '-File', str(script)] if parser == 'pwsh' else ['/bin/sh', str(script)]
                    result = subprocess.run(args, env=env, text=True, capture_output=True, timeout=20)
                    if expected is None or (parser == 'pwsh' and expected != 1):
                        self.assertNotEqual(0, result.returncode, result.stdout)
                    else:
                        self.assertEqual(0, result.returncode, result.stderr)
                        self.assertEqual(str(expected), result.stdout.splitlines()[0])

    def test_python_parser(self):
        self.run_cases('python3')

    def test_jq_parser(self):
        self.run_cases('jq')

    def test_jxa_parser(self):
        self.run_cases('jxa')

    def test_powershell_parser(self):
        self.run_cases('pwsh')


if __name__ == '__main__':
    unittest.main()
