import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const verifier = fileURLToPath(new URL('./task-verify.mjs', import.meta.url));
const allGateArgs = ['--gate', 'test', '--gate', 'lint', '--gate', 'typecheck', '--gate', 'build'];

// Runs a Git command inside a fixture repository.
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
}

// Creates a two-commit fixture so HEAD^ is a stable verification base.
function commitFixture(root, changedPath) {
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'verify@example.test');
  git(root, 'config', 'user.name', 'Verify Test');
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  writeFileSync(join(root, changedPath), 'changed\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'change');
}

test('runs all available gates once for a changed JavaScript package', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-js-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: Object.fromEntries(['test', 'lint', 'typecheck', 'build'].map((gate) => [gate, `node -e "process.stdout.write('${gate} passed\\\\n')"`])),
    }));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', ...allGateArgs], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.results.map(({gate}) => gate), ['test', 'lint', 'typecheck', 'build']);
    assert.ok(receipt.results.every(({status}) => status === 0));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('runs only requested uncovered gates', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-selected-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: Object.fromEntries(['test', 'lint', 'typecheck', 'build'].map((gate) => [gate, `node -e "process.stdout.write('${gate} passed\\\\n')"`])),
    }));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'lint', '--gate', 'build'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.requestedGates, ['lint', 'build']);
    assert.deepEqual(receipt.results.map(({gate}) => gate), ['lint', 'build']);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('runs an explicitly requested downstream package without direct changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-packages-'));
  try {
    for (const [name, scripts] of [['a', {test: 'node -e "process.exit(9)"'}], ['b', {lint: 'node -e "process.exit(9)"'}], ['c', {lint: 'node -e "process.exit(0)"'}]]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'package.json'), JSON.stringify({scripts}));
      writeFileSync(join(root, name, 'package-lock.json'), '{}');
      writeFileSync(join(root, name, 'source.js'), 'base\n');
    }
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'verify@example.test');
    git(root, 'config', 'user.name', 'Verify Test');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'base');
    for (const name of ['a', 'b']) writeFileSync(join(root, name, 'source.js'), 'changed\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'change');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'lint', '--package', '.\\c\\'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.requestedPackages, ['c']);
    assert.deepEqual(receipt.results.map(({cwd, gate}) => ({cwd, gate})), [{cwd: 'c', gate: 'lint'}]);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects a requested package symlink that escapes the repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-package-boundary-'));
  const external = mkdtempSync(join(tmpdir(), 'task-verify-external-package-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}}));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    writeFileSync(join(external, 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}}));
    commitFixture(root, 'source.js');
    symlinkSync(external, join(root, 'external'));
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test', '--package', 'external'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /escapes repository/u);
  } finally {
    rmSync(root, {recursive: true, force: true});
    rmSync(external, {recursive: true, force: true});
  }
});

