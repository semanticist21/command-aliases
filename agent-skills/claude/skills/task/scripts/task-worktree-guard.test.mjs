import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const script = fileURLToPath(new URL('./task-worktree-guard.mjs', import.meta.url));

// Runs one legacy hook payload through the advisory guard.
function runGuard(payload) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

test('allows representative hook payloads without output or denial', () => {
  const payloads = [
    {hook_event_name: 'UserPromptSubmit', session_id: 'session', prompt: '$task change files'},
    {hook_event_name: 'PreToolUse', session_id: 'session', tool_name: 'Bash', tool_input: {command: 'touch caller-file'}},
    {hook_event_name: 'PreToolUse', session_id: 'session', tool_name: 'apply_patch', tool_input: {patch: 'write caller checkout'}},
    {hook_event_name: 'PostToolUse', session_id: 'session', tool_name: 'Bash'},
    {hook_event_name: 'PostToolUseFailure', session_id: 'session', tool_name: 'Bash'},
    {hook_event_name: 'Stop', session_id: 'session'},
    {},
    'not json',
  ];

  for (const payload of payloads) {
    const result = runGuard(payload);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});
