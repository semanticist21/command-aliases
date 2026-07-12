import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./task-worktree-guard.mjs', import.meta.url));
const runtime = script.includes('/codex/') ? 'codex' : 'claude';
const stateDirectory = mkdtempSync(join(tmpdir(), 'task-worktree-guard-state-'));

// Runs one hook event against the guard script.
function runHook(payload) {
  const result = spawnSync(process.execPath, [script], {input: JSON.stringify(payload), encoding: 'utf8', env: {...process.env, TASK_WORKTREE_GUARD_STATE_DIR: stateDirectory}});
  assert.equal(result.status, 0, result.stderr);
  return result;
}

// Runs a Git command inside a fixture repository.
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
}

// Binds an already-created fixture worktree through the guarded add lifecycle.
function bindTaskWorktree(root, worktree, sessionId) {
  const branch = spawnSync('git', ['-C', worktree, 'branch', '--show-current'], {encoding: 'utf8'}).stdout.trim();
  const command = `git worktree add -b ${branch} ${worktree} HEAD`;
  assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
  runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
}

// Runs the exact recorded-local-base merge through both guard hook phases.
function runBaseMerge(root, worktree, sessionId) {
  const stateFile = join(stateDirectory, `${sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
  if (!JSON.parse(readFileSync(stateFile, 'utf8')).taskRoot) bindTaskWorktree(root, worktree, sessionId);
  const baseBranch = spawnSync('git', ['-C', root, 'branch', '--show-current'], {encoding: 'utf8'}).stdout.trim();
  const command = `git merge --no-edit ${baseBranch}`;
  assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}}).stdout, '');
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).pendingBaseMerge?.command, command);
  assert.equal(spawnSync('sh', ['-c', command], {cwd: worktree}).status, 0);
  runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
}

test('blocks task apply_patch in the caller checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  try {
    git(root, 'init', '-q');
    const sessionId = `block-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: '*** Begin Patch'}});
    const response = JSON.parse(result.stdout);
    assert.equal(response.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(response.hookSpecificOutput.permissionDecisionReason, /TASK WORKTREE REQUIRED/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('releases expired session state before enforcing a write', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-expired-'));
  const sessionId = `expired-${Date.now()}`;
  const stateFile = join(stateDirectory, `${sessionId}.json`);
  try {
    git(root, 'init', '-q');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    writeFileSync(stateFile, JSON.stringify({...state, activatedAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z'}));
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
    assert.throws(() => readFileSync(stateFile, 'utf8'), {code: 'ENOENT'});
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('releases state when its bound task worktree no longer exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-missing-worktree-'));
  const worktree = `${root}-worktree`;
  const sessionId = `missing-${Date.now()}`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/missing', worktree, 'HEAD');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    git(root, 'worktree', 'remove', worktree);
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('accepts plain task-cancel as an explicit guard release', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-cancel-'));
  const sessionId = `cancel-${Date.now()}`;
  try {
    git(root, 'init', '-q');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'task-cancel'});
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not cancel from a prose mention of task-cancel', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-cancel-prose-'));
  const sessionId = `cancel-prose-${Date.now()}`;
  try {
    git(root, 'init', '-q');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'document task-cancel behavior'});
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: 'patch'}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not persist guard state when the runtime omits session identity', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-no-session-'));
  try {
    git(root, 'init', '-q');
    runHook({hook_event_name: 'UserPromptSubmit', cwd: root, prompt: '$task change code'});
    assert.equal(runHook({hook_event_name: 'PreToolUse', cwd: root, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('keeps the guard active when the bound worktree changes branch', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-branch-change-'));
  const worktree = `${root}-worktree`;
  const sessionId = `branch-change-${Date.now()}`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/branch-change', worktree, 'HEAD');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    git(worktree, 'switch', '-c', 'other/branch');
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'apply_patch', tool_input: {command: 'patch'}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('allows concurrent sessions to bind separate task worktrees from one caller', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-concurrent-'));
  const worktrees = [`${root}-one`, `${root}-two`];
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    for (const [offset, worktree] of worktrees.entries()) {
      git(root, 'worktree', 'add', '-qb', `task/concurrent-${offset}`, worktree, 'HEAD');
      const sessionId = `concurrent-${offset}-${Date.now()}`;
      runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
      bindTaskWorktree(root, worktree, sessionId);
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
    }
  } finally {
    for (const worktree of worktrees) rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('allows chained read-only bootstrap inspection before worktree creation', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  try {
    git(root, 'init', '-q');
    const sessionId = `bootstrap-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task inspect repo'});
    const command = "git rev-parse --show-toplevel && git branch --show-current && git status --short && git status --porcelain=v1 -b && git worktree list && git branch --list 'task/*'";
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    const unsafe = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'git status --short && rm file'}});
    assert.equal(JSON.parse(unsafe.stdout).hookSpecificOutput.permissionDecision, 'deny');
    for (const command of ['git status --$(touch${IFS}/tmp/task-pwn)', 'git worktree add -b task/pwn "$(touch${IFS}/tmp/task-pwn)" HEAD', 'git worktree add --detach ../other HEAD', 'git worktree add -b task/one ../one HEAD && git worktree add -b task/two ../two HEAD']) {
      const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('allows writes in a task branch worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    mkdirSync(join(root, 'fixture'));
    spawnSync('sh', ['-c', 'echo fixture > fixture/file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture', worktree, 'HEAD');
    const sessionId = `allow-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '/task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: '*** Begin Patch', workdir: worktree}});
    assert.equal(result.stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('honors Codex exec cmd and top-level workdir fields', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture-exec', worktree, 'HEAD');
    const sessionId = `exec-${root}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: 'npm test'}});
    assert.equal(result.stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('executes verified merge-back and forced cleanup in exact order', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'Makefile'), 'test lint typecheck build:\n\t@true\n');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture-finalize', worktree, 'HEAD');
    const canonicalWorktree = spawnSync('git', ['-C', worktree, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'}).stdout.trim();
    spawnSync('sh', ['-c', 'echo task >> file'], {cwd: worktree});
    const sessionId = `finalize-${root}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const premature = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'git merge --squash task/fixture-finalize'}});
    assert.equal(JSON.parse(premature.stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.match(JSON.parse(premature.stdout).hookSpecificOutput.permissionDecisionReason, /task-verify\.mjs/u);
    runBaseMerge(root, worktree, sessionId);
    const baseStateFile = join(stateDirectory, `${sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    assert.ok(JSON.parse(readFileSync(baseStateFile, 'utf8')).baseMergedTip);
    const verification = 'make test lint typecheck build';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: verification}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', verification], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: verification}});
    for (const command of ['git add file', 'git commit -m "task change"', 'git status --short']) {
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}}).stdout, '', command);
      assert.equal(spawnSync('sh', ['-c', command], {cwd: worktree}).status, 0, command);
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
    }
    const commands = [
      ['git merge --squash task/fixture-finalize', root],
      ['git commit -m "merge task"', root],
      [`git worktree remove "${canonicalWorktree}"`, root],
      ['git branch -D task/fixture-finalize', root],
    ];
    for (const [command, directory] of commands) {
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '', command);
      assert.equal(spawnSync('sh', ['-c', command], {cwd: directory}).status, 0);
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    }
    assert.equal(spawnSync('git', ['-C', root, 'branch', '--list', 'task/fixture-finalize'], {encoding: 'utf8'}).stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects commit-hook content changes until gates and commit rerun', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'Makefile'), 'test lint typecheck build:\n\t@true\n');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture-hook', worktree, 'HEAD');
    spawnSync('sh', ['-c', 'echo task >> file'], {cwd: worktree});
    const sessionId = `hook-${root}`;
    const verification = 'make test lint typecheck build';
    const merge = 'git merge --squash task/fixture-hook';
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    runBaseMerge(root, worktree, sessionId);
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}});
    assert.equal(spawnSync('sh', ['-c', verification], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}});
    for (const command of ['git add file', 'git commit -m "task change"']) {
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}}).stdout, '');
      assert.equal(spawnSync('sh', ['-c', command], {cwd: worktree}).status, 0);
      if (command.startsWith('git commit')) {
        spawnSync('sh', ['-c', 'echo hook >> file'], {cwd: worktree});
        git(worktree, 'add', 'file');
      }
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
    }
    let result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: merge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}});
    assert.equal(spawnSync('sh', ['-c', verification], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}});
    const recoveryAdd = 'git add file';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: recoveryAdd}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', recoveryAdd], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: recoveryAdd}});
    const recoveryCommit = 'git commit -m "hook change"';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: recoveryCommit}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', recoveryCommit], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: recoveryCommit}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: merge}});
    assert.equal(result.stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects a directly committed stale index after verifying newer workspace content', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'Makefile'), 'test lint typecheck build:\n\t@true\n');
    writeFileSync(join(root, 'file'), 'original\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/stale-index', worktree, 'HEAD');
    writeFileSync(join(worktree, 'file'), 'staged A\n');
    git(worktree, 'add', 'file');
    writeFileSync(join(worktree, 'file'), 'working B\n');
    const sessionId = `stale-index-${root}`;
    const verification = 'make test lint typecheck build';
    const commit = 'git commit -m "stale A"';
    const merge = 'git merge --squash task/stale-index';
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    runBaseMerge(root, worktree, sessionId);
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}});
    assert.equal(spawnSync('sh', ['-c', verification], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}});
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: commit}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', commit], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: commit}});
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: merge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('supports clean submodules and sparse checkout paths through task commit binding', () => {
  for (const fixture of ['submodule', 'sparse']) {
    const root = mkdtempSync(join(tmpdir(), `task-guard-${fixture}-`));
    const worktree = `${root}-worktree`;
    const dependency = `${root}-dependency`;
    try {
      git(root, 'init', '-q');
      git(root, 'config', 'user.email', 'guard@example.test');
      git(root, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(root, 'Makefile'), 'test lint typecheck build:\n\t@true\n');
      mkdirSync(join(root, 'visible'));
      writeFileSync(join(root, 'visible', 'file'), 'original\n');
      if (fixture === 'submodule') {
        mkdirSync(dependency);
        git(dependency, 'init', '-q');
        git(dependency, 'config', 'user.email', 'guard@example.test');
        git(dependency, 'config', 'user.name', 'Guard Test');
        writeFileSync(join(dependency, 'dependency'), 'content\n');
        git(dependency, 'add', '.');
        git(dependency, 'commit', '-qm', 'dependency');
        const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
        assert.equal(added.status, 0, added.stderr);
      } else {
        mkdirSync(join(root, 'hidden'));
        writeFileSync(join(root, 'hidden', 'file'), 'hidden\n');
      }
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'fixture');
      git(root, 'worktree', 'add', '-qb', `task/${fixture}`, worktree, 'HEAD');
      if (fixture === 'submodule') {
        const updated = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', worktree, 'submodule', 'update', '--init', '-q'], {encoding: 'utf8'});
        assert.equal(updated.status, 0, updated.stderr);
      } else {
        git(worktree, 'sparse-checkout', 'set', 'visible');
      }
      writeFileSync(join(worktree, 'visible', 'file'), 'changed\n');
      const sessionId = `${fixture}-${root}`;
      const verification = 'make test lint typecheck build';
      const add = 'git add visible/file';
      const commit = `git commit -m "${fixture} change"`;
      const merge = `git merge --squash task/${fixture}`;
      runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
      runBaseMerge(root, worktree, sessionId);
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: verification}, tool_response: {exit_code: 0}});
      for (const command of [add, commit]) {
        assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}}).stdout, '', `${fixture}: ${command}`);
        assert.equal(spawnSync('sh', ['-c', command], {cwd: worktree}).status, 0, `${fixture}: ${command}`);
        runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
      }
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: merge}}).stdout, '', fixture);
    } finally {
      rmSync(worktree, {recursive: true, force: true});
      rmSync(dependency, {recursive: true, force: true});
      rmSync(root, {recursive: true, force: true});
    }
  }
});

test('rejects incomplete verification and off-scope finalization commands', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  const unrelated = `${root}-unrelated`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture-negative', worktree, 'HEAD');
    git(root, 'worktree', 'add', '-qb', 'other/unrelated', unrelated, 'HEAD');
    const canonicalUnrelated = spawnSync('git', ['-C', unrelated, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'}).stdout.trim();
    const sessionId = `negative-${root}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    runBaseMerge(root, worktree, sessionId);
    const partial = 'npm test';
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}, tool_response: {exit_code: 1}});
    const exactMerge = 'git merge --squash task/fixture-negative';
    let result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    const remaining = 'make lint typecheck build';
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: remaining}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: remaining}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}, tool_response: {exit_code: 0}});
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}, tool_response: {exit_code: 1}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}, tool_response: {exit_code: 0}});
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}});
    runHook({hook_event_name: 'PostToolUseFailure', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: partial}, tool_response: {exit_code: 0}});
    const operatorGates = 'make test && make lint && make typecheck && make build';
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: operatorGates}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: operatorGates}, tool_response: {exit_code: 0}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    const allGates = 'make test lint typecheck build';
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}, tool_response: {exit_code: 0}});
    const fakeGates = 'make fake-test lint typecheck build';
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: fakeGates}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: fakeGates}, tool_response: {exit_code: 0}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}, tool_response: {exit_code: 0}});
    const fakeVerify = 'make verify-anything';
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: fakeVerify}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: fakeVerify}, tool_response: {exit_code: 0}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}, tool_response: {exit_code: 0}});
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {workdir: worktree, command: '*** Begin Patch'}});
    writeFileSync(join(worktree, 'edited-after-verify'), 'changed');
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}});
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: allGates}, tool_response: {exit_code: 0}});
    const taskAdd = 'git add edited-after-verify';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: taskAdd}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', taskAdd], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: taskAdd}});
    const taskCommit = 'git commit -m task';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: taskCommit}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', taskCommit], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: taskCommit}});
    const baseBranch = spawnSync('git', ['-C', root, 'branch', '--show-current'], {encoding: 'utf8'}).stdout.trim();
    git(root, 'checkout', '-qb', 'other/base');
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    git(root, 'checkout', '-q', baseBranch);
    for (const command of ['git merge --squash deadbeef', 'git merge --no-ff task/fixture-negative']) {
      const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}}).stdout, '');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    for (const command of ['git commit --amend -m bad', 'git commit -am bad', 'git commit file']) {
      result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
    const exactCommit = 'git commit -m valid';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactCommit}}).stdout, '');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactCommit}});
    for (const command of [`git worktree remove "${canonicalUnrelated}"`, 'git branch -D task/fixture-negative']) {
      result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
  } finally {
    rmSync(unrelated, {recursive: true, force: true});
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('binds one session to its first task worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const first = `${root}-first`;
  const second = `${root}-second`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/first', first, 'HEAD');
    git(root, 'worktree', 'add', '-qb', 'task/second', second, 'HEAD');
    const sessionId = `binding-${root}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const unowned = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: first, tool_name: 'Bash', tool_input: {cmd: 'npm test'}});
    assert.match(JSON.parse(unowned.stdout).hookSpecificOutput.permissionDecisionReason, /WORKTREE REQUIRED/);
    bindTaskWorktree(root, first, sessionId);
    const rebind = `git worktree add -b task/second ${second} HEAD`;
    assert.match(JSON.parse(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: rebind}}).stdout).hookSpecificOutput.permissionDecisionReason, /WORKTREE MISMATCH/);
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: first, tool_name: 'Bash', tool_input: {cmd: 'npm test'}}).stdout, '');
    for (const payload of [
      {tool_name: 'apply_patch', tool_input: {workdir: second, command: '*** Begin Patch'}},
      {tool_name: 'Bash', tool_input: {workdir: second, cmd: 'npm test'}},
    ]) {
      const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, ...payload});
      assert.match(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, /WORKTREE MISMATCH/);
    }
  } finally {
    rmSync(second, {recursive: true, force: true});
    rmSync(first, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not bind an unrelated repository task worktree before its worktree add', () => {
  const caller = mkdtempSync(join(tmpdir(), 'task-guard-caller-'));
  const target = mkdtempSync(join(tmpdir(), 'task-guard-target-'));
  const unrelated = `${target}-unrelated`;
  const owned = `${target}-owned`;
  try {
    for (const root of [caller, target]) {
      git(root, 'init', '-q');
      git(root, 'config', 'user.email', 'guard@example.test');
      git(root, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(root, 'file'), 'fixture\n');
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'fixture');
    }
    git(target, 'worktree', 'add', '-qb', 'task/unrelated', unrelated, 'HEAD');
    const sessionId = `cross-repo-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: caller, prompt: '$task update another repo'});
    const denied = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: caller, workdir: unrelated, tool_name: 'Bash', tool_input: {command: 'npm test'}});
    assert.match(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecisionReason, /WORKTREE REQUIRED/);

    const add = `git -C ${target} worktree add -b task/owned ../${owned.slice(owned.lastIndexOf('/') + 1)} HEAD`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: caller, tool_name: 'Bash', tool_input: {command: add}}).stdout, '');
    git(target, 'worktree', 'add', '-qb', 'task/owned', owned, 'HEAD');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: caller, tool_name: 'Bash', tool_input: {command: add}, tool_response: {exit_code: 0}});
    const stateFile = join(stateDirectory, `${sessionId}.json`);
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.equal(state.callerRoot, spawnSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'}).stdout.trim());
    assert.equal(state.callerBranch, spawnSync('git', ['-C', target, 'branch', '--show-current'], {encoding: 'utf8'}).stdout.trim());
    assert.equal(state.originalCallerRoot, spawnSync('git', ['-C', caller, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'}).stdout.trim());
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: caller, workdir: owned, tool_name: 'Bash', tool_input: {command: 'npm test'}}).stdout, '');
  } finally {
    rmSync(owned, {recursive: true, force: true});
    rmSync(unrelated, {recursive: true, force: true});
    rmSync(target, {recursive: true, force: true});
    rmSync(caller, {recursive: true, force: true});
  }
});

