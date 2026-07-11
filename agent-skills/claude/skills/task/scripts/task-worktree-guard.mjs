#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';

const stateDirectory = join(tmpdir(), `task-worktree-guard-${process.getuid?.() ?? 'user'}`);

// Reads the hook payload from standard input.
function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

// Returns the persistent state path for one agent session.
function statePath(sessionId) {
  return join(stateDirectory, `${String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
}

// Resolves the Git worktree root containing a directory.
function gitRoot(directory) {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

// Resolves the checked-out branch containing a directory.
function gitBranch(directory) {
  try {
    return execFileSync('git', ['-C', directory, 'branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

// Detects explicit task skill invocations in a submitted prompt.
function invokesTask(prompt) {
  return /(?:^|\s)(?:\$|\/)task(?:\s|$)/u.test(prompt);
}

// Detects an explicit request to release an abandoned task guard.
function cancelsTask(prompt) {
  return /(?:^|\s)(?:\$|\/)task-cancel(?:\s|$)/u.test(prompt);
}

// Detects a protected absolute path without matching sibling path prefixes.
function referencesPath(command, path) {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?=$|[/\\s"'])`, 'u').test(command);
}

// Allows only worktree discovery and creation before isolation exists.
function isBootstrapShell(command) {
  const normalized = command.trim();
  if (/[;&|\n]|(?:^|[^<])>{1,2}(?!>)/u.test(normalized)) return false;
  return /^(?:pwd|git(?:\s+-C\s+\S+)?\s+(?:status(?:\s+--\S+)*|rev-parse\s+(?:--show-toplevel|--git-common-dir)|branch\s+(?:--show-current|--list(?:\s+\S+)?)|worktree\s+(?:list|add\b.*)))$/u.test(normalized);
}

// Returns every target directory exposed by a tool payload.
function toolDirectories(payload) {
  const input = payload.tool_input ?? {};
  const cwd = resolve(input.workdir ?? input.cwd ?? payload.cwd ?? process.cwd());
  if (payload.tool_name === 'Bash') {
    const command = String(input.command ?? '');
    const match = command.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))\s*&&/u);
    if (match) return [resolve(cwd, match[1] ?? match[2] ?? match[3])];
  }
  const directPath = input.file_path ?? input.path;
  if (directPath) return [dirname(isAbsolute(directPath) ? directPath : resolve(cwd, directPath))];

  if (payload.tool_name === 'apply_patch') {
    const paths = [...String(input.command ?? '').matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gmu)]
      .map((match) => match[1].trim())
      .map((path) => (isAbsolute(path) ? path : resolve(cwd, path)));
    if (paths.length > 0) return paths.map((path) => dirname(path));
  }
  return [cwd];
}

// Detects a second shell directory change after the validated leading task cd.
function escapesShellDirectory(command) {
  const leadingCd = /^\s*cd\s+(?:"[^"]+"|'[^']+'|[^\s;&|]+)\s*&&\s*/u;
  const remainder = command.replace(leadingCd, '');
  return /(?:^|[;&|]\s*|\s)(?:cd|pushd|popd)\b|\bgit\s+-C\b/u.test(remainder);
}

// Prints a portable deny response understood by Claude Code and Codex hooks.
function deny(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })}\n`);
}

// Handles task activation and cleanup lifecycle events.
function handleLifecycle(payload, file) {
  if (payload.hook_event_name === 'Stop') {
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      if (state.taskRoot && !gitRoot(state.taskRoot)) rmSync(file, {force: true});
      else writeFileSync(file, JSON.stringify({...state, stopped: true}));
    } catch {
      // Missing state needs no cleanup.
    }
    return true;
  }
  if (payload.hook_event_name !== 'UserPromptSubmit') return false;
  const prompt = String(payload.prompt ?? payload.user_prompt ?? '');
  if (cancelsTask(prompt)) {
    rmSync(file, {force: true});
    return true;
  }
  if (!invokesTask(prompt)) {
    return true;
  }
  const cwd = resolve(payload.cwd ?? process.cwd());
  mkdirSync(stateDirectory, {recursive: true});
  writeFileSync(file, JSON.stringify({callerPath: cwd, callerRoot: gitRoot(cwd), activatedAt: new Date().toISOString()}));
  return true;
}

// Blocks task writes unless every target belongs to a task worktree.
function enforce(payload, file) {
  let state;
  try {
    state = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return;
  }

  const toolName = String(payload.tool_name ?? '');
  const command = String(payload.tool_input?.command ?? '');
  if (!['Bash', 'apply_patch', 'Edit', 'Write', 'MultiEdit'].includes(toolName)) return;

  const protectedPaths = [state.callerPath, state.callerRoot].filter(Boolean);
  if (toolName === 'Bash' && (protectedPaths.some((path) => referencesPath(command, path)) || escapesShellDirectory(command))) {
    deny('TASK CALLER CHECKOUT IS READ-ONLY: the shell command references the protected caller root.');
    return;
  }

  const directories = toolDirectories(payload);
  const isolated = directories.every((directory) => {
    const root = gitRoot(directory);
    return root && root !== state.callerRoot && gitBranch(directory).startsWith('task/');
  });
  if (isolated) {
    const taskRoot = gitRoot(directories[0]);
    writeFileSync(file, JSON.stringify({...state, taskRoot}));
    return;
  }
  if (toolName === 'Bash' && isBootstrapShell(command)) return;

  deny('TASK WORKTREE REQUIRED: create and use a task/* worktree before writing. The caller checkout is read-only.');
}

const payload = readPayload();
const sessionId = payload.session_id ?? payload.transcript_path ?? 'unknown-session';
const file = statePath(sessionId);
if (!handleLifecycle(payload, file)) enforce(payload, file);
