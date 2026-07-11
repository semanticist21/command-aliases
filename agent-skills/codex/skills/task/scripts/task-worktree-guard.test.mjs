import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./task-worktree-guard.mjs', import.meta.url));

// Runs one hook event against the guard script.
function runHook(payload) {
  const result = spawnSync(process.execPath, [script], {input: JSON.stringify(payload), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result;
}

// Runs a Git command inside a fixture repository.
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
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
    const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'apply_patch', tool_input: {command: '*** Begin Patch', workdir: worktree}});
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
    for (const command of [`cd "${worktree}" && cd ../elsewhere && rm file`, `cd "${worktree}" && git -C ../elsewhere commit`]) {
      const result = runHook({hook_event_name: 'PreToolUse', session_id: sessionId, cwd: root, tool_name: 'Bash', tool_input: {command}});
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
    }
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});
