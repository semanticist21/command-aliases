import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, chmodSync, copyFileSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, relative} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./task-worktree-guard.mjs', import.meta.url));
const creatorScript = fileURLToPath(new URL('./task-worktree-create.mjs', import.meta.url));
const planCleanupScript = fileURLToPath(new URL('./task-worktree-plan-cleanup.mjs', import.meta.url));
const runtime = script.includes('/codex/') ? 'codex' : 'claude';
const stateDirectory = mkdtempSync(join(tmpdir(), 'task-worktree-guard-state-'));

// Returns the collision-resistant guard state path for one exact session id.
function sessionStatePath(sessionId) {
  return join(stateDirectory, `${createHash('sha256').update(String(sessionId)).digest('hex')}.json`);
}

// Runs one hook event against the guard script.
function runHook(payload) {
  const result = spawnSync(process.execPath, [script], {input: JSON.stringify(payload), encoding: 'utf8', env: {...process.env, TASK_WORKTREE_GUARD_STATE_DIR: stateDirectory}});
  assert.equal(result.status, 0, result.stderr);
  return result;
}

// Runs one hook event asynchronously for concurrency regression tests.
function runHookAsync(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {env: {...process.env, TASK_WORKTREE_GUARD_STATE_DIR: stateDirectory}});
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => status === 0 ? resolve({stdout, stderr, status}) : reject(new Error(stderr || `hook exited ${status}`)));
    child.stdin.end(JSON.stringify(payload));
  });
}

