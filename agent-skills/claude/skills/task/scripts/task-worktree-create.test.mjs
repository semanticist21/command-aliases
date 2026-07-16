import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
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

// Captures one asynchronous creator process result.
function runCreator(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({status, stdout, stderr}));
  });
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

test('fingerprints ignored dependency listings larger than the default child-process buffer', () => {
  const root = fixtureRepository('task-create-large-ignore-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-large-ignore-bin-'));
  writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nignored/\n');
  writeFileSync(join(root, 'package.json'), '{"name":"large-ignore"}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
import {mkdirSync, writeFileSync} from 'node:fs';
mkdirSync('ignored');
for (let index = 0; index < 4300; index += 1) {
  writeFileSync(\`ignored/\${String(index).padStart(5, '0')}-\${'x'.repeat(235)}\`, 'ignored\\n');
}
`);
  chmodSync(join(bin, 'npm'), 0o755);
  git(root, 'add', '.gitignore', 'package.json', 'package-lock.json');
  git(root, 'commit', '-qm', 'ignore dependency artifacts');
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'large-ignore', '--id', 'fixed-id'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    const listing = spawnSync('git', ['-C', worktree, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z'], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
    assert.equal(listing.status, 0, listing.stderr);
    assert.ok(Buffer.byteLength(listing.stdout) > 1024 * 1024);
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: complete/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('fingerprints ignored symlinks to dependency directories without dereferencing them', () => {
  const root = fixtureRepository('task-create-ignore-symlink-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-ignore-symlink-bin-'));
  const target = mkdtempSync(join(tmpdir(), 'task-create-ignore-symlink-target-'));
  writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nignored-link\n');
  writeFileSync(join(root, 'package.json'), '{"name":"ignore-symlink"}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  writeFileSync(join(target, 'dependency'), 'external\n');
  writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
import {symlinkSync} from 'node:fs';
symlinkSync(process.env.TASK_SYMLINK_TARGET, 'ignored-link', 'dir');
`);
  chmodSync(join(bin, 'npm'), 0o755);
  git(root, 'add', '.gitignore', 'package.json', 'package-lock.json');
  git(root, 'commit', '-qm', 'add ignored dependency symlink');
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'ignore-symlink', '--id', 'fixed-id'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, TASK_SYMLINK_TARGET: target},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: complete/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(target, {recursive: true, force: true});
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

test('runs an explicitly configured preparation command after dependency installation', () => {
  const root = fixtureRepository('task-create-gen-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-gen-bin-'));
  const log = join(bin, 'commands.log');
  writeFileSync(join(root, '.gitignore'), '.agent-tmp/\ngenerated.txt\n');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  mkdirSync(join(root, '.agents'));
  writeFileSync(join(root, '.agents', 'task-worktree.json'), '{"prepare":{"command":"make","args":["gen"]}}\n');
  writeFileSync(join(root, 'Makefile'), 'gen:\n\t@echo generated\n');
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'Makefile'), 'gen:\n\t@echo nested\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'add generated dependency fixture');
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nprintf \'npm|%s|%s\\n\' "$PWD" "$*" >> "$TASK_COMMAND_LOG"\n');
  writeFileSync(join(bin, 'make'), '#!/bin/sh\nprintf \'make|%s|%s\\n\' "$PWD" "$*" >> "$TASK_COMMAND_LOG"\nprintf \'generated\\n\' > generated.txt\n');
  chmodSync(join(bin, 'npm'), 0o755);
  chmodSync(join(bin, 'make'), 0o755);
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'gen', '--id', 'fixed-id'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, TASK_COMMAND_LOG: log},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.equal(readFileSync(log, 'utf8'), `npm|${worktree}|ci --ignore-scripts\nmake|${worktree}|gen\n`);
    assert.equal(readFileSync(join(worktree, 'generated.txt'), 'utf8'), 'generated\n');
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: complete/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not infer preparation from Makefile targets or an untracked config', () => {
  const root = fixtureRepository('task-create-no-prepare-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-no-prepare-bin-'));
  const marker = join(bin, 'make-ran');
  writeFileSync(join(root, 'Makefile'), 'gen:\n\t@echo generated\n');
  git(root, 'add', 'Makefile');
  git(root, 'commit', '-qm', 'add unconfigured generator');
  mkdirSync(join(root, '.agents'));
  writeFileSync(join(root, '.agents', 'task-worktree.json'), '{"prepare":{"command":"make","args":["gen"]}}\n');
  writeFileSync(join(bin, 'make'), '#!/bin/sh\nprintf \'ran\\n\' > "$TASK_MAKE_MARKER"\n');
  chmodSync(join(bin, 'make'), 0o755);
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'no-prepare', '--id', 'fixed-id'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, TASK_MAKE_MARKER: marker},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.equal(git(worktree, 'status', '--porcelain=v1'), '');
    assert.equal(existsSync(marker), false);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects malformed tracked preparation configs', () => {
  const fixtures = [
    ['invalid-json', '{'],
    ['root-key', '{"prepare":{"command":"make","args":["gen"]},"extra":true}'],
    ['empty-command', '{"prepare":{"command":"","args":[]}}'],
    ['invalid-args', '{"prepare":{"command":"make","args":"gen"}}'],
    ['prepare-key', '{"prepare":{"command":"make","args":["gen"],"extra":true}}'],
  ];
  for (const [name, config] of fixtures) {
    const root = fixtureRepository(`task-create-malformed-${name}-`);
    let worktree;
    try {
      mkdirSync(join(root, '.agents'));
      writeFileSync(join(root, '.agents', 'task-worktree.json'), `${config}\n`);
      git(root, 'add', '.agents/task-worktree.json');
      git(root, 'commit', '-qm', 'add malformed preparation config');
      const result = spawnSync(process.execPath, [script, `malformed-${name}`, '--id', 'fixed-id'], {cwd: root, encoding: 'utf8'});
      assert.notEqual(result.status, 0);
      worktree = result.stderr.match(/retry: (.+)$/mu)?.[1];
      assert.ok(worktree);
      assert.match(result.stderr, /\.agents\/task-worktree\.json must/u);
      assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: failed/u);
    } finally {
      if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
      rmSync(root, {recursive: true, force: true});
    }
  }
});

test('rejects preparation commands that create tracked or unignored changes', () => {
  const root = fixtureRepository('task-create-dirty-prepare-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-dirty-prepare-bin-'));
  mkdirSync(join(root, '.agents'));
  writeFileSync(join(root, '.agents', 'task-worktree.json'), '{"prepare":{"command":"prepare-fixture","args":[]}}\n');
  git(root, 'add', '.agents/task-worktree.json');
  git(root, 'commit', '-qm', 'configure dirty preparation');
  writeFileSync(join(bin, 'prepare-fixture'), '#!/bin/sh\nprintf \'changed\\n\' > fixture\nprintf \'new\\n\' > generated-unignored\n');
  chmodSync(join(bin, 'prepare-fixture'), 0o755);
  let worktree;
  try {
    const result = spawnSync(process.execPath, [script, 'dirty-prepare', '--id', 'fixed-id'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.notEqual(result.status, 0);
    worktree = result.stderr.match(/retry: (.+)$/mu)?.[1];
    assert.ok(worktree);
    assert.match(result.stderr, /Preparation created tracked or unignored changes/u);
    assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: failed/u);
    assert.match(git(worktree, 'status', '--porcelain=v1'), /^M fixture$/mu);
    assert.match(git(worktree, 'status', '--porcelain=v1'), /\?\? generated-unignored/u);
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects preparation commands that commit or detach repository state', () => {
  const fixtures = [
    ['commit', 'printf \'committed\\n\' > committed-by-prepare\ngit add committed-by-prepare\ngit commit -qm \'prepare commit\'\n'],
    ['detach', 'git switch --detach -q HEAD\n'],
  ];
  for (const [name, body] of fixtures) {
    const root = fixtureRepository(`task-create-identity-${name}-`);
    const bin = mkdtempSync(join(tmpdir(), `task-create-identity-${name}-bin-`));
    let worktree;
    try {
      mkdirSync(join(root, '.agents'));
      writeFileSync(join(root, '.agents', 'task-worktree.json'), `{"prepare":{"command":"prepare-${name}","args":[]}}\n`);
      git(root, 'add', '.agents/task-worktree.json');
      git(root, 'commit', '-qm', 'configure identity-changing preparation');
      writeFileSync(join(bin, `prepare-${name}`), `#!/bin/sh\n${body}`);
      chmodSync(join(bin, `prepare-${name}`), 0o755);
      const result = spawnSync(process.execPath, [script, `identity-${name}`, '--id', 'fixed-id'], {
        cwd: root,
        encoding: 'utf8',
        env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
      });
      assert.notEqual(result.status, 0);
      worktree = result.stderr.match(/retry: (.+)$/mu)?.[1];
      assert.ok(worktree);
      assert.match(result.stderr, /Preparation changed repository HEAD or branch/u);
      assert.match(readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8'), /- setup: failed/u);
    } finally {
      if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
      rmSync(bin, {recursive: true, force: true});
      rmSync(root, {recursive: true, force: true});
    }
  }
});

test('initializes submodules and runs their tracked dependency and preparation commands', () => {
  const root = fixtureRepository('task-create-submodule-root-');
  const module = fixtureRepository('task-create-submodule-child-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-submodule-bin-'));
  const log = join(bin, 'commands.log');
  let worktree;
  try {
    writeFileSync(join(module, 'package.json'), '{"name":"submodule"}\n');
    writeFileSync(join(module, 'package-lock.json'), '{}\n');
    writeFileSync(join(module, '.gitignore'), 'generated.proto\n');
    mkdirSync(join(module, '.agents'));
    writeFileSync(join(module, '.agents', 'task-worktree.json'), '{"prepare":{"command":"prepare-submodule","args":["proto"]}}\n');
    git(module, 'add', 'package.json', 'package-lock.json', '.gitignore', '.agents/task-worktree.json');
    git(module, 'commit', '-qm', 'add dependencies');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', module, 'vendor/fixture');
    git(root, 'commit', '-qm', 'add submodule');
    writeFileSync(join(bin, 'npm'), `#!/bin/sh\nprintf '%s|%s\\n' "$PWD" "$*" >> "$TASK_COMMAND_LOG"\n`);
    writeFileSync(join(bin, 'prepare-submodule'), `#!/bin/sh\nprintf 'prepare|%s|%s\\n' "$PWD" "$*" >> "$TASK_COMMAND_LOG"\nprintf 'generated\\n' > generated.proto\n`);
    chmodSync(join(bin, 'npm'), 0o755);
    chmodSync(join(bin, 'prepare-submodule'), 0o755);
    const result = spawnSync(process.execPath, [script, 'submodule', '--id', 'submodule-test'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file', PATH: `${bin}:${process.env.PATH}`, TASK_COMMAND_LOG: log},
    });
    assert.equal(result.status, 0, result.stderr);
    worktree = outputValue(result.stdout, 'worktree');
    assert.equal(readFileSync(join(worktree, 'vendor', 'fixture', 'fixture'), 'utf8'), 'committed\n');
    assert.equal(readFileSync(join(worktree, 'vendor', 'fixture', 'generated.proto'), 'utf8'), 'generated\n');
    assert.equal(readFileSync(log, 'utf8'), `${join(worktree, 'vendor', 'fixture')}|ci --ignore-scripts\nprepare|${join(worktree, 'vendor', 'fixture')}|proto\n`);
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

test('retains and atomically resumes an owned worktree when dependency setup fails', async () => {
  const root = fixtureRepository('task-create-fail-');
  const bin = mkdtempSync(join(tmpdir(), 'task-create-bin-'));
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(join(root, 'package-lock.json'), '{}\n');
  git(root, 'add', 'package.json', 'package-lock.json');
  git(root, 'commit', '-qm', 'add npm package');
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 7\n');
  chmodSync(join(bin, 'npm'), 0o755);
  const args = [script, 'failure', '--id', 'fixed-id', '--summary', 'Retry failed setup'];
  const env = {...process.env, PATH: `${bin}:${process.env.PATH}`, CODEX_SESSION_ID: 'resume-owner'};
  let worktree;
  try {
    const result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8', env});
    assert.notEqual(result.status, 0);
    worktree = result.stderr.match(/retry: (.+)$/mu)?.[1];
    assert.ok(worktree);
    const failedState = readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8');
    assert.match(failedState, /- setup: failed/u);
    assert.match(result.stderr, /npm ci --ignore-scripts failed/u);
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 0\n');
    writeFileSync(join(worktree, 'foreign-untracked'), 'not setup-owned\n');
    const dirtyRetry = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8', env});
    assert.notEqual(dirtyRetry.status, 0);
    assert.match(dirtyRetry.stderr, /not the same clean failed setup/u);
    rmSync(join(worktree, 'foreign-untracked'));
    const statePath = join(worktree, '.agent-tmp', 'task-state.md');
    writeFileSync(statePath, readFileSync(statePath, 'utf8').replace('- setup: failed', '- setup: in-progress'));
    writeFileSync(join(worktree, '.agent-tmp', 'setup-resume.lock'), `${JSON.stringify({pid: 2147483647, identity: null, token: 'stale-owner', created: '2026-01-01T00:00:00.000Z'})}\n`);
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nsleep 1\nexit 0\n');
    const retries = await Promise.all([
      runCreator(args, {cwd: root, env}),
      runCreator(args, {cwd: root, env}),
    ]);
    const [retry] = retries.filter((candidate) => candidate.status === 0);
    const [contended] = retries.filter((candidate) => candidate.status !== 0);
    assert.ok(retry, JSON.stringify(retries));
    assert.ok(contended, JSON.stringify(retries));
    assert.match(contended.stderr, /already being resumed/u);
    assert.equal(outputValue(retry.stdout, 'worktree'), worktree);
    const completedState = readFileSync(join(worktree, '.agent-tmp', 'task-state.md'), 'utf8');
    assert.match(completedState, /- setup: complete/u);
    assert.equal(completedState.match(/^- created time: .+$/mu)?.[0], failedState.match(/^- created time: .+$/mu)?.[0]);
    assert.equal(completedState.match(/^- owner: .+$/mu)?.[0], failedState.match(/^- owner: .+$/mu)?.[0]);
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
