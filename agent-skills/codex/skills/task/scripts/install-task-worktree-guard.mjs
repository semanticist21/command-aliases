#!/usr/bin/env node

import {mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';

const runtime = process.argv[2];
if (!['claude', 'codex'].includes(runtime)) {
  throw new Error('Usage: install-task-worktree-guard.mjs <claude|codex> [config-path]');
}

const configPath = process.argv[3] ?? join(homedir(), `.${runtime}`, runtime === 'codex' ? 'hooks.json' : 'settings.json');

// Reads an existing hook configuration without discarding unrelated settings.
function readConfig() {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

// Removes legacy task guard commands while preserving unrelated hook configuration.
function removeTaskGuardHooks(config) {
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) return;
  let removedAny = false;
  for (const [event, entries] of Object.entries(config.hooks)) {
    if (!Array.isArray(entries)) continue;
    const keptEntries = [];
    let removedFromEvent = false;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) {
        keptEntries.push(entry);
        continue;
      }
      const hooks = entry.hooks.filter((hook) => !String(hook?.command ?? '').includes('task-worktree-guard.mjs'));
      if (hooks.length === entry.hooks.length) {
        keptEntries.push(entry);
        continue;
      }
      removedAny = true;
      removedFromEvent = true;
      if (hooks.length > 0) keptEntries.push({...entry, hooks});
    }
    if (removedFromEvent && keptEntries.length === 0) delete config.hooks[event];
    else if (removedFromEvent) config.hooks[event] = keptEntries;
  }
  if (removedAny && Object.keys(config.hooks).length === 0) delete config.hooks;
}

const config = readConfig();
removeTaskGuardHooks(config);
mkdirSync(dirname(configPath), {recursive: true});
const temporaryPath = `${configPath}.${process.pid}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
renameSync(temporaryPath, configPath);
process.stdout.write(`Removed legacy task worktree guard hooks from ${configPath}\n`);