test('recognizes safe option-bearing verification commands exactly', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/options', worktree, 'HEAD');
    const sessionId = `options-${root}`;
    const baseBranch = spawnSync('git', ['-C', root, 'branch', '--show-current'], {encoding: 'utf8'}).stdout.trim();
    const stateFile = join(stateDirectory, `${sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    for (const [command, gate] of [
      [`cd "${worktree}" && node ~/.${runtime}/skills/task/scripts/task-verify.mjs --base ${baseBranch}`, 'test'],
      ['npm test -- --runInBand', 'test'],
      ['pytest tests/', 'test'],
      ['cargo test --workspace', 'test'],
      ['cargo clippy --all-targets', 'lint'],
      ['tsc --noEmit', 'typecheck'],
      ['make -C fixture build', 'build'],
    ]) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: command}, tool_response: {exit_code: 0}});
      assert.ok(JSON.parse(readFileSync(stateFile, 'utf8')).verified.includes(gate), command);
    }
    for (const command of [
      'cargo test --no-run',
      'pytest --collect-only',
      'npm test -- --help',
      'cargo clippy --help',
      'cargo check -h',
      'cargo build --help',
      'tsc --showConfig',
      'node ./task-verify.mjs --base main',
      `node ~/.${runtime}/skills/task/scripts/task-verify.mjs`,
      `node ~/.${runtime}/skills/task/scripts/task-verify.mjs --base HEAD^`,
    ]) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: command}, tool_response: {exit_code: 0}});
      assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).verified ?? [], [], command);
    }
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('recognizes exact Bun verification commands and rejects lookalikes', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-bun-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/bun', worktree, 'HEAD');
    const sessionId = `bun-${root}`;
    const stateFile = join(stateDirectory, `${sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    for (const [command, gate] of [
      ['bun run --cwd demo lint', 'lint'],
      ['bun run --cwd demo typecheck', 'typecheck'],
      ['bun run --cwd demo build', 'build'],
      ['bun run --cwd demo test', 'test'],
    ]) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
      assert.ok(JSON.parse(readFileSync(stateFile, 'utf8')).verified.includes(gate), command);
    }
    for (const command of [
      'bun test --help',
      'bun test --no-run',
      'bun run --cwd demo lint && echo fake',
      'bun run --cwd demo lint:fake',
      'bun run --cwd demo test:unit',
      'bun run --cwd demo dev',
      'bun run --cwd demo test --run',
      'bun test',
      'bun test demo/src/App.test.tsx',
      'bun test --test-name-pattern=focused',
    ]) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
      assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).verified ?? [], [], command);
    }
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('binds an existing clean task HEAD after all gates without a new commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-clean-head-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/existing-clean', worktree, 'HEAD');
    writeFileSync(join(worktree, 'file'), 'already committed task content\n');
    git(worktree, 'add', 'file');
    git(worktree, 'commit', '-qm', 'existing task commit');
    const canonicalWorktree = spawnSync('git', ['-C', worktree, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'}).stdout.trim();
    const sessionId = `clean-head-${root}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task finish existing work'});
    runBaseMerge(root, worktree, sessionId);
    for (const command of ['bun run --cwd demo test', 'bun run --cwd demo lint', 'bun run --cwd demo typecheck', 'bun run --cwd demo build']) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
    }
    for (const command of [
      'git merge --squash task/existing-clean',
      'git commit -m "merge existing task"',
      `git worktree remove "${canonicalWorktree}"`,
      'git branch -D task/existing-clean',
    ]) {
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '', command);
      assert.equal(spawnSync('sh', ['-c', command], {cwd: root}).status, 0, command);
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
    }
    assert.equal(spawnSync('git', ['-C', root, 'branch', '--list', 'task/existing-clean'], {encoding: 'utf8'}).stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not bind dirty or changed task content as an existing clean HEAD', () => {
  for (const mutation of ['dirty-worktree', 'dirty-index', 'head-after-gates']) {
    const root = mkdtempSync(join(tmpdir(), `task-guard-${mutation}-`));
    const worktree = `${root}-worktree`;
    try {
      git(root, 'init', '-q');
      git(root, 'config', 'user.email', 'guard@example.test');
      git(root, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(root, 'file'), 'fixture\n');
      git(root, 'add', '.');
      git(root, 'commit', '-qm', 'fixture');
      git(root, 'worktree', 'add', '-qb', `task/${mutation}`, worktree, 'HEAD');
      writeFileSync(join(worktree, 'file'), 'committed task content\n');
      git(worktree, 'add', 'file');
      git(worktree, 'commit', '-qm', 'existing task commit');
      if (mutation === 'dirty-worktree') writeFileSync(join(worktree, 'file'), 'unstaged content\n');
      if (mutation === 'dirty-index') {
        writeFileSync(join(worktree, 'file'), 'staged content\n');
        git(worktree, 'add', 'file');
      }
      const sessionId = `${mutation}-${root}`;
      runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task finish existing work'});
      for (const command of ['make test', 'make lint', 'make typecheck', 'make build']) {
        runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
        runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
      }
      if (mutation === 'head-after-gates') {
        writeFileSync(join(worktree, 'other'), 'new HEAD\n');
        git(worktree, 'add', 'other');
        git(worktree, 'commit', '-qm', 'change head after gates');
      }
      const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: `git merge --squash task/${mutation}`}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny', mutation);
    } finally {
      rmSync(worktree, {recursive: true, force: true});
      rmSync(root, {recursive: true, force: true});
    }
  }
});

test('invalidates verification for the recorded base merge and binds the merged HEAD', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-base-merge-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    const baseBranch = spawnSync('git', ['-C', root, 'branch', '--show-current'], {encoding: 'utf8'}).stdout.trim();
    git(root, 'worktree', 'add', '-qb', 'task/base-refresh', worktree, 'HEAD');
    writeFileSync(join(worktree, 'task-file'), 'task\n');
    git(worktree, 'add', 'task-file');
    git(worktree, 'commit', '-qm', 'task change');
    writeFileSync(join(root, 'base-file'), 'base\n');
    git(root, 'add', 'base-file');
    git(root, 'commit', '-qm', 'base change');
    const sessionId = `base-merge-${root}`;
    const stateFile = join(stateDirectory, `${sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    const gates = ['make test', 'make lint', 'make typecheck', 'make build'];
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task refresh base'});
    for (const command of gates) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
    }
    let result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'git merge --squash task/base-refresh'}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    const baseMerge = `git merge --no-edit ${baseBranch}`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: baseMerge}}).stdout, '');
    assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')).verified ?? [], []);
    assert.equal(spawnSync('sh', ['-c', baseMerge], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: baseMerge}, tool_response: {exit_code: 0}});
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'git merge --squash task/base-refresh'}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    for (const command of gates) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
    }
    writeFileSync(join(root, 'later-base-file'), 'later base\n');
    git(root, 'add', 'later-base-file');
    git(root, 'commit', '-qm', 'later base change');
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'git merge --squash task/base-refresh'}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: baseMerge}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', baseMerge], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command: baseMerge}, tool_response: {exit_code: 0}});
    for (const command of gates) {
      runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
    }
    result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'git merge --squash task/base-refresh'}});
    assert.equal(result.stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not activate for ordinary prompts', () => {
  const sessionId = `ordinary-${Date.now()}`;
  runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: tmpdir(), prompt: 'change code'});
  const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: tmpdir(), tool_name: 'apply_patch', tool_input: {command: 'patch'}});
  assert.equal(result.stdout, '');
});

