import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const installer = fileURLToPath(new URL('./install-task-worktree-guard.mjs', import.meta.url));

test('removes every legacy guard hook and preserves unrelated configuration idempotently', () => {
  const directory = mkdtempSync(join(tmpdir(), 'task-guard-installer-'));
  const configPath = join(directory, 'hooks.json');
  const guard = {type: 'command', command: 'node /tmp/task-worktree-guard.mjs', timeout: 30};
  const unrelated = {type: 'command', command: 'node /tmp/unrelated-hook.mjs', timeout: 10};
  const config = {
    permissions: {allow: ['Bash(git status:*)']},
    custom: {keep: true},
    hooks: {
      PreToolUse: [
        {matcher: 'Bash', hooks: [guard, unrelated], label: 'mixed'},
        {matcher: 'Edit', hooks: [guard]},
        {matcher: 'Read', hooks: [unrelated]},
      ],
      Stop: [{matcher: '.*', hooks: [{...guard, command: '/usr/bin/node ~/.codex/skills/task/scripts/task-worktree-guard.mjs'}]}],
      EmptyUnrelated: [],
      CustomShape: {keep: true},
    },
  };
  try {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    const first = spawnSync(process.execPath, [installer, 'codex', configPath], {encoding: 'utf8'});
    assert.equal(first.status, 0, first.stderr);
    const firstContents = readFileSync(configPath, 'utf8');
    const installed = JSON.parse(firstContents);
    assert.deepEqual(installed.permissions, config.permissions);
    assert.deepEqual(installed.custom, config.custom);
    assert.deepEqual(installed.hooks.PreToolUse, [
      {matcher: 'Bash', hooks: [unrelated], label: 'mixed'},
      {matcher: 'Read', hooks: [unrelated]},
    ]);
    assert.equal('Stop' in installed.hooks, false);
    assert.deepEqual(installed.hooks.EmptyUnrelated, []);
    assert.deepEqual(installed.hooks.CustomShape, {keep: true});
    assert.doesNotMatch(firstContents, /task-worktree-guard\.mjs/u);

    const second = spawnSync(process.execPath, [installer, 'codex', configPath], {encoding: 'utf8'});
    assert.equal(second.status, 0, second.stderr);
    assert.equal(readFileSync(configPath, 'utf8'), firstContents);
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});

test('installs no hooks into a missing configuration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'task-guard-installer-empty-'));
  const configPath = join(directory, 'settings.json');
  try {
    const result = spawnSync(process.execPath, [installer, 'claude', configPath], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')), {});
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
});
