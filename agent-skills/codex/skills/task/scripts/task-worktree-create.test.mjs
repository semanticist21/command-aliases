import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./task-worktree-create.mjs', import.meta.url));
const runtime = script.includes('/claude/') ? 'claude' : 'codex';

// Runs a Git command in a fixture repository.
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// Creates a committed repository that ignores task-local state.
function fixtureRepository(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'task@example.test');
  git(root, 'config', 'user.name', 'Task Test');
  writeFileSync(join(root, '.gitignore'), '.agent-tmp/\n');
  writeFileSync(join(root, 'fixture'), 'committed\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture');
  return root;
}

// Extracts one labeled value from creator output.
function outputValue(output, label) {
  return output.match(new RegExp(`^${label}: (.+)$`, 'mu'))?.[1];
}

test('creates an isolated worktree from HEAD without changing a dirty caller', () => {
  const root = fixtureRepository('task-create-clean-');
  writeFileSync(join(root, 'dirty'), 'caller only\n');
  const before = git(root, 'status', '--porcelain=v1');
  let worktree;
  try {
    const env = {...process.env};
    delete env.CODEX_THREAD_ID;
    delete env.CODEX_SESSION_ID;
    delete env.CLAUDE_SESSION_ID;
    const result = spawnSync(process.execPath, [script, 'sample', '--summary', 'Prepare sample dependencies'], {cwd: root, encoding: 'utf8', env});
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.ok(worktree);
    assert.match(git(worktree, 'branch', '--show-current'), /^task\/sample-/u);
    assert.equal(readFileSync(join(worktree, 'fixture'), 'utf8'), 'committed\n');
    assert.equal(git(root, 'status', '--porcelain=v1'), before);
    const state = readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8');
    assert.match(state, /- setup: complete/u);
    assert.match(state, /- task summary: Prepare sample dependencies/u);
    assert.match(state, new RegExp(`- owner: ${runtime}:[^:]+:.+:Prepare sample dependencies`, 'u'));
    assert.equal(git(worktree, 'status', '--porcelain=v1'), '');
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(root, {recursive: true, force: true});
  }
});

test('retains path and failure state when ignore initialization fails after creation', () => {
  const root = fixtureRepository('task-create-ignore-fail-');
  writeFileSync(join(root, '.gitignore'), '');
  git(root, 'add', '.gitignore');
  git(root, 'commit', '-qm', 'remove task ignore');
  const exclude = join(root, '.git', 'info', 'exclude');
  chmodSync(exclude, 0o444);
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'ignore-fail', '--id', 'fixed-id'], {cwd: root, encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    worktree = result.stderr.match(/retry: (.+)$/mu)?.[1];
    assert.ok(worktree);
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: failed/u);
  } finally {
    chmodSync(exclude, 0o644);
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(root, {recursive: true, force: true});
  }
});