test('blocks shell write bypasses in the caller checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  try {
    git(root, 'init', '-q');
    const sessionId = `shell-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    for (const command of ['python -c "open(\'x\',\'w\').write(\'x\')"', 'node -e "require(\'fs\').writeFileSync(\'x\',\'x\')"', 'make build', 'rsync a b']) {
      const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('keeps protection after Stop for multi-turn tasks', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  try {
    git(root, 'init', '-q');
    const sessionId = `stop-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '/task change code'});
    runHook({hook_event_name: 'Stop', session_id: sessionId, cwd: root});
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Write', tool_input: {file_path: join(root, 'blocked.txt')}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('allows Claude-style cd into a task worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture-cd', worktree, 'HEAD');
    const sessionId = `cd-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: `cd "${worktree}" && npm test`}});
    assert.equal(result.stdout, '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('blocks commands that reference the caller root from a task worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture-cross', worktree, 'HEAD');
    const sessionId = `cross-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: `cd "${worktree}" && rm "${root}/file"`}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('keeps protection through a real continuation prompt', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  try {
    git(root, 'init', '-q');
    const sessionId = `abandon-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '/task inspect only'});
    runHook({hook_event_name: 'Stop', session_id: sessionId, cwd: root});
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'continue the task'});
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Write', tool_input: {file_path: join(root, 'allowed.txt')}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '/task-cancel'});
    const canceled = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Write', tool_input: {file_path: join(root, 'allowed.txt')}});
    assert.equal(canceled.stdout, '');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('blocks relative shell escapes from a task worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-test-'));
  const worktree = `${root}-worktree`;
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    spawnSync('sh', ['-c', 'echo fixture > file'], {cwd: root});
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/fixture-relative', worktree, 'HEAD');
    const sessionId = `relative-${Date.now()}`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    bindTaskWorktree(root, worktree, sessionId);
    for (const command of [`cd "${worktree}" && cd ../elsewhere && rm file`, `cd "${worktree}" && git -C ../elsewhere commit`]) {
      const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});
