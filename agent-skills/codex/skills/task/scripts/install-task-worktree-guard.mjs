#!/usr/bin/env node

import {mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const runtime = process.argv[2];
if (!['claude', 'codex'].includes(runtime)) {
  throw new Error('Usage: install-task-worktree-guard.mjs <claude|codex> [config-path]');
}

const configPath = process.argv[3] ?? join(homedir(), `.${runtime}`, runtime === 'codex' ? 'hooks.json' : 'settings.json');
const guardPath = join(dirname(fileURLToPath(import.meta.url)), 'task-worktree-guard.mjs');
const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(guardPath)}`;

// Reads an existing hook configuration without discarding unrelated settings.
function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

// Adds one hook command unless the same command and matcher already exist.
function addHook(config, event, matcher) {
  config.hooks ??= {};
  config.hooks[event] ??= [];
  const exists = config.hooks[event].some((entry) =>
    entry.matcher === matcher && entry.hooks?.some((hook) => hook.command === command),
  );
  if (!exists) {
    config.hooks[event].push({matcher, hooks: [{type: 'command', command, timeout: 10}]});
  }
}

const config = readConfig();
addHook(config, 'UserPromptSubmit', '.*');
addHook(config, 'PreToolUse', 'Bash|apply_patch|Edit|Write|MultiEdit');
addHook(config, 'Stop', '.*');
mkdirSync(dirname(configPath), {recursive: true});
const temporaryPath = `${configPath}.${process.pid}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
renameSync(temporaryPath, configPath);
process.stdout.write(`Installed task worktree guard in ${configPath}\n`);