test('creates from an explicit repository while preserving the process caller', () => {
  const root = fixtureRepository('task-create-repo-');
  const caller = mkdtempSync(join(tmpdir(), 'task-create-caller-'));
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'cross-repo', '--repo', root, '--summary', 'Cross repo setup'], {cwd: caller, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    const state = readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8');
    assert.match(state, new RegExp(`- original caller path: ${realpathSync(caller).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
    assert.match(state, /- base branch: main/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(caller, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('uses a guard reservation nonce in the created task state', () => {
  const root = fixtureRepository('task-create-reserved-');
  const id = 'reserved-id';
  const branch = `task/reserved-${id}`;
  const reservation = join(git(root, 'rev-parse', '--absolute-git-dir'), 'task-worktree-reservations', `reserved-${id}.nonce`);
  const baseHead = git(root, 'rev-parse', 'HEAD');
  mkdirSync(dirname(reservation), {recursive: true});
  writeFileSync(reservation, `${JSON.stringify({nonce: 'guard-nonce', baseHead, baseBranch: 'main'})}\n`);
  git(root, 'branch', branch, 'HEAD');
  writeFileSync(join(root, 'caller-advanced'), 'new caller commit\n');
  git(root, 'add', 'caller-advanced');
  git(root, 'commit', '-qm', 'advance caller');
  git(root, 'switch', '--detach', '-q');
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'reserved', '--id', id], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.equal(git(worktree, 'branch', '--show-current'), branch);
    assert.equal(git(worktree, 'rev-parse', 'HEAD'), baseHead);
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- guard nonce: guard-nonce/u);
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- base branch: main/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects a tracked task state namespace before creating a worktree', () => {
  for (const fixture of ['file', 'symlink', 'case']) {
    const root = fixtureRepository(`task-create-state-${fixture}-`);
    try {
      if (fixture === 'file') {
        mkdirSync(join(root, '.agent-tmp'));
        writeFileSync(join(root, '.agent-tmp', 'task-state.md'), 'owned\n');
        git(root, 'add', '-f', '.agent-tmp/task-state.md');
      } else if (fixture === 'symlink') {
        symlinkSync('fixture', join(root, '.agent-tmp'));
        git(root, 'add', '-f', '.agent-tmp');
      } else {
        mkdirSync(join(root, '.Agent-tmp'));
        writeFileSync(join(root, '.Agent-tmp', 'task-state.md'), 'case collision\n');
        git(root, 'add', '-f', '.Agent-tmp/task-state.md');
      }
      git(root, 'commit', '-qm', 'track task state namespace');
      const result = spawnSync(process.execPath, [script, `state-${fixture}`, '--id', 'fixed-id'], {cwd: root, encoding: 'utf8'});
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /requires \.agent-tmp to be untracked/u);
      assert.equal(git(root, 'branch', '--list', `task/state-${fixture}-fixed-id`), '');
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  }
});

test('installs only dependencies named by tracked lockfiles', () => {
  const root = fixtureRepository('task-create-lock-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-bin-'));
  const log = join(bin, 'commands.log');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'untracked\n');
  git(root, 'add', 'package.json', 'package-lock.json');
  git(root, 'commit', '-qm', 'add tracked npm package');
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\nprintf '%s|%s\\n' "$PWD" "$*" >> "$TASK_COMMAND_LOG"\n`);
  chmodSync(join(bin, 'npm'), 0o755);
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'npm'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, TASK_COMMAND_LOG: log},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.equal(readFileSync(log, 'utf8'), `${worktree}|ci --ignore-scripts\n`);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('initializes submodules and installs their tracked dependencies recursively', () => {
  const root = fixtureRepository('task-create-submodule-root-');
  const module = fixtureRepository('task-create-submodule-child-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-submodule-bin-'));
  const log = join(bin, 'commands.log');
  let worktree;
  try {
    writeFileSync(join(module, 'package.json'), '{"name":"submodule"}\n');
    writeFileSync(join(module, 'package-lock.json'), '{}\n');
    git(module, 'add', 'package.json', 'package-lock.json');
    git(module, 'commit', '-qm', 'add dependencies');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', module, 'vendor/fixture');
    git(root, 'commit', '-qm', 'add submodule');
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\nprintf '%s|%s\\n' "$PWD" "$*" >> "$TASK_COMMAND_LOG"\n`);
    chmodSync(join(bin, 'npm'), 0o755);
    const result = spawnSync(process.execPath, [script, 'submodule', '--id', 'submodule-test'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file', PATH: `${bin}:${process.env.PATH}`, TASK_COMMAND_LOG: log},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.equal(readFileSync(join(worktree, 'vendor', 'fixture', 'fixture'), 'utf8'), 'committed\n');
    assert.equal(readFileSync(log, 'utf8'), `${join(worktree, 'vendor', 'fixture')}|ci --ignore-scripts\n`);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(module, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('prepares supported tracked dependency ecosystems in deterministic roots', () => {
  const root = fixtureRepository('task-create-matrix-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-bin-'));
  const log = join(bin, 'commands.log');
  for (const directory of ['bun', 'cargo', 'dart', 'flutter', 'pnpm', 'yarn-berry', 'yarn-classic']) mkdirSync(join(root, directory));
  writeFileSync(join(root, 'bun', 'package.json'), '{"name":"bun"}\n');
  writeFileSync(join(root, 'bun', 'bun.lock'), 'lock\n');
  writeFileSync(join(root, 'cargo', 'Cargo.toml'), '[package]\nname="fixture"\nversion="0.1.0"\n');
  writeFileSync(join(root, 'cargo', 'Cargo.lock'), '# lock\n');
  writeFileSync(join(root, 'dart', 'pubspec.yaml'), 'name: dart_fixture\n');
  writeFileSync(join(root, 'dart', 'pubspec.lock'), '# lock\n');
  writeFileSync(join(root, 'flutter', 'pubspec.yaml'), 'name: flutter_fixture\ndependencies:\n  flutter:\n    sdk: flutter\n');
  writeFileSync(join(root, 'flutter', 'pubspec.lock'), '# lock\n');
  writeFileSync(join(root, 'pnpm', 'package.json'), '{"name":"pnpm"}\n');
  writeFileSync(join(root, 'pnpm', 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  writeFileSync(join(root, 'yarn-berry', 'package.json'), '{"name":"berry","packageManager":"yarn@4.1.0"}\n');
  writeFileSync(join(root, 'yarn-berry', 'yarn.lock'), '# lock\n');
  writeFileSync(join(root, 'yarn-classic', 'package.json'), '{"name":"classic"}\n');
  writeFileSync(join(root, 'yarn-classic', 'yarn.lock'), '# lock\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'add dependency matrix');
  for (const command of ['bun', 'cargo', 'dart', 'flutter', 'pnpm', 'yarn']) {
    writeFileSync(join(bin, command), '#!/bin/sh\nprintf \'%s|%s|%s\\n\' "$0" "$PWD" "$*" >> "$TASK_COMMAND_LOG"\n');
    chmodSync(join(bin, command), 0o755);
  }
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'matrix'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, TASK_COMMAND_LOG: log},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), [
      `${join(bin, 'bun')}|${join(worktree, 'bun')}|install --frozen-lockfile --ignore-scripts`,
      `${join(bin, 'cargo')}|${join(worktree, 'cargo')}|fetch --locked`,
      `${join(bin, 'dart')}|${join(worktree, 'dart')}|pub get --enforce-lockfile`,
      `${join(bin, 'flutter')}|${join(worktree, 'flutter')}|pub get --enforce-lockfile`,
      `${join(bin, 'pnpm')}|${join(worktree, 'pnpm')}|install --frozen-lockfile --ignore-scripts`,
      `${join(bin, 'yarn')}|${join(worktree, 'yarn-berry')}|install --immutable --mode=skip-build`,
      `${join(bin, 'yarn')}|${join(worktree, 'yarn-classic')}|install --frozen-lockfile --ignore-scripts`,
    ]);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects conflicting tracked JavaScript lockfiles without choosing a manager', () => {
  const root = fixtureRepository('task-create-conflict-');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  writeFileSync(join(root, 'bun.lock'), 'lock\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'add conflicting locks');
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'conflict'], {cwd: root, encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    worktree = result.stderr.match(/retry: (.+)$/mu)?.[1];
    assert.ok(worktree);
    assert.match(result.stderr, /conflicting JavaScript lockfiles/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(root, {recursive: true, force: true});
  }
});

test('retains and records a worktree when dependency setup fails', () => {
  const root = fixtureRepository('task-create-fail-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-bin-'));
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  git(root, 'add', 'package.json', 'package-lock.json');
  git(root, 'commit', '-qm', 'add npm package');
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 7\n');
  chmodSync(join(bin, 'npm'), 0o755);
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'failure'], {cwd: root, encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}});
    assert.notEqual(result.status, 0);
    worktree = result.stderr.match(/retry: (.+)$/mu)?.[1];
    assert.ok(worktree);
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: failed/u);
    assert.match(result.stderr, /npm ci --ignore-scripts failed/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects detached HEAD before creating a task branch', () => {
  const root = fixtureRepository('task-create-detached-');
  try {
    git(root, 'switch', '--detach', '-q');
    const result = spawnSync(process.execPath, [script, 'detached'], {cwd: root, encoding: 'utf8'});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /attached base branch/u);
    assert.equal(git(root, 'branch', '--list', 'task/*'), '');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
