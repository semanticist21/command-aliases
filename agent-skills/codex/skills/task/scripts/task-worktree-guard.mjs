#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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

// Resolves the current commit checked out in a worktree.
function gitHead(directory) {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return null;
  }
}

// Reports whether one commit is contained in another commit's history.
function isAncestor(directory, ancestor, descendant) {
  try {
    execFileSync('git', ['-C', directory, 'merge-base', '--is-ancestor', ancestor, descendant], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
}

// Hashes sorted Git tree-style entries into one deterministic content identity.
function contentFingerprint(entries) {
  return createHash('sha256').update(entries.sort().join('\0')).digest('hex');
}

// Fingerprints all tracked and relevant untracked content independently of HEAD and staging.
function workspaceFingerprint(directory) {
  try {
    const paths = execFileSync('git', ['-C', directory, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean).sort();
    const indexRecords = execFileSync('git', ['-C', directory, 'ls-files', '--stage', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
    const index = new Map(indexRecords.map((record) => {
      const match = record.match(/^(\d+) ([0-9a-f]+) 0\t(.+)$/u);
      return match ? [match[3], {mode: match[1], hash: match[2]}] : [record, null];
    }));
    const tags = new Map(execFileSync('git', ['-C', directory, 'ls-files', '-t', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean).map((record) => [record.slice(2), record[0]]));
    const hashablePaths = paths.filter((path) => {
      if (index.get(path)?.mode === '160000' || path.includes('\n')) return false;
      try {
        lstatSync(join(directory, path));
        return true;
      } catch {
        return false;
      }
    });
    let bulkHashes = [];
    try {
      bulkHashes = hashablePaths.length > 0 ? execFileSync('git', ['-C', directory, 'hash-object', '--stdin-paths'], {
        encoding: 'utf8',
        input: `${hashablePaths.join('\n')}\n`,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trimEnd().split('\n') : [];
    } catch {
      // A concurrently changed path falls back to the isolated per-file behavior below.
    }
    const hashes = bulkHashes.length === hashablePaths.length
      ? new Map(hashablePaths.map((path, offset) => [path, bulkHashes[offset]]))
      : new Map();
    const entries = paths.map((path) => {
      const indexed = index.get(path);
      if (indexed?.mode === '160000') {
        try {
          const submodule = join(directory, path);
          const head = execFileSync('git', ['-C', submodule, 'rev-parse', 'HEAD'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
          const dirty = execFileSync('git', ['-C', submodule, 'status', '--porcelain', '--untracked-files=normal'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
          return dirty ? `160000\0dirty:${head}:${createHash('sha256').update(dirty).digest('hex')}\0${path}` : `160000\0${head}\0${path}`;
        } catch {
          return `160000\0${indexed.hash}\0${path}`;
        }
      }
      try {
        const hash = hashes.get(path) ?? execFileSync('git', ['-C', directory, 'hash-object', '--', path], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
        const stat = lstatSync(join(directory, path));
        const mode = stat.isSymbolicLink() ? '120000' : stat.mode & 0o111 ? '100755' : '100644';
        return `${mode}\0${hash}\0${path}`;
      } catch {
        return tags.get(path) === 'S' && indexed ? `${indexed.mode}\0${indexed.hash}\0${path}` : null;
      }
    }).filter(Boolean);
    return contentFingerprint(entries);
  } catch {
    return null;
  }
}

// Fingerprints the exact stage-zero index content.
function indexFingerprint(directory) {
  try {
    const records = execFileSync('git', ['-C', directory, 'ls-files', '--stage', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
    const entries = records.map((record) => {
      const match = record.match(/^(\d+) ([0-9a-f]+) 0\t(.+)$/u);
      if (!match) throw new Error('index contains non-stage-zero entries');
      return `${match[1]}\0${match[2]}\0${match[3]}`;
    });
    return contentFingerprint(entries);
  } catch {
    return null;
  }
}

// Fingerprints the complete tree stored by the current task commit.
function headTreeFingerprint(directory) {
  try {
    const records = execFileSync('git', ['-C', directory, 'ls-tree', '-r', '-z', 'HEAD'], {encoding: 'utf8'}).split('\0').filter(Boolean);
    const entries = records.map((record) => {
      const match = record.match(/^(\d+) \S+ ([0-9a-f]+)\t(.+)$/u);
      if (!match) throw new Error('invalid tree entry');
      return `${match[1]}\0${match[2]}\0${match[3]}`;
    });
    return contentFingerprint(entries);
  } catch {
    return null;
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
  if (/[;|\n]|(?:^|[^<])>{1,2}(?!>)/u.test(normalized)) return false;
  const parts = normalized.split(/\s*&&\s*/u);
  const worktreeAdds = parts.filter((part) => /\sworktree\s+add\s/u.test(part));
  return worktreeAdds.length <= 1 && parts.every((part) => /^(?:pwd|git(?:\s+-C\s+(?:"[^"$`]+"|'[^'$`]+'|[a-zA-Z0-9_./-]+))?\s+(?:status(?:\s+(?:--short|--porcelain(?:=v1)?|--branch|-b))*|rev-parse\s+(?:--show-toplevel|--git-common-dir)|branch\s+(?:--show-current|--list(?:\s+(?:"[^"$`]+"|'[^'$`]+'|[a-zA-Z0-9_.*?/-]+))?)|worktree\s+(?:list|add\s+-b\s+task\/[a-zA-Z0-9._/-]+\s+(?:"[^"$`]+"|'[^'$`]+'|[a-zA-Z0-9_./-]+)\s+HEAD)))$/u.test(part));
}

// Returns every target directory exposed by a tool payload.
function toolDirectories(payload) {
  const input = payload.tool_input ?? {};
  const cwd = resolve(input.workdir ?? input.cwd ?? payload.workdir ?? payload.cwd ?? process.cwd());
  if (payload.tool_name === 'Bash') {
    const command = String(input.command ?? input.cmd ?? '');
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

// Returns verification gates named by a shell command.
function verificationGates(command) {
  const normalized = command.trim();
  if (!normalized || /[;&|\n]/u.test(normalized)) return [];
  const tokens = normalized.split(/\s+/u);
  if (tokens.some((token) => ['--help', '-h', '--version', '-V', '--no-run', '--collect-only', '--showConfig'].includes(token))) return [];
  const aliases = new Map([
    ['test', 'test'], ['tests', 'test'], ['lint', 'lint'],
    ['typecheck', 'typecheck'], ['type-check', 'typecheck'], ['build', 'build'],
  ]);
  if (tokens[0] === 'make') {
    const targetStart = tokens[1] === '-C' && tokens.length >= 4 && /^[a-zA-Z0-9_./-]+$/u.test(tokens[2]) ? 3 : 1;
    const targets = tokens.slice(targetStart);
    if (targets.length === 1 && targets[0] === 'verify') return ['test', 'lint', 'typecheck', 'build'];
    if (targets.length < 1 || targets.some((token) => !aliases.has(token))) return [];
    return [...new Set(targets.map((token) => aliases.get(token)))];
  }
  if (['npm', 'pnpm', 'yarn'].includes(tokens[0])) {
    const targetIndex = tokens[1] === 'run' ? 2 : 1;
    const target = tokens[targetIndex];
    const options = tokens.slice(targetIndex + 1);
    if (options.length > 0 && (options[0] !== '--' || options.slice(1).some((token) => token !== '--runInBand'))) return [];
    if (target === 'verify') return ['test', 'lint', 'typecheck', 'build'];
    return aliases.has(target) ? [aliases.get(target)] : [];
  }
  if (tokens[0] === 'bun') {
    if (tokens[1] === 'test') return [];
    if (tokens[1] === 'run') {
      const targetIndex = tokens[2] === '--cwd' && tokens.length >= 5 && /^[a-zA-Z0-9_./-]+$/u.test(tokens[3]) ? 4 : 2;
      const target = tokens[targetIndex];
      const options = tokens.slice(targetIndex + 1);
      if (options.length > 0) return [];
      return aliases.has(target) ? [aliases.get(target)] : [];
    }
    return [];
  }
  const cargoOptions = new Set(['--workspace', '--all', '--all-targets', '--release', '--locked', '--offline', '--quiet']);
  if (tokens[0] === 'cargo' && tokens.length >= 2 && tokens.slice(2).every((token) => cargoOptions.has(token))) {
    return {test: ['test'], clippy: ['lint'], check: ['typecheck'], build: ['build']}[tokens[1]] ?? [];
  }
  if (tokens[0] === 'pytest' && tokens.slice(1).every((token) => !token.startsWith('-') && /^[a-zA-Z0-9_./=-]+$/u.test(token))) return ['test'];
  const tscOptions = tokens[0] === 'npx' && tokens[1] === 'tsc' ? tokens.slice(2) : tokens[0] === 'tsc' ? tokens.slice(1) : null;
  if (tscOptions?.every((token) => token === '--noEmit')) return ['typecheck'];
  return [];
}

// Classifies the exact recorded-local-base merge required before final verification.
function baseMergeAction(command, cwd, state) {
  if (!state.callerRoot || !state.callerBranch) return false;
  const taskRoot = gitRoot(cwd);
  const taskBranch = gitBranch(cwd);
  if (!taskRoot || taskRoot === state.callerRoot || !taskBranch.startsWith('task/')) return false;
  if (state.taskRoot && (taskRoot !== state.taskRoot || taskBranch !== state.taskBranch)) return false;
  if (gitRoot(state.callerRoot) !== state.callerRoot || gitBranch(state.callerRoot) !== state.callerBranch) return false;
  return command.trim() === `git merge --no-edit ${state.callerBranch}`;
}

// Binds a fully verified clean task worktree to its exact current commit.
function bindCleanTaskHead(state) {
  if (!state.taskRoot || !state.taskBranch || !state.callerRoot || !state.callerBranch) return null;
  if (gitRoot(state.taskRoot) !== state.taskRoot || gitBranch(state.taskRoot) !== state.taskBranch) return null;
  if (gitRoot(state.callerRoot) !== state.callerRoot || gitBranch(state.callerRoot) !== state.callerBranch) return null;
  if (!['test', 'lint', 'typecheck', 'build'].every((gate) => state.verified?.includes(gate))) return null;
  const workspace = workspaceFingerprint(state.taskRoot);
  if (!workspace || workspace !== indexFingerprint(state.taskRoot) || workspace !== headTreeFingerprint(state.taskRoot)) return null;
  return gitHead(state.taskRoot);
}

// Classifies one exact guarded merge-back command for the current state.
function finalizeAction(command, cwd, state) {
  if (!state.taskRoot || !state.taskBranch || gitRoot(cwd) !== state.callerRoot || gitBranch(cwd) !== state.callerBranch) return null;
  const normalized = command.trim();
  const verified = ['test', 'lint', 'typecheck', 'build'].every((gate) => state.verified?.includes(gate));
  const unchanged = workspaceFingerprint(state.taskRoot) === state.verifiedFingerprint;
  const committed = state.verifiedTaskHead && gitHead(state.taskRoot) === state.verifiedTaskHead;
  const baseTip = gitHead(state.callerRoot);
  const baseMerged = state.baseMergedTip && baseTip === state.baseMergedTip && isAncestor(state.taskRoot, state.baseMergedTip, gitHead(state.taskRoot));
  if (verified && unchanged && committed && baseMerged && state.finalizePhase === undefined && normalized === `git merge --squash ${state.taskBranch}`) return 'squash';
  if (state.finalizePhase === 'squashed' && /^git\s+commit\s+-m\s+(?:"[^"\n]+"|'[^'\n]+'|[^\s]+)$/u.test(normalized)) return 'commit';
  if (state.finalizePhase === 'committed' && [
    `git worktree remove ${state.taskRoot}`,
    `git worktree remove "${state.taskRoot}"`,
    `git worktree remove '${state.taskRoot}'`,
  ].includes(normalized)) return 'remove';
  if (state.finalizePhase === 'removed' && normalized === `git branch -D ${state.taskBranch}`) return 'delete';
  return null;
}

// Classifies task-branch staging, commit, and read-only commands that preserve verified content.
function taskLifecycleAction(command, cwd, state) {
  if (!state.taskRoot || gitRoot(cwd) !== state.taskRoot || gitBranch(cwd) !== state.taskBranch) return null;
  if (!['test', 'lint', 'typecheck', 'build'].every((gate) => state.verified?.includes(gate))) return null;
  if (workspaceFingerprint(cwd) !== state.verifiedFingerprint) return null;
  const normalized = command.trim();
  if (/^git\s+add\s+(?:-A|--all|\.|[a-zA-Z0-9_./-]+(?:\s+[a-zA-Z0-9_./-]+)*)$/u.test(normalized)) return 'add';
  if (state.stagedFingerprint === state.verifiedFingerprint && /^git\s+commit\s+-m\s+(?:"[^"\n]+"|'[^'\n]+'|[^\s]+)$/u.test(normalized)) return 'taskCommit';
  if (/^git\s+(?:status(?:\s+--(?:short|porcelain(?:=v1)?|branch))*|diff(?:\s+--(?:stat|check|cached|staged))*)$/u.test(normalized)) return 'read';
  return null;
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

// Reports whether a post-tool payload carries no explicit failure result.
function toolSucceeded(payload) {
  const response = payload.tool_response ?? payload.tool_result ?? {};
  const exitCode = response.exit_code ?? response.exitCode ?? payload.exit_code;
  return exitCode === undefined ? response.success !== false && response.status !== 'failed' : Number(exitCode) === 0;
}

// Handles task activation and cleanup lifecycle events.
function handleLifecycle(payload, file) {
  if (payload.hook_event_name === 'PostToolUseFailure') {
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      delete state.pendingVerification;
      delete state.pendingFinalize;
      delete state.pendingTaskAction;
      delete state.pendingBaseMerge;
      delete state.pendingWorktree;
      writeFileSync(file, JSON.stringify(state));
    } catch {
      // Missing state needs no update.
    }
    return true;
  }
  if (payload.hook_event_name === 'PostToolUse') {
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '');
      if (state.pendingWorktree?.command === command) {
        if (toolSucceeded(payload)) {
          const taskRoot = gitRoot(state.pendingWorktree.path);
          const taskBranch = taskRoot ? gitBranch(taskRoot) : '';
          if (taskRoot && taskBranch === state.pendingWorktree.branch) {
            if (state.pendingWorktree.baseRoot !== state.callerRoot) {
              state.originalCallerRoot = state.callerRoot;
              state.callerRoot = state.pendingWorktree.baseRoot;
              state.callerBranch = state.pendingWorktree.baseBranch;
            }
            state.taskRoot = taskRoot;
            state.taskBranch = taskBranch;
          }
        }
        delete state.pendingWorktree;
      }
      if (toolSucceeded(payload) && state.pendingVerification?.command === command) {
        state.verified = [...new Set([...(state.verified ?? []), ...state.pendingVerification.gates])];
        state.verifiedFingerprint = workspaceFingerprint(state.taskRoot);
        state.verifiedTaskHead = bindCleanTaskHead(state) ?? undefined;
        delete state.stagedFingerprint;
        delete state.pendingVerification;
      }
      if (!toolSucceeded(payload) && state.pendingVerification?.command === command) delete state.pendingVerification;
      if (toolSucceeded(payload) && state.pendingBaseMerge?.command === command) {
        const baseTip = gitHead(state.callerRoot);
        if (baseTip) state.baseMergedTip = baseTip;
        else delete state.baseMergedTip;
        delete state.pendingBaseMerge;
      }
      if (!toolSucceeded(payload) && state.pendingBaseMerge?.command === command) delete state.pendingBaseMerge;
      if (toolSucceeded(payload) && state.pendingFinalize?.command === command) {
        const phases = {squash: 'squashed', commit: 'committed', remove: 'removed', delete: 'complete'};
        if (state.pendingFinalize.action !== 'remove' || !gitRoot(state.taskRoot)) {
          state.finalizePhase = phases[state.pendingFinalize.action];
        }
        delete state.pendingFinalize;
      }
      if (toolSucceeded(payload) && state.pendingTaskAction?.command === command) {
        if (state.pendingTaskAction.action === 'add') {
          if (workspaceFingerprint(state.taskRoot) === state.verifiedFingerprint && indexFingerprint(state.taskRoot) === state.verifiedFingerprint) {
            state.stagedFingerprint = state.verifiedFingerprint;
          } else delete state.stagedFingerprint;
        } else if (state.pendingTaskAction.action === 'taskCommit') {
          if (workspaceFingerprint(state.taskRoot) === state.verifiedFingerprint && headTreeFingerprint(state.taskRoot) === state.verifiedFingerprint) state.verifiedTaskHead = gitHead(state.taskRoot);
          else {
            delete state.verified;
            delete state.verifiedFingerprint;
            delete state.verifiedTaskHead;
          }
          delete state.stagedFingerprint;
        }
        delete state.pendingTaskAction;
      }
      writeFileSync(file, JSON.stringify(state));
    } catch {
      // Missing state needs no update.
    }
    return true;
  }
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
  writeFileSync(file, JSON.stringify({callerPath: cwd, callerRoot: gitRoot(cwd), callerBranch: gitBranch(cwd), activatedAt: new Date().toISOString()}));
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
  const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '');
  if (!['Bash', 'apply_patch', 'Edit', 'Write', 'MultiEdit'].includes(toolName)) return;

  const input = payload.tool_input ?? {};
  const cwd = resolve(input.workdir ?? input.cwd ?? payload.workdir ?? payload.cwd ?? process.cwd());
  if (toolName === 'Bash' && isBootstrapShell(command)) {
    const match = command.match(/(?:^|&&\s*)git(?:\s+-C\s+(?:"([^"$`]+)"|'([^'$`]+)'|([a-zA-Z0-9_./-]+)))?\s+worktree\s+add\s+-b\s+(task\/[a-zA-Z0-9._/-]+)\s+(?:"([^"$`]+)"|'([^'$`]+)'|([a-zA-Z0-9_./-]+))\s+HEAD/u);
    if (match) {
      if (state.taskRoot || state.pendingWorktree) {
        deny('TASK WORKTREE MISMATCH: this session is already bound to its task worktree.');
        return;
      }
      const baseDirectory = resolve(cwd, match[1] ?? match[2] ?? match[3] ?? '.');
      const baseRoot = gitRoot(baseDirectory);
      const branch = match[4];
      const path = resolve(baseDirectory, match[5] ?? match[6] ?? match[7]);
      writeFileSync(file, JSON.stringify({...state, pendingWorktree: {command, branch, path, baseRoot, baseBranch: gitBranch(baseRoot)}}));
    }
    return;
  }
  if (toolName === 'Bash') {
    if (baseMergeAction(command, cwd, state)) {
      const nextState = {...state, taskRoot: gitRoot(cwd), taskBranch: gitBranch(cwd), pendingBaseMerge: {command}};
      delete nextState.verified;
      delete nextState.verifiedFingerprint;
      delete nextState.verifiedTaskHead;
      delete nextState.stagedFingerprint;
      delete nextState.pendingVerification;
      delete nextState.baseMergedTip;
      writeFileSync(file, JSON.stringify(nextState));
      return;
    }
    const action = finalizeAction(command, cwd, state);
    if (action) {
      writeFileSync(file, JSON.stringify({...state, pendingFinalize: {action, command}}));
      return;
    }
    const taskAction = taskLifecycleAction(command, cwd, state);
    if (taskAction) {
      writeFileSync(file, JSON.stringify({...state, pendingTaskAction: {action: taskAction, command}}));
      return;
    }
  }

  const protectedPaths = [state.callerPath, state.originalCallerRoot, state.callerRoot].filter(Boolean);
  if (toolName === 'Bash' && (protectedPaths.some((path) => referencesPath(command, path)) || escapesShellDirectory(command))) {
    deny('TASK CALLER CHECKOUT IS READ-ONLY: the shell command references the protected caller root.');
    return;
  }

  const directories = toolDirectories(payload);
  if (state.taskRoot && directories.some((directory) => {
    const root = gitRoot(directory);
    return root && root !== state.taskRoot && gitBranch(directory).startsWith('task/');
  })) {
    deny('TASK WORKTREE MISMATCH: this session is bound to its first task worktree.');
    return;
  }
  const isolated = directories.every((directory) => {
    const root = gitRoot(directory);
    return state.taskRoot && root === state.taskRoot && root !== state.callerRoot && gitBranch(directory) === state.taskBranch;
  });
  if (isolated) {
    const taskRoot = gitRoot(directories[0]);
    const gates = toolName === 'Bash' ? verificationGates(command) : [];
    const nextState = {
      ...state,
      taskRoot,
      taskBranch: gitBranch(taskRoot),
    };
    if (gates.length > 0) {
      nextState.verified = (nextState.verified ?? []).filter((gate) => !gates.includes(gate));
      nextState.pendingVerification = {command, gates};
    } else {
      delete nextState.verified;
      delete nextState.verifiedFingerprint;
      delete nextState.verifiedTaskHead;
      delete nextState.stagedFingerprint;
      delete nextState.pendingVerification;
      delete nextState.finalizePhase;
      delete nextState.pendingFinalize;
      delete nextState.pendingTaskAction;
    }
    writeFileSync(file, JSON.stringify(nextState));
    return;
  }
  deny('TASK WORKTREE REQUIRED: create and use a task/* worktree before writing. The caller checkout is read-only.');
}

const payload = readPayload();
const sessionId = payload.session_id ?? payload.transcript_path ?? 'unknown-session';
const file = statePath(sessionId);
if (!handleLifecycle(payload, file)) enforce(payload, file);
