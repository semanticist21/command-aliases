import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const verifier = fileURLToPath(new URL('./task-verify.mjs', import.meta.url));

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
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.results.map(({gate}) => gate), ['test', 'lint', 'typecheck', 'build']);
    assert.ok(receipt.results.every(({status}) => status === 0));
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
    const env = {...process.env};
    delete env.DATABASE_URL;
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^'], {cwd: root, encoding: 'utf8', env});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DATABASE_URL is required/u);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.match(receipt.failure, /DATABASE_URL is required/u);
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
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^'], {
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
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /soft-skipped integration dependency/u);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.passed, false);
    assert.equal(receipt.results[0].status, 1);
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
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^', '--dry-run'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.equal(receipt.dryRun, true);
    assert.equal(receipt.passed, false);
    assert.match(receipt.failure, /dry-run/u);
  } finally {
    rmSync(root, {recursive: true, force: true});
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

    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.ok(receipt.changed.includes('new-source.js'));
    assert.equal(receipt.passed, true);
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
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^'], {
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
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^'], {
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
    const result = spawnSync(process.execPath, [verifier, '--base', 'HEAD^'], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    const receipt = JSON.parse(readFileSync(join(root, '.agent-tmp', 'task-verification.json'), 'utf8'));
    assert.deepEqual(receipt.results.map(({gate}) => gate), ['test', 'lint', 'typecheck', 'build']);
    assert.deepEqual(receipt.results.map(({status}) => status), [1, 2, 0, 0]);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
