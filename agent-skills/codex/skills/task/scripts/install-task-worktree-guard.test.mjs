import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const installer = fileURLToPath(new URL('./install-task-worktree-guard.mjs', import.meta.url));

// Runs the installer twice and verifies the complete idempotent hook contract.
test('installs all five task guard hooks with exact matchers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'task-guard-installer-'));
  const configPath = join(directory, 'hooks.json');
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = spawnSync(process.execPath, [installer, 'codex', configPath], {encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
    }
    const hooks = JSON.parse(readFileSync(configPath, 'utf8')).hooks;
    const expected = new Map([
      ['UserPromptSubmit', '.*'],
      ['PreToolUse', 'Bash|apply_patch|Edit|Write|MultiEdit'],
      ['PostToolUse', 'Bash'],
      ['PostToolUseFailure', 'Bash'],
      ['Stop', '.*'],
    ]);
    assert.deepEqual(Object.keys(hooks).sort(), [...expected.keys()].sort());
    for (const [event, matcher] of expected) {
      assert.equal(hooks[event].length, 1, event);
      assert.equal(hooks[event][0].matcher, matcher, event);
      assert.equal(hooks[event][0].hooks.length, 1, event);
      assert.match(hooks[event][0].hooks[0].command, /\.codex\/skills\/task\/scripts\/task-worktree-guard\.mjs/u, event);
      assert.equal(hooks[event][0].hooks[0].timeout, 30, event);
    }
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