test('fails with N/A evidence when every requested package-gate lacks a command', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-missing-gate-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}}));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'lint', '--package', '.'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.deepEqual(receipt.results, [{command: [], cwd: '.', status: null, gate: 'lint', nA: 'no command'}]);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('fails before Cargo when changed crate tests can soft-skip without DATABASE_URL', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-rust-'));
  try {
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2024"\n');
    writeFileSync(join(root, 'src', 'lib.rs'), 'pub fn value() -> u8 { 1 }\n');
    writeFileSync(join(root, 'tests', 'db.rs'), 'fn try_real_pool() {} // skip: no local postgres\n');
    commitFixture(root, join('src', 'lib.rs'));
    mkdirSync(join(root, 'js'));
    writeFileSync(join(root, 'js', 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}}));
    writeFileSync(join(root, 'js', 'package-lock.json'), '{}');
    writeFileSync(join(root, 'js', 'source.js'), 'changed\n');
    const env = {...process.env};
    delete env.DATABASE_URL;
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', ...allGateArgs], {cwd: root, encoding: 'utf8', env});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DATABASE_URL is required/u);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.match(receipt.failure, /DATABASE_URL is required/u);
    assert.ok(receipt.results.some(({nA}) => nA === 'no command'));
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not require the test database for a non-test Rust gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-rust-lint-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2024"\n');
    writeFileSync(join(root, 'src', 'lib.rs'), 'pub fn value() -> u8 { 1 }\n');
    writeFileSync(join(root, 'tests', 'db.rs'), 'fn try_real_pool() {} // skip: no local postgres\n');
    const cargo = join(root, 'bin', 'cargo');
    writeFileSync(cargo, '#!/bin/sh\nexit 0\n');
    chmodSync(cargo, 0o755);
    commitFixture(root, join('src', 'lib.rs'));
    const env = {...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`};
    delete env.DATABASE_URL;
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'lint'], {cwd: root, encoding: 'utf8', env});
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.results.map(({gate}) => gate), ['lint']);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('fails before Cargo when the configured database is unreachable', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-db-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2024"\n');
    writeFileSync(join(root, 'src', 'lib.rs'), 'pub fn value() -> u8 { 1 }\n');
    writeFileSync(join(root, 'tests', 'db.rs'), 'fn try_real_pool() {}\n');
    const psql = join(root, 'bin', 'psql');
    writeFileSync(psql, '#!/bin/sh\nexit 2\n');
    chmodSync(psql, 0o755);
    commitFixture(root, join('src', 'lib.rs'));
    const databaseUrl = 'postgres://secret@example.invalid/appdb';
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', ...allGateArgs], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, DATABASE_URL: databaseUrl, PATH: `${join(root, 'bin')}:${process.env.PATH}`},
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /database preflight failed/u);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret/u);
    const receiptText = readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8');
    assert.doesNotMatch(receiptText, /secret/u);
    const receipt = JSON.parse(receiptText);
    assert.equal(receipt.results[0].gate, 'dependency');
    assert.equal(receipt.results[0].status, 2);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('treats soft-skip output as failure even when a package script exits zero', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-soft-skip-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: {test: 'node -e "console.log(\'skip: no local postgres\')"'},
    }));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', ...allGateArgs], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /soft-skipped integration dependency/u);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.equal(receipt.results.find(({gate}) => gate === 'test').status, 1);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('dry-run writes a non-passing receipt and exits nonzero', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-dry-run-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(9)"'}}));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test', '--dry-run'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.dryRun, true);
    assert.equal(receipt.passed, false);
    assert.match(receipt.failure, /dry-run/u);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('invalidates evidence when a verification command mutates the snapshot', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-mutation-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: {test: 'node -e "require(\'fs\').writeFileSync(\'generated.txt\', \'generated\')"'},
    }));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.match(receipt.failure, /snapshot changed/u);
    assert.notEqual(receipt.finalSnapshotFingerprint, receipt.snapshotFingerprint);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('fingerprints file mode and dangling symlink target changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-metadata-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}}));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    symlinkSync('missing-a', join(root, 'link'));
    let result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const first = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8')).snapshotFingerprint;
    chmodSync(join(root, 'source.js'), 0o755);
    result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const modeChanged = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8')).snapshotFingerprint;
    assert.notEqual(modeChanged, first);
    unlinkSync(join(root, 'link'));
    symlinkSync('missing-b', join(root, 'link'));
    result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const linkChanged = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8')).snapshotFingerprint;
    assert.notEqual(linkChanged, modeChanged);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('fingerprints dirty nested Git entries without following symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-gitlink-'));
  const nestedSource = mkdtempSync(join(tmpdir(), 'task-verify-nested-source-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}}));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    git(nestedSource, 'init', '-q');
    git(nestedSource, 'config', 'user.email', 'verify@example.test');
    git(nestedSource, 'config', 'user.name', 'Verify Test');
    writeFileSync(join(nestedSource, 'tracked.txt'), 'tracked\n');
    git(nestedSource, 'add', '.');
    git(nestedSource, 'commit', '-qm', 'nested base');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', nestedSource, 'nested');
    git(root, 'add', '.gitmodules', 'nested');
    git(root, 'commit', '-qm', 'add nested repo');
    symlinkSync('missing-a', join(root, 'nested', 'link'));
    let result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const first = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8')).snapshotFingerprint;
    writeFileSync(join(root, 'nested', 'tracked.txt'), 'dirty\n');
    unlinkSync(join(root, 'nested', 'link'));
    symlinkSync('missing-b', join(root, 'nested', 'link'));
    result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const second = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8')).snapshotFingerprint;
    assert.notEqual(second, first);
  } finally {
    rmSync(root, {recursive: true, force: true});
    rmSync(nestedSource, {recursive: true, force: true});
  }
});

test('includes untracked files and requires an explicit base', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-untracked-'));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'verify@example.test');
    git(root, 'config', 'user.name', 'Verify Test');
    writeFileSync(join(root, 'README.md'), 'base\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'base');
    writeFileSync(join(root, 'package.json'), JSON.stringify({scripts: {test: 'node -e "process.exit(0)"'}}));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    writeFileSync(join(root, 'new-source.js'), 'new\n');

    const missingBase = spawnSync(process.execPath, [verifier], {cwd: root, encoding: 'utf8'});
    assert.notEqual(missingBase.status, 0);
    assert.match(missingBase.stderr, /Usage: task-verify/u);

    const missingGate = spawnSync(process.execPath, [verifier, '--base', 'HEAD'], {cwd: root, encoding: 'utf8'});
    assert.notEqual(missingGate.status, 0);
    assert.match(missingGate.stderr, /Usage: task-verify/u);

    const missingPackage = spawnSync(process.execPath, [verifier, '--base', 'HEAD', '--gate', 'test', '--package'], {cwd: root, encoding: 'utf8'});
    assert.notEqual(missingPackage.status, 0);
    assert.match(missingPackage.stderr, /Usage: task-verify/u);

    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.ok(receipt.changed.includes('new-source.js'));
    assert.equal(receipt.passed, true);
    const firstFingerprint = receipt.snapshotFingerprint;
    writeFileSync(join(root, 'new-source.js'), 'newer\n');
    const rerun = spawnSync(process.execPath, [verifier, '--base', 'HEAD', '--gate', 'test'], {cwd: root, encoding: 'utf8'});
    assert.equal(rerun.status, 0, rerun.stderr);
    const updatedReceipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.notEqual(updatedReceipt.snapshotFingerprint, firstFingerprint);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('records successful DB preflight and runs every Rust gate without rg', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-db-pass-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2024"\n');
    writeFileSync(join(root, 'src', 'lib.rs'), 'pub fn value() -> u8 { 1 }\n');
    writeFileSync(join(root, 'tests', 'db.rs'), 'fn try_real_pool() {}\n');
    for (const [name, body] of [['psql', 'echo 1'], ['cargo', 'exit 0']]) {
      const executable = join(root, 'bin', name);
      writeFileSync(executable, `#!/bin/sh\n${body}\n`);
      chmodSync(executable, 0o755);
    }
    commitFixture(root, join('src', 'lib.rs'));
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', ...allGateArgs], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, DATABASE_URL: 'postgres://fixture', PATH: `${join(root, 'bin')}:${process.env.PATH}`},
    });
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.results.map(({gate}) => gate), ['dependency', 'test', 'lint', 'typecheck', 'build']);
    assert.equal(receipt.passed, true);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('fails when a passing Rust test emits a soft-skip line under --nocapture', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-rust-soft-'));
  try {
    mkdirSync(join(root, 'bin'));
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    writeFileSync(join(root, 'Cargo.toml'), '[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2024"\n');
    writeFileSync(join(root, 'src', 'lib.rs'), 'pub fn value() -> u8 { 1 }\n');
    writeFileSync(join(root, 'tests', 'db.rs'), 'fn try_real_pool() {}\n');
    for (const [name, body] of [['psql', 'echo 1'], ['cargo', "echo 'skip: no local postgres'"]]) {
      const executable = join(root, 'bin', name);
      writeFileSync(executable, `#!/bin/sh\n${body}\n`);
      chmodSync(executable, 0o755);
    }
    commitFixture(root, join('src', 'lib.rs'));
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', ...allGateArgs], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, DATABASE_URL: 'postgres://fixture', PATH: `${join(root, 'bin')}:${process.env.PATH}`},
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /soft-skipped integration dependency/u);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.equal(receipt.results.find(({gate}) => gate === 'test').status, 1);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('continues through all JavaScript gates after failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-verify-all-gates-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      scripts: {
        test: 'node -e "process.exit(1)"',
        lint: 'node -e "process.exit(2)"',
        typecheck: 'node -e "process.exit(0)"',
        build: 'node -e "process.exit(0)"',
      },
    }));
    writeFileSync(join(root, 'package-lock.json'), '{}');
    commitFixture(root, 'source.js');
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', ...allGateArgs], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.results.map(({gate}) => gate), ['test', 'lint', 'typecheck', 'build']);
    assert.deepEqual(receipt.results.map(({status}) => status), [1, 2, 0, 0]);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