// Runs a Git command inside a fixture repository.
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// Records the empty ignored-artifact baseline expected by manual plan fixtures.
function preparePlanState(worktree) {
  const empty = createHash('sha256').update('').digest('hex');
  const submodules = spawnSync('git', ['-C', worktree, 'submodule', 'foreach', '--quiet', '--recursive', 'printf "%s\\0" "$toplevel/$sm_path"'], {encoding: 'utf8'});
  assert.equal(submodules.status, 0, submodules.stderr);
  const repositories = [worktree, ...submodules.stdout.split('\0').filter(Boolean)];
  const recursive = createHash('sha256').update(repositories.map((repository) => {
    const path = relative(worktree, repository).split('\\').join('/') || '.';
    return `${path}\0${empty}`;
  }).sort().join('\0')).digest('hex');
  mkdirSync(join(worktree, '.agent-tmp'), {recursive: true});
  writeFileSync(join(worktree, '.agent-tmp', 'task-state.md'), `- ignored baseline: ${recursive}\n- ignored superproject baseline: ${empty}\n`);
  const exclude = git(worktree, 'rev-parse', '--git-path', 'info/exclude');
  appendFileSync(exclude, '\n.agent-tmp/\n');
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
  const stateFile = sessionStatePath(sessionId);
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
    assert.equal(runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'}).stdout, '');
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: '*** Begin Patch'}});
    const response = JSON.parse(result.stdout);
    assert.equal(response.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(response.hookSpecificOutput.permissionDecisionReason, /TASK WORKTREE REQUIRED/);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('keeps path- and case-colliding session ids in separate state files', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-session-key-'));
  try {
    git(root, 'init', '-q');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    for (const sessionId of ['a/b', 'a?b', 'Case', 'case']) {
      runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
      assert.equal(JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8')).callerRoot, canonicalRoot);
    }
    assert.equal(new Set(['a/b', 'a?b', 'Case', 'case'].map(sessionStatePath)).size, 4);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('recovers a stale markerless session lock', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-markerless-lock-'));
  const sessionId = `markerless-${Date.now()}`;
  const lock = `${sessionStatePath(sessionId)}.lock`;
  try {
    git(root, 'init', '-q');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    mkdirSync(lock, {recursive: true});
    writeFileSync(join(lock, 'incomplete'), 'creator crashed before owner marker\n');
    utimesSync(lock, new Date(0), new Date(0));
    assert.equal(runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'}).stdout, '');
    assert.equal(JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8')).callerRoot, canonicalRoot);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('waits for a fresh empty legacy lock instead of stealing it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-fresh-empty-lock-'));
  const sessionId = `fresh-empty-${Date.now()}`;
  const lock = `${sessionStatePath(sessionId)}.lock`;
  try {
    git(root, 'init', '-q');
    mkdirSync(lock, {recursive: true});
    const pending = runHookAsync({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    await new Promise((resolve) => setTimeout(resolve, 100));
    rmSync(lock, {recursive: true});
    assert.equal((await pending).stdout, '');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('releases expired session state before enforcing a write', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-expired-'));
  const sessionId = `expired-${Date.now()}`;
  const stateFile = sessionStatePath(sessionId);
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
    if (worktree) rmSync(worktree, {recursive: true, force: true});
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

test('serializes concurrent creator reservations in one session', async () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-same-session-race-'));
  const sessionId = `same-session-race-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs race --id one`;
    const commands = [command, command];
    const results = await Promise.all(commands.map((command) => runHookAsync({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}})));
    assert.equal(results.filter((result) => result.stdout === '').length, 1);
    assert.equal(results.filter((result) => /permissionDecision/u.test(result.stdout)).length, 1);
    const state = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8'));
    assert.equal(state.pendingCreator.id, 'one');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'task-cancel'});
  } finally {
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

test('auto-activates guard state for an implicitly selected task creator', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-implicit-creator-'));
  const sessionId = `implicit-creator-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs implicit --id implicit-id`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    const state = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8'));
    assert.equal(state.pendingCreator.id, 'implicit-id');
    assert.deepEqual(JSON.parse(readFileSync(state.pendingCreator.reservationPath, 'utf8')), {nonce: state.pendingCreator.nonce, baseHead: state.pendingCreator.baseHead, baseBranch: 'main'});
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'task-cancel'});
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('ignores an unrelated failure while a creator transition is pending', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-unrelated-failure-'));
  const sessionId = `unrelated-failure-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs pending --id pending-id`;
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    const before = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8')).pendingCreator;
    runHook({hook_event_name: 'PostToolUseFailure', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'false'}});
    const after = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8')).pendingCreator;
    assert.deepEqual(after, before);
    assert.equal(git(root, 'rev-parse', `refs/heads/${after.branch}`), after.baseHead);
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'task-cancel'});
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('allows the exact task creator command and binds its new worktree after success', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-'));
  const home = mkdtempSync(join(tmpdir(), 'task-guard-creator-home-'));
  let worktree;
  const sessionId = `creator-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    const installedCreator = join(home, `.${runtime}`, 'skills', 'task', 'scripts', 'task-worktree-create.mjs');
    mkdirSync(dirname(installedCreator), {recursive: true});
    copyFileSync(fileURLToPath(new URL('./task-worktree-create.mjs', import.meta.url)), installedCreator);
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs guarded --id guarded-id --repo "${root}" --summary "Guarded setup"`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    worktree = join(dirname(root), `${basename(root)}-task-guarded-guarded-id`);
    const created = spawnSync('sh', ['-c', command], {cwd: root, encoding: 'utf8', env: {...process.env, HOME: home}});
    assert.equal(created.status, 0, created.stderr);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
    assert.equal(git(worktree, 'branch', '--show-current'), 'task/guarded-guarded-id');
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(home, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('binds a created worktree when dependency setup reports failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-fail-'));
  let worktree;
  const sessionId = `creator-fail-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs retained --id retained-id`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    worktree = join(dirname(root), `${basename(root)}-task-retained-retained-id`);
    const nonce = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8')).pendingCreator.nonce;
    git(root, 'worktree', 'add', '-q', worktree, 'task/retained-retained-id');
    mkdirSync(join(worktree, '.agent-tmp'));
    writeFileSync(join(worktree, '.agent-tmp', 'task-state.md'), `- creator id: retained-id\n- guard nonce: ${nonce}\n`);
    runHook({hook_event_name: 'PostToolUseFailure', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('retains and resumes a creator interrupted after worktree attachment', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-interrupted-'));
  const home = mkdtempSync(join(tmpdir(), 'task-guard-creator-interrupted-home-'));
  let worktree;
  const sessionId = `creator-interrupted-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\n');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    const installedCreator = join(home, `.${runtime}`, 'skills', 'task', 'scripts', 'task-worktree-create.mjs');
    mkdirSync(dirname(installedCreator), {recursive: true});
    copyFileSync(fileURLToPath(new URL('./task-worktree-create.mjs', import.meta.url)), installedCreator);
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs interrupted --id interrupted-id --repo "${root}" --summary "Resume setup"`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    worktree = join(dirname(root), `${basename(root)}-task-interrupted-interrupted-id`);
    git(root, 'worktree', 'add', '-q', worktree, 'task/interrupted-interrupted-id');
    runHook({hook_event_name: 'PostToolUseFailure', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    const stateFile = sessionStatePath(sessionId);
    const interrupted = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.ok(interrupted.pendingCreator);
    assert.ok(readFileSync(interrupted.pendingCreator.reservationPath, 'utf8').trim());
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    const resumed = spawnSync('sh', ['-c', command], {cwd: root, encoding: 'utf8', env: {...process.env, HOME: home}});
    assert.equal(resumed.status, 0, resumed.stderr);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}, tool_response: {exit_code: 0}});
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'apply_patch', tool_input: {command: 'patch'}}).stdout, '');
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(home, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('Stop retains a creator interrupted after worktree attachment', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-stop-attached-'));
  let worktree;
  const sessionId = `creator-stop-attached-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs attached --id attached-id`;
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    worktree = join(dirname(root), `${basename(root)}-task-attached-attached-id`);
    git(root, 'worktree', 'add', '-q', worktree, 'task/attached-attached-id');
    runHook({hook_event_name: 'Stop', session_id: sessionId, cwd: root});
    const state = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8'));
    assert.ok(state.pendingCreator);
    assert.ok(readFileSync(state.pendingCreator.reservationPath, 'utf8').trim());
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'task-cancel'});
    const retained = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8'));
    assert.ok(retained.pendingCreator);
    assert.ok(readFileSync(retained.pendingCreator.reservationPath, 'utf8').trim());
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(root, {recursive: true, force: true});
  }
});

test('reserves creator ids and does not bind a concurrent same-slug worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-race-'));
  const other = join(dirname(root), `${basename(root)}-task-shared-other-id`);
  const sessionId = `creator-race-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs shared --id owned-id`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    const competingSession = `${sessionId}-competing`;
    runHook({hook_event_name: 'UserPromptSubmit', session_id: competingSession, cwd: root, prompt: '$task competing code'});
    const collision = runHook({hook_event_name: 'PreToolUse', session_id: competingSession, cwd: root, tool_name: 'Bash', tool_input: {command}});
    assert.match(JSON.parse(collision.stdout).hookSpecificOutput.permissionDecisionReason, /ID COLLISION/u);
    git(root, 'worktree', 'add', '-qb', 'task/shared-other-id', other, 'HEAD');
    mkdirSync(join(other, '.agent-tmp'));
    writeFileSync(join(other, '.agent-tmp', 'task-state.md'), '- creator id: other-id\n');
    runHook({hook_event_name: 'PostToolUseFailure', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    const denied = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: other, tool_name: 'apply_patch', tool_input: {command: 'patch'}});
    assert.match(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecisionReason, /WORKTREE REQUIRED/u);
  } finally {
    rmSync(other, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('does not delete a competing creator reservation before its ref appears', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-reservation-window-'));
  const sessionId = `creator-reservation-window-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    const reservation = join(git(root, 'rev-parse', '--absolute-git-dir'), 'task-worktree-reservations', 'window-fixed-id.nonce');
    const winner = {nonce: 'winner', baseHead: git(root, 'rev-parse', 'HEAD'), baseBranch: 'main'};
    mkdirSync(dirname(reservation), {recursive: true});
    writeFileSync(reservation, `${JSON.stringify(winner)}\n`);
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs window --id fixed-id`;
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    assert.deepEqual(JSON.parse(readFileSync(reservation, 'utf8')), winner);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects a reused creator id instead of binding its existing worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-reused-'));
  let existing;
  const sessionId = `creator-reused-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    const canonicalRoot = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'}).stdout.trim();
    existing = join(dirname(canonicalRoot), `${basename(canonicalRoot)}-task-reused-reused-id`);
    git(root, 'worktree', 'add', '-qb', 'task/reused-reused-id', existing, 'HEAD');
    mkdirSync(join(existing, '.agent-tmp'), {recursive: true});
    writeFileSync(join(existing, '.agent-tmp', 'task-state.md'), '- creator id: reused-id\n');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs reused --id reused-id`;
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.permissionDecisionReason, /ID COLLISION/u);
  } finally {
    if (existing) rmSync(existing, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('task-cancel releases an interrupted creator reservation', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-cancel-'));
  const sessionId = `creator-cancel-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs canceled --id canceled-id`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    const stateFile = sessionStatePath(sessionId);
    const reservationPath = JSON.parse(readFileSync(stateFile, 'utf8')).pendingCreator.reservationPath;
    assert.ok(readFileSync(reservationPath, 'utf8').trim());
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'task-cancel'});
    assert.throws(() => readFileSync(reservationPath, 'utf8'), {code: 'ENOENT'});
    assert.throws(() => readFileSync(stateFile, 'utf8'), {code: 'ENOENT'});
    assert.equal(git(root, 'branch', '--list', 'task/canceled-canceled-id'), '');
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('Stop releases an interrupted creator reservation without wedging its id', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-stop-'));
  const sessionId = `creator-stop-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    const command = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs stopped --id stopped-id`;
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    const stateFile = sessionStatePath(sessionId);
    const reservationPath = JSON.parse(readFileSync(stateFile, 'utf8')).pendingCreator.reservationPath;
    runHook({hook_event_name: 'Stop', session_id: sessionId, cwd: root});
    const stopped = JSON.parse(readFileSync(stateFile, 'utf8'));
    assert.equal(stopped.pendingCreator, undefined);
    assert.throws(() => readFileSync(reservationPath, 'utf8'), {code: 'ENOENT'});
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: 'task-cancel'});
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test('allows exact cleanup only for an unchanged plan-only worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-cleanup-'));
  const worktree = `${root}-plan`;
  const sessionId = `plan-cleanup-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task plan-only'});
    const add = `git worktree add -b task/plan-cleanup ${worktree} HEAD`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}}).stdout, '');
    git(root, 'worktree', 'add', '-qb', 'task/plan-cleanup', worktree, 'HEAD');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}, tool_response: {exit_code: 0}});
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const state = JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8'));
    assert.equal(state.taskCreationHead, git(root, 'rev-parse', 'HEAD'));
    assert.equal(state.taskCreationHead, git(worktree, 'rev-parse', 'HEAD'));
    assert.equal(git(worktree, 'status', '--porcelain=v1'), '');
    preparePlanState(worktree);
    writeFileSync(join(root, 'caller-advanced'), 'new base commit\n');
    git(root, 'add', 'caller-advanced');
    git(root, 'commit', '-qm', 'advance base during plan');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const cleanup = `node ~/.${runtime}/skills/task/scripts/task-worktree-plan-cleanup.mjs --repo ${JSON.stringify(canonicalRoot)} --worktree ${JSON.stringify(canonicalWorktree)} --branch task/plan-cleanup --head ${state.taskCreationHead}`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: cleanup}}).stdout, '');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-cleanup', '--head', state.taskCreationHead], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: cleanup}, tool_response: {exit_code: 0}});
    runHook({hook_event_name: 'Stop', session_id: sessionId, cwd: root});
    assert.equal(git(root, 'branch', '--list', 'task/plan-cleanup'), '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects plan-only cleanup after task content changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-dirty-'));
  const worktree = `${root}-plan`;
  const sessionId = `plan-dirty-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task plan-only'});
    const add = `git worktree add -b task/plan-dirty ${worktree} HEAD`;
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}});
    git(root, 'worktree', 'add', '-qb', 'task/plan-dirty', worktree, 'HEAD');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}, tool_response: {exit_code: 0}});
    writeFileSync(join(worktree, 'file'), 'changed\n');
    const head = git(root, 'rev-parse', 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const cleanup = `node ~/.${runtime}/skills/task/scripts/task-worktree-plan-cleanup.mjs --repo ${JSON.stringify(canonicalRoot)} --worktree ${JSON.stringify(canonicalWorktree)} --branch task/plan-dirty --head ${head}`;
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: cleanup}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects plan-only cleanup when an ignored nested submodule is dirty', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-dependency-'));
  const nestedDependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-nested-dependency-'));
  const worktree = `${root}-plan`;
  const sessionId = `plan-submodule-${Date.now()}`;
  try {
    for (const directory of [root, dependency, nestedDependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    const nestedAdded = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', dependency, 'submodule', 'add', '-q', nestedDependency, 'nested/dependency'], {encoding: 'utf8'});
    assert.equal(nestedAdded.status, 0, nestedAdded.stderr);
    git(dependency, 'config', '-f', '.gitmodules', 'submodule.nested/dependency.ignore', 'all');
    git(dependency, 'add', '.gitmodules', 'nested/dependency');
    git(dependency, 'commit', '-qm', 'add ignored nested submodule');
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'config', '-f', '.gitmodules', 'submodule.vendor/dependency.ignore', 'all');
    git(root, 'add', '.gitmodules', 'vendor/dependency');
    git(root, 'commit', '-qm', 'add ignored submodule');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task plan only'});
    const add = `git worktree add -b task/plan-submodule ${worktree} HEAD`;
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}});
    git(root, 'worktree', 'add', '-qb', 'task/plan-submodule', worktree, 'HEAD');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}, tool_response: {exit_code: 0}});
    const updated = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', worktree, 'submodule', 'update', '--init', '--recursive', '-q'], {encoding: 'utf8'});
    assert.equal(updated.status, 0, updated.stderr);
    writeFileSync(join(worktree, 'vendor', 'dependency', 'nested', 'dependency', 'file'), 'dirty\n');
    assert.equal(git(worktree, 'status', '--porcelain=v1'), '');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    preparePlanState(worktree);
    preparePlanState(worktree);
    const cleanup = `node ~/.${runtime}/skills/task/scripts/task-worktree-plan-cleanup.mjs --repo ${JSON.stringify(canonicalRoot)} --worktree ${JSON.stringify(canonicalWorktree)} --branch task/plan-submodule --head ${head}`;
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: cleanup}});
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(nestedDependency, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper rejects a worktree mutation after PreToolUse validation', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-race-'));
  const worktree = `${root}-plan`;
  const sessionId = `plan-race-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task plan-only'});
    const add = `git worktree add -b task/plan-race ${worktree} HEAD`;
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}});
    git(root, 'worktree', 'add', '-qb', 'task/plan-race', worktree, 'HEAD');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}, tool_response: {exit_code: 0}});
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    preparePlanState(worktree);
    const cleanup = `node ~/.${runtime}/skills/task/scripts/task-worktree-plan-cleanup.mjs --repo ${JSON.stringify(canonicalRoot)} --worktree ${JSON.stringify(canonicalWorktree)} --branch task/plan-race --head ${head}`;
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: cleanup}}).stdout, '');
    writeFileSync(join(worktree, 'file'), 'raced\n');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-race', '--head', head], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.match(cleaned.stderr, /contains changes/u);
    runHook({hook_event_name: 'PostToolUseFailure', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: cleanup}});
    assert.equal(git(worktree, 'branch', '--show-current'), 'task/plan-race');
    assert.match(git(root, 'branch', '--list', 'task/plan-race'), /task\/plan-race/u);
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper restores the worktree when quarantine repair fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-repair-fail-'));
  const worktree = `${root}-plan`;
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-repair-fail-bin-'));
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-repair-fail', worktree, 'HEAD');
    preparePlanState(worktree);
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    const failMarker = join(bin, 'repair-failed');
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "worktree" ] && [ "$4" = "repair" ] && [ ! -e "$FAIL_MARKER" ]; then : > "$FAIL_MARKER"; exit 55; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-repair-fail', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, FAIL_MARKER: failMarker},
    });
    assert.notEqual(cleaned.status, 0);
    assert.equal(git(worktree, 'branch', '--show-current'), 'task/plan-repair-fail');
    assert.match(git(root, 'branch', '--list', 'task/plan-repair-fail'), /task\/plan-repair-fail/u);
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves ignored files created after setup', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-ignored-race-'));
  const worktree = `${root}-plan`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nprivate-output/\n');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-ignored-race', worktree, 'HEAD');
    preparePlanState(worktree);
    mkdirSync(join(worktree, 'private-output'));
    writeFileSync(join(worktree, 'private-output', 'note'), 'preserve me\n');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-ignored-race', '--head', head], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.match(cleaned.stderr, /ignored artifacts changed/u);
    assert.equal(readFileSync(join(worktree, 'private-output', 'note'), 'utf8'), 'preserve me\n');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves a branch advanced after worktree removal', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-ref-race-'));
  const worktree = `${root}-plan`;
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-ref-race-bin-'));
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-ref-race', worktree, 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    preparePlanState(worktree);
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "update-ref" ] && [ "$4" = "-d" ]; then\n  tree=$("$REAL_GIT" -C "$RACE_REPO" rev-parse HEAD^{tree})\n  raced=$(printf "race\\n" | "$REAL_GIT" -C "$RACE_REPO" commit-tree "$tree" -p "$RACE_HEAD")\n  "$REAL_GIT" -C "$RACE_REPO" update-ref "refs/heads/$RACE_BRANCH" "$raced" "$RACE_HEAD"\nfi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-ref-race', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, RACE_REPO: canonicalRoot, RACE_BRANCH: 'task/plan-ref-race', RACE_HEAD: head},
    });
    assert.notEqual(cleaned.status, 0);
    assert.notEqual(git(root, 'rev-parse', 'refs/heads/task/plan-ref-race'), head);
    assert.equal(lstatSync(join(worktree, '.agent-tmp', 'task-state.md')).isFile(), true);
    assert.equal(lstatSync(join(worktree, '.agent-tmp', 'task-state.md')).isSymbolicLink(), false);
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper quarantines the worktree before final removal', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-final-race-'));
  const worktree = `${root}-plan`;
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-final-race-bin-'));
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-final-race', worktree, 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    preparePlanState(worktree);
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "worktree" ] && [ "$4" = "prune" ]; then mkdir -p "$RACE_WORKTREE"; printf "raced\\n" > "$RACE_WORKTREE/raced"; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-final-race', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, RACE_WORKTREE: canonicalWorktree},
    });
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(readFileSync(join(worktree, 'raced'), 'utf8'), 'raced\n');
    assert.equal(git(root, 'branch', '--list', 'task/plan-final-race'), '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper removes unchanged ignored setup artifacts safely', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-ignored-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-ignored-bin-'));
  const id = 'ignored-id';
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'ignored', '--id', id, '--repo', root, '--summary', 'Ignored cleanup', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-ignored-${id}`);
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', git(root, 'rev-parse', '--show-toplevel'), '--worktree', git(worktree, 'rev-parse', '--show-toplevel'), '--branch', `task/ignored-${id}`, '--head', head], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', `task/ignored-${id}`), '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves ignored setup artifacts whose mode changed', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-mode-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-mode-bin-'));
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'mode', '--id', 'fixed-id', '--repo', root, '--summary', 'Mode plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-mode-fixed-id`);
    const artifact = join(worktree, 'node_modules', 'pkg', 'file');
    chmodSync(artifact, 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', git(root, 'rev-parse', '--show-toplevel'), '--worktree', git(worktree, 'rev-parse', '--show-toplevel'), '--branch', 'task/mode-fixed-id', '--head', git(root, 'rev-parse', 'HEAD')], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.equal(readFileSync(artifact, 'utf8'), 'baseline\n');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper deinitializes and removes a clean submodule worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-clean-submodule-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-clean-dependency-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    const created = spawnSync(process.execPath, [creatorScript, 'plan-clean-submodule', '--id', 'fixed-id', '--repo', root, '--summary', 'Clean submodule plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file'},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-plan-clean-submodule-fixed-id`);
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-clean-submodule-fixed-id', '--head', head], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', 'task/plan-clean-submodule-fixed-id'), '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper quarantines before submodule deinitialization', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-race-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-race-dependency-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-race-bin-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    const created = spawnSync(process.execPath, [creatorScript, 'plan-submodule-race', '--id', 'fixed-id', '--repo', root, '--summary', 'Submodule race plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file'},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-plan-submodule-race-fixed-id`);
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "submodule" ] && [ "$4" = "deinit" ]; then mkdir -p "$RACE_WORKTREE/vendor/dependency"; printf "preserve\\n" > "$RACE_WORKTREE/vendor/dependency/new-artifact"; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-submodule-race-fixed-id', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, RACE_WORKTREE: canonicalWorktree},
    });
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(readFileSync(join(worktree, 'vendor', 'dependency', 'new-artifact'), 'utf8'), 'preserve\n');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves changed ignored artifacts inside a submodule', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-ignored-root-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-ignored-dependency-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-ignored-bin-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    writeFileSync(join(dependency, 'package.json'), '{"name":"dependency"}\n');
    writeFileSync(join(dependency, 'package-lock.json'), '{}\n');
    git(dependency, 'add', 'package.json', 'package-lock.json');
    git(dependency, 'commit', '-qm', 'add dependencies');
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'submodule-ignored', '--id', 'fixed-id', '--repo', root, '--summary', 'Submodule ignored', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file', PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-submodule-ignored-fixed-id`);
    const ignoredFile = join(worktree, 'vendor', 'dependency', 'node_modules', 'pkg', 'file');
    writeFileSync(ignoredFile, 'user change\n');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/submodule-ignored-fixed-id', '--head', head], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.match(cleaned.stderr, /ignored artifacts changed/u);
    assert.equal(readFileSync(ignoredFile, 'utf8'), 'user change\n');
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves a submodule artifact changed during deinit', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-live-root-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-live-dependency-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-live-bin-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    writeFileSync(join(dependency, 'package.json'), '{"name":"dependency"}\n');
    writeFileSync(join(dependency, 'package-lock.json'), '{}\n');
    git(dependency, 'add', 'package.json', 'package-lock.json');
    git(dependency, 'commit', '-qm', 'add dependencies');
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'submodule-live', '--id', 'fixed-id', '--repo', root, '--summary', 'Submodule live race', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file', PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-submodule-live-fixed-id`);
    const ignoredFile = join(worktree, 'vendor', 'dependency', 'node_modules', 'pkg', 'file');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "submodule" ] && [ "$4" = "deinit" ]; then printf "live change\\n" > "$2/vendor/dependency/node_modules/pkg/file"; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/submodule-live-fixed-id', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit},
    });
    assert.notEqual(cleaned.status, 0);
    assert.equal(readFileSync(ignoredFile, 'utf8'), 'live change\n');
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects clean plan cleanup for a task not activated as plan-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-mode-'));
  const worktree = `${root}-task`;
  const sessionId = `plan-mode-${Date.now()}`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task plan mode then implement feature'});
    const add = `git worktree add -b task/implementation ${worktree} HEAD`;
    runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}});
    git(root, 'worktree', 'add', '-qb', 'task/implementation', worktree, 'HEAD');
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: add}, tool_response: {exit_code: 0}});
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const cleanup = `node ~/.${runtime}/skills/task/scripts/task-worktree-plan-cleanup.mjs --repo ${JSON.stringify(canonicalRoot)} --worktree ${JSON.stringify(canonicalWorktree)} --branch task/implementation --head ${head}`;
    const denied = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: cleanup}});
    assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('rejects composed and alternate task creator commands', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-creator-reject-'));
  const sessionId = `creator-reject-${Date.now()}`;
  try {
    git(root, 'init', '-q');
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    for (const command of [
      `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs safe --id safe-id && touch /tmp/unsafe`,
      'node /tmp/task-worktree-create.mjs safe --id safe-id',
      `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs ../unsafe --id safe-id`,
      `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs safe`,
    ]) {
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
    const baseStateFile = sessionStatePath(sessionId);
    assert.ok(JSON.parse(readFileSync(baseStateFile, 'utf8')).baseMergedTip);
    const verification = 'make test lint typecheck build';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: verification}}).stdout, '');
    const duplicateVerification = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: verification}});
    assert.match(JSON.parse(duplicateVerification.stdout).hookSpecificOutput.permissionDecisionReason, /BUSY/u);
    assert.equal(spawnSync('sh', ['-c', verification], {cwd: worktree}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {cmd: verification}});
    for (const command of ['git add file', 'git commit -m "task change"', 'git status --short']) {
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}}).stdout, '', command);
      assert.equal(spawnSync('sh', ['-c', command], {cwd: worktree}).status, 0, command);
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, workdir: worktree, tool_name: 'Bash', tool_input: {command}});
    }
    writeFileSync(join(root, 'caller-only'), 'preserve\n');
    git(root, 'add', 'caller-only');
    const stagedMerge = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: 'git merge --squash task/fixture-finalize'}});
    assert.equal(JSON.parse(stagedMerge.stdout).hookSpecificOutput.permissionDecision, 'deny');
    git(root, 'restore', '--staged', 'caller-only');
    const commands = [
      ['git merge --squash task/fixture-finalize', root],
      ['git commit -m "merge task"', root],
      [`git worktree remove "${canonicalWorktree}"`, root],
      [`git update-ref -d refs/heads/task/fixture-finalize ${git(worktree, 'rev-parse', 'HEAD')}`, root],
    ];
    for (const [command, directory] of commands) {
      assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}}).stdout, '', command);
      assert.equal(spawnSync('sh', ['-c', command], {cwd: directory}).status, 0);
      runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
    }
    assert.doesNotMatch(git(root, 'show', '--pretty=', '--name-only', 'HEAD'), /caller-only/u);
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
    assert.equal(spawnSync('sh', ['-c', exactMerge], {cwd: root}).status, 0);
    runHook({hook_event_name: 'PostToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactMerge}});
    for (const command of ['git commit --amend -m bad', 'git commit -am bad', 'git commit file']) {
      result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
    const exactCommit = 'git commit -m valid';
    assert.equal(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: exactCommit}}).stdout, '');
    assert.equal(spawnSync('sh', ['-c', exactCommit], {cwd: root}).status, 0);
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
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task start another change'});
    assert.equal(JSON.parse(readFileSync(sessionStatePath(sessionId), 'utf8')).taskRoot, git(first, 'rev-parse', '--show-toplevel'));
    const secondCreator = `node ~/.${runtime}/skills/task/scripts/task-worktree-create.mjs another --id another-id`;
    assert.match(JSON.parse(runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command: secondCreator}}).stdout).hookSpecificOutput.permissionDecisionReason, /WORKTREE MISMATCH/);
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
    const stateFile = sessionStatePath(sessionId);
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
    const stateFile = sessionStatePath(sessionId);
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
    const stateFile = sessionStatePath(sessionId);
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
    const taskHead = git(worktree, 'rev-parse', 'HEAD');
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
      `git update-ref -d refs/heads/task/existing-clean ${taskHead}`,
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
    const stateFile = sessionStatePath(sessionId);
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
