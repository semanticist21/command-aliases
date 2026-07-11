import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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
    const stateFile = join(tmpdir(), `task-worktree-guard-${process.getuid?.() ?? 'user'}`, `${sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    runHook({hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: root, prompt: '$task change code'});
    for (const [command, gate] of [
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
