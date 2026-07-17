import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const finalizer = fileURLToPath(new URL('./task-finalize.mjs', import.meta.url));

// Runs one Git command in a fixture repository.
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// Creates a base checkout plus one task worktree with a committed change.
function fixture(prefix, changedPath = 'change.txt') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const worktree = `${root}-task`;
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'finalize@example.test');
  git(root, 'config', 'user.name', 'Finalize Test');
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  git(root, 'worktree', 'add', '-qb', 'task/sample', worktree, 'HEAD');
  writeFileSync(join(worktree, changedPath), 'task change\n');
  git(worktree, 'add', changedPath);
  git(worktree, 'commit', '-qm', 'fix(task): change fixture');
  return {root, worktree, head: git(worktree, 'rev-parse', 'HEAD')};
}

// Runs the finalizer with the fixture's recorded task identity.
function finalize({root, worktree, head}) {
  return spawnSync(process.execPath, [
    finalizer,
    '--repo', root,
    '--base', 'main',
    '--branch', 'task/sample',
    '--worktree', worktree,
    '--slug', 'sample',
    '--head', head,
  ], {encoding: 'utf8'});
}

// Returns the write-ahead marker path for one base checkout.
function markerPath(root) {
  return join(resolve(root, git(root, 'rev-parse', '--git-common-dir')), 'task-landing-sample');
}

test('lands once and converges when run again after task cleanup', () => {
  const fixtureState = fixture('task-finalize-idempotent-');
  try {
    const first = finalize(fixtureState);
    assert.equal(first.status, 0, first.stderr);
    const landed = git(fixtureState.root, 'log', 'main', '--format=%H', `--grep=^Task-Head: ${fixtureState.head}$`);
    assert.ok(landed);
    assert.equal(readFileSync(join(fixtureState.root, 'change.txt'), 'utf8'), 'task change\n');
    assert.equal(existsSync(fixtureState.worktree), false);
    assert.equal(git(fixtureState.root, 'branch', '--list', 'task/sample'), '');

    const second = finalize(fixtureState);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(git(fixtureState.root, 'rev-list', '--count', 'main'), '2');
    assert.equal(existsSync(markerPath(fixtureState.root)), false);
  } finally {
    rmSync(fixtureState.worktree, {recursive: true, force: true});
    rmSync(fixtureState.root, {recursive: true, force: true});
  }
});

test('recovers a provable interrupted squash landing before retrying it', () => {
  const fixtureState = fixture('task-finalize-recover-');
  try {
    const baseHead = git(fixtureState.root, 'rev-parse', 'main');
    writeFileSync(markerPath(fixtureState.root), `${baseHead}\n`);
    git(fixtureState.root, 'merge', '--squash', 'task/sample');
    assert.ok(existsSync(resolve(fixtureState.root, git(fixtureState.root, 'rev-parse', '--git-path', 'SQUASH_MSG'))));

    const result = finalize(fixtureState);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /recovered interrupted landing/u);
    assert.ok(git(fixtureState.root, 'log', 'main', '--format=%H', `--grep=^Task-Head: ${fixtureState.head}$`));
    assert.equal(existsSync(markerPath(fixtureState.root)), false);
  } finally {
    rmSync(fixtureState.worktree, {recursive: true, force: true});
    rmSync(fixtureState.root, {recursive: true, force: true});
  }
});

test('refuses a marker state whose staged index no longer matches the task branch', () => {
  const fixtureState = fixture('task-finalize-unsafe-');
  try {
    const baseHead = git(fixtureState.root, 'rev-parse', 'main');
    writeFileSync(markerPath(fixtureState.root), `${baseHead}\n`);
    git(fixtureState.root, 'merge', '--squash', 'task/sample');
    writeFileSync(join(fixtureState.root, 'human.txt'), 'do not reset\n');
    git(fixtureState.root, 'add', 'human.txt');

    const result = finalize(fixtureState);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown landing state/u);
    assert.equal(readFileSync(join(fixtureState.root, 'human.txt'), 'utf8'), 'do not reset\n');
    assert.match(git(fixtureState.root, 'diff', '--cached', '--name-only'), /human\.txt/u);
  } finally {
    rmSync(fixtureState.worktree, {recursive: true, force: true});
    rmSync(fixtureState.root, {recursive: true, force: true});
  }
});

test('refuses recovery from a caller checkout no longer on the recorded base', () => {
  const fixtureState = fixture('task-finalize-wrong-base-');
  try {
    writeFileSync(markerPath(fixtureState.root), `${git(fixtureState.root, 'rev-parse', 'main')}\n`);
    git(fixtureState.root, 'merge', '--squash', 'task/sample');
    git(fixtureState.root, 'switch', '-qc', 'other');

    const result = finalize(fixtureState);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be on main/u);
    assert.equal(git(fixtureState.root, 'branch', '--show-current'), 'other');
    assert.equal(existsSync(markerPath(fixtureState.root)), true);
  } finally {
    rmSync(fixtureState.worktree, {recursive: true, force: true});
    rmSync(fixtureState.root, {recursive: true, force: true});
  }
});

test('lands task paths containing newlines without broadening the commit pathspec', () => {
  const changedPath = 'line\nbreak.txt';
  const fixtureState = fixture('task-finalize-newline-', changedPath);
  try {
    const result = finalize(fixtureState);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(fixtureState.root, changedPath), 'utf8'), 'task change\n');
  } finally {
    rmSync(fixtureState.worktree, {recursive: true, force: true});
    rmSync(fixtureState.root, {recursive: true, force: true});
  }
});

test('preserves a task resource advanced after its journaled squash commit', () => {
  const fixtureState = fixture('task-finalize-advanced-');
  try {
    git(fixtureState.root, 'merge', '--squash', 'task/sample');
    git(fixtureState.root, 'commit', '-m', 'journal fixture', '-m', `Task-Head: ${fixtureState.head}`);
    writeFileSync(join(fixtureState.worktree, 'later.txt'), 'later\n');
    git(fixtureState.worktree, 'add', 'later.txt');
    git(fixtureState.worktree, 'commit', '-qm', 'feat: later work');
    const advanced = git(fixtureState.worktree, 'rev-parse', 'HEAD');

    const result = finalize(fixtureState);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /advanced after landing/u);
    assert.equal(existsSync(fixtureState.worktree), true);
    assert.equal(git(fixtureState.root, 'rev-parse', 'task/sample'), advanced);
  } finally {
    rmSync(fixtureState.worktree, {recursive: true, force: true});
    rmSync(fixtureState.root, {recursive: true, force: true});
  }
});
