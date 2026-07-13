#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const runtime = /[/\\]codex[/\\]skills[/\\]/u.test(scriptPath) ? 'codex' : 'claude';
const verifierPath = join(homedir(), `.${runtime}`, 'skills', 'task', 'scripts', 'task-verify.mjs');
const creatorPath = join(homedir(), `.${runtime}`, 'skills', 'task', 'scripts', 'task-worktree-create.mjs');
const planCleanupPath = join(homedir(), `.${runtime}`, 'skills', 'task', 'scripts', 'task-worktree-plan-cleanup.mjs');
const stateDirectory = process.env.TASK_WORKTREE_GUARD_STATE_DIR ?? join(homedir(), `.${runtime}`, 'task-worktree-guard-state');
const stateTtlMilliseconds = 24 * 60 * 60 * 1000;

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
  return join(stateDirectory, `${createHash('sha256').update(String(sessionId)).digest('hex')}.json`);
}

// Returns a stable operating-system identity for one live process.
function processIdentity(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim() || null;
  } catch {
    return null;
  }
}

// Writes session state while refreshing its inactivity timestamp.
function persistState(file, state) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({...state, updatedAt: new Date().toISOString()}));
  renameSync(temporary, file);
}

// Reads either the atomic file-lock format or a legacy directory owner marker.
function readLockOwner(lock) {
  const ownerPath = lstatSync(lock).isDirectory() ? join(lock, 'owner.json') : lock;
  return JSON.parse(readFileSync(ownerPath, 'utf8'));
}

// Reports whether a recorded lock owner is still the same live process.
function lockOwnerIsLive(owner) {
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
  const identity = processIdentity(owner.pid);
  return !owner.identity || !identity || owner.identity === identity;
}

// Serializes hook transitions with an atomic file lock and recovers legacy locks safely.
function withSessionLock(file, callback) {
  mkdirSync(stateDirectory, {recursive: true});
  const lock = `${file}.lock`;
  const token = randomUUID();
  const owner = {pid: process.pid, identity: processIdentity(process.pid), token};
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      writeFileSync(lock, JSON.stringify(owner), {flag: 'wx'});
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let observed;
      try {
        observed = readLockOwner(lock);
      } catch {
        try {
          if (Date.now() - statSync(lock).mtimeMs <= 250) observed = null;
          else observed = {token: null};
        } catch (statError) {
          if (statError.code === 'ENOENT') continue;
          throw statError;
        }
      }
      if (observed && (observed.token === null || !lockOwnerIsLive(observed))) {
        const retired = `${lock}.stale-${token}`;
        try {
          renameSync(lock, retired);
        } catch (recoveryError) {
          if (recoveryError.code === 'ENOENT') continue;
          throw recoveryError;
        }
        let changedOwner = false;
        try {
          const retiredOwner = readLockOwner(retired);
          changedOwner = observed.token !== null && retiredOwner.token !== observed.token;
          if (observed.token === null && lockOwnerIsLive(retiredOwner)) changedOwner = true;
        } catch {
          // A still-markerless retired legacy lock has no owner to preserve.
        }
        if (changedOwner) {
          try {
            renameSync(retired, lock);
          } catch {
            // A newer lock wins; the independently owned retired lock is preserved.
          }
        } else rmSync(retired, {recursive: true, force: true});
        continue;
      }
      if (Date.now() >= deadline) {
        deny('TASK WORKTREE BUSY: another hook transition is still updating this session. Retry the command.');
        return;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    callback();
  } finally {
    try {
      if (readLockOwner(lock).token === token) rmSync(lock, {recursive: true, force: true});
    } catch {
      // A recovered or already-released lock is never removed by a former owner.
    }
  }
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

// Resolves one branch ref without requiring its worktree to exist.
function gitRef(directory, branch) {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', `refs/heads/${branch}`], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return null;
  }
}

// Resolves one arbitrary Git revision without requiring a branch name.
function gitRevision(directory, revision) {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', revision], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
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
          const dirty = execFileSync('git', ['-C', submodule, 'status', '--porcelain', '--untracked-files=normal', '--ignore-submodules=none'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
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

// Detects only the explicit task plan-only mode token.
function invokesPlanOnly(prompt) {
  return /(?:^|\s)(?:\$|\/)task\s+plan-only(?:\s|$)/u.test(prompt);
}

// Detects an explicit request to release an abandoned task guard.
function cancelsTask(prompt) {
  return /^(?:\$|\/)?task-cancel$/u.test(prompt.trim());
}

// Reports whether persisted session state is too old or no longer names its bound worktree.
function isStaleState(state) {
  const updatedAt = Date.parse(state.updatedAt ?? state.activatedAt);
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > stateTtlMilliseconds) return true;
  if (!state.taskRoot) return false;
  if (['removed', 'planRemoved'].includes(state.finalizePhase) && !gitRoot(state.taskRoot)) return false;
  return gitRoot(state.taskRoot) !== state.taskRoot;
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

// Parses the one-command task worktree creator invocation without allowing shell composition.
function taskCreatorInvocation(command, cwd) {
  const normalized = command.trim();
  if (/[;&|\n>`$()]/u.test(normalized)) return null;
  const match = normalized.match(/^node\s+(\S+)\s+([a-z0-9][a-z0-9._-]*)\s+--id\s+([a-z0-9][a-z0-9._-]*)(?:\s+--repo\s+(?:"([^"`$]+)"|'([^'`$]+)'|([a-zA-Z0-9_./-]+)))?(?:\s+--summary\s+(?:"([^"`$]+)"|'([^'`$]+)'|([^\s;&|>`$()]+)))?(\s+--plan-only)?$/u);
  if (!match || ![creatorPath, `~/.${runtime}/skills/task/scripts/task-worktree-create.mjs`].includes(match[1])) return null;
  return {slug: match[2], id: match[3], repository: resolve(cwd, match[4] ?? match[5] ?? match[6] ?? '.'), planOnly: Boolean(match[10])};
}

// Binds a newly-created worktree even when dependency preparation returned failure.
function bindCreatedWorktree(state) {
  if (!state.pendingCreator) return;
  const taskRoot = gitRoot(state.pendingCreator.path);
  const taskBranch = taskRoot ? gitBranch(taskRoot) : '';
  let creatorState = '';
  try {
    creatorState = readFileSync(join(state.pendingCreator.path, '.agent-tmp', 'task-state.md'), 'utf8');
  } catch {
    // A creator that failed before state creation remains unbound.
  }
  const bound = taskRoot === state.pendingCreator.path
    && taskBranch === state.pendingCreator.branch
    && gitHead(taskRoot) === state.pendingCreator.baseHead
    && creatorState.includes(`- creator id: ${state.pendingCreator.id}\n`)
    && creatorState.includes(`- guard nonce: ${state.pendingCreator.nonce}\n`);
  const attached = taskRoot === state.pendingCreator.path
    && taskBranch === state.pendingCreator.branch
    && gitHead(taskRoot) === state.pendingCreator.baseHead;
  if (attached && !bound) return;
  if (bound) {
    if (state.pendingCreator.baseRoot !== state.callerRoot) {
      state.originalCallerRoot = state.callerRoot;
      state.callerRoot = state.pendingCreator.baseRoot;
      state.callerBranch = state.pendingCreator.baseBranch;
    }
    state.taskRoot = taskRoot;
    state.taskBranch = taskBranch;
    state.taskCreationHead = state.pendingCreator.baseHead;
    state.planOnly = state.pendingCreator.planOnly;
  }
  if (!bound && gitRef(state.pendingCreator.baseRoot, state.pendingCreator.branch) === state.pendingCreator.baseHead) {
    try {
      execFileSync('git', ['-C', state.pendingCreator.baseRoot, 'update-ref', '-d', `refs/heads/${state.pendingCreator.branch}`, state.pendingCreator.baseHead], {stdio: 'ignore'});
    } catch {
      // A changed reservation ref is not deleted during failed-creator cleanup.
    }
  }
  rmSync(state.pendingCreator.reservationPath, {force: true});
  delete state.pendingCreator;
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
function verificationGates(command, state) {
  const normalized = command.trim().replace(/^cd\s+(?:"[^"$`]+"|'[^'$`]+'|[a-zA-Z0-9_./-]+)\s*&&\s*/u, '');
  if (!normalized || /[;&|\n]/u.test(normalized)) return [];
  const tokens = normalized.split(/\s+/u);
  if (tokens.some((token) => ['--help', '-h', '--version', '-V', '--no-run', '--collect-only', '--showConfig'].includes(token))) return [];
  if (
    tokens[0] === 'node'
    && [verifierPath, `~/.${runtime}/skills/task/scripts/task-verify.mjs`].includes(tokens[1])
    && tokens.length === 4
    && tokens[2] === '--base'
    && tokens[3] === state.callerBranch
  ) return ['test', 'lint', 'typecheck', 'build'];
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
  const callerIndexClean = indexFingerprint(state.callerRoot) === headTreeFingerprint(state.callerRoot);
  if (verified && unchanged && committed && baseMerged && callerIndexClean && state.finalizePhase === undefined && normalized === `git merge --squash ${state.taskBranch}`) return 'squash';
  if (state.finalizePhase === 'squashed' && state.squashedFingerprint && indexFingerprint(state.callerRoot) === state.squashedFingerprint && /^git\s+commit\s+-m\s+(?:"[^"\n]+"|'[^'\n]+'|[^\s]+)$/u.test(normalized)) return 'commit';
  const taskRefStable = state.verifiedTaskHead && gitRef(state.callerRoot, state.taskBranch) === state.verifiedTaskHead;
  const mergedBaseStable = state.mergedBaseHead && gitHead(state.callerRoot) === state.mergedBaseHead;
  if (state.finalizePhase === 'committed' && taskRefStable && mergedBaseStable && [
    `git worktree remove ${state.taskRoot}`,
    `git worktree remove "${state.taskRoot}"`,
    `git worktree remove '${state.taskRoot}'`,
  ].includes(normalized)) return 'remove';
  if (state.finalizePhase === 'removed' && taskRefStable && mergedBaseStable && normalized === `git update-ref -d refs/heads/${state.taskBranch} ${state.verifiedTaskHead}`) return 'delete';
  return null;
}

// Classifies cleanup for a plan-only worktree that never diverged from its base.
function planCleanupAction(command, cwd, state) {
  if (!state.planOnly || !state.taskRoot || !state.taskBranch || !state.taskCreationHead || gitRoot(cwd) !== state.callerRoot || gitBranch(cwd) !== state.callerBranch) return null;
  const normalized = command.trim();
  if (state.finalizePhase !== undefined || gitHead(state.taskRoot) !== state.taskCreationHead) return null;
  const workspace = workspaceFingerprint(state.taskRoot);
  if (!workspace || workspace !== indexFingerprint(state.taskRoot) || workspace !== headTreeFingerprint(state.taskRoot)) return null;
  return [planCleanupPath, `~/.${runtime}/skills/task/scripts/task-worktree-plan-cleanup.mjs`]
    .some((script) => normalized === `node ${script} --repo ${JSON.stringify(state.callerRoot)} --worktree ${JSON.stringify(state.taskRoot)} --branch ${state.taskBranch} --head ${state.taskCreationHead}`)
    ? 'planCleanup'
    : null;
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
      const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '');
      if (state.pendingVerification?.command === command) delete state.pendingVerification;
      if (state.pendingFinalize?.command === command) delete state.pendingFinalize;
      if (state.pendingTaskAction?.command === command) delete state.pendingTaskAction;
      if (state.pendingBaseMerge?.command === command) delete state.pendingBaseMerge;
      if (state.pendingWorktree?.command === command) delete state.pendingWorktree;
      if (state.pendingCreator?.command === command) {
        bindCreatedWorktree(state);
        if (state.pendingCreator) state.pendingCreator.retryable = true;
      }
      persistState(file, state);
    } catch {
      // Missing state needs no update.
    }
    return true;
  }
  if (payload.hook_event_name === 'PostToolUse') {
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '');
      if (state.pendingCreator?.command === command) bindCreatedWorktree(state);
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
            state.taskCreationHead = state.pendingWorktree.baseHead;
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
        const phases = {squash: 'squashed', commit: 'committed', remove: 'removed', delete: 'complete', planCleanup: 'complete'};
        if (state.pendingFinalize.action === 'squash') {
          const expected = headTreeFingerprint(state.taskRoot);
          let actual = indexFingerprint(state.callerRoot);
          if (expected && actual !== expected) {
            try {
              execFileSync('git', ['-C', state.callerRoot, 'read-tree', state.verifiedTaskHead], {stdio: 'ignore'});
              actual = indexFingerprint(state.callerRoot);
            } catch {
              // A failed safe index repair leaves finalization unavailable.
            }
          }
          if (expected && actual === expected) {
            state.finalizePhase = 'squashed';
            state.squashedFingerprint = actual;
          } else {
            delete state.finalizePhase;
            delete state.squashedFingerprint;
          }
        } else if (state.pendingFinalize.action === 'commit') {
          const committedTree = headTreeFingerprint(state.callerRoot);
          const committedParent = gitRevision(state.callerRoot, 'HEAD^');
          if (state.squashedFingerprint && committedTree === state.squashedFingerprint && committedParent === state.pendingFinalize.preCommitHead) {
            state.finalizePhase = 'committed';
            state.mergedBaseHead = gitHead(state.callerRoot);
          } else {
            try {
              execFileSync('git', ['-C', state.callerRoot, 'reset', '--mixed', state.pendingFinalize.preCommitHead], {stdio: 'ignore'});
              execFileSync('git', ['-C', state.callerRoot, 'read-tree', state.verifiedTaskHead], {stdio: 'ignore'});
            } catch {
              // A failed safe commit rollback leaves finalization unavailable.
            }
            if (gitHead(state.callerRoot) === state.pendingFinalize.preCommitHead && indexFingerprint(state.callerRoot) === state.squashedFingerprint) state.finalizePhase = 'squashed';
            else {
              delete state.finalizePhase;
              delete state.squashedFingerprint;
            }
          }
        } else if (state.pendingFinalize.action === 'remove') {
          if (!gitRoot(state.taskRoot) && gitRef(state.callerRoot, state.taskBranch) === state.verifiedTaskHead && gitHead(state.callerRoot) === state.mergedBaseHead) state.finalizePhase = 'removed';
        } else {
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
      persistState(file, state);
    } catch {
      // Missing state needs no update.
    }
    return true;
  }
  if (payload.hook_event_name === 'Stop') {
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      bindCreatedWorktree(state);
      if (state.pendingCreator) state.pendingCreator.retryable = true;
      if (state.taskRoot && !gitRoot(state.taskRoot) && !['removed', 'planRemoved'].includes(state.finalizePhase)) rmSync(file, {force: true});
      else persistState(file, {...state, stopped: true});
    } catch {
      // Missing state needs no cleanup.
    }
    return true;
  }
  if (payload.hook_event_name !== 'UserPromptSubmit') return false;
  const prompt = String(payload.prompt ?? payload.user_prompt ?? '');
  if (cancelsTask(prompt)) {
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      bindCreatedWorktree(state);
      if (state.pendingCreator) {
        state.pendingCreator.retryable = true;
        persistState(file, state);
        process.stderr.write('TASK WORKTREE RECOVERY REQUIRED: the creator attached a worktree before interruption; rerun the same creator command to finish setup.\n');
        return true;
      }
    } catch {
      // Missing state has no pending reservation to release.
    }
    rmSync(file, {force: true});
    return true;
  }
  if (!invokesTask(prompt)) {
    return true;
  }
  try {
    const active = JSON.parse(readFileSync(file, 'utf8'));
    const liveTask = active.taskRoot && gitRoot(active.taskRoot) === active.taskRoot && !['complete', 'removed', 'planRemoved'].includes(active.finalizePhase);
    if (liveTask || active.pendingCreator || active.pendingWorktree) {
      persistState(file, active);
      return true;
    }
    rmSync(file, {force: true});
  } catch {
    // A first task activation has no prior state to preserve.
  }
  const cwd = resolve(payload.cwd ?? process.cwd());
  mkdirSync(stateDirectory, {recursive: true});
  persistState(file, {callerPath: cwd, callerRoot: gitRoot(cwd), callerBranch: gitBranch(cwd), planOnly: invokesPlanOnly(prompt), activatedAt: new Date().toISOString()});
  return true;
}

// Blocks task writes unless every target belongs to a task worktree.
function enforce(payload, file) {
  let state;
  try {
    state = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    const toolName = String(payload.tool_name ?? '');
    const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '');
    const cwd = resolve(payload.tool_input?.workdir ?? payload.tool_input?.cwd ?? payload.workdir ?? payload.cwd ?? process.cwd());
    if (toolName !== 'Bash' || !taskCreatorInvocation(command, cwd)) return;
    state = {callerPath: cwd, callerRoot: gitRoot(cwd), callerBranch: gitBranch(cwd), activatedAt: new Date().toISOString()};
    persistState(file, state);
  }
  if (isStaleState(state)) {
    bindCreatedWorktree(state);
    if (state.pendingCreator) {
      state.pendingCreator.retryable = true;
      persistState(file, state);
      deny('TASK WORKTREE RECOVERY REQUIRED: rerun the same creator command to finish the attached worktree setup.');
      return;
    }
    rmSync(file, {force: true});
    return;
  }

  const toolName = String(payload.tool_name ?? '');
  const command = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? '');
  if (!['Bash', 'apply_patch', 'Edit', 'Write', 'MultiEdit'].includes(toolName)) return;

  const input = payload.tool_input ?? {};
  const cwd = resolve(input.workdir ?? input.cwd ?? payload.workdir ?? payload.cwd ?? process.cwd());
  const pendingShellTransitions = [state.pendingVerification, state.pendingFinalize, state.pendingTaskAction, state.pendingBaseMerge, state.pendingWorktree].filter(Boolean);
  if (toolName === 'Bash' && [state.taskRoot, state.callerRoot].includes(gitRoot(cwd)) && pendingShellTransitions.some((pending) => pending.command === command)) {
    deny('TASK WORKTREE BUSY: this exact lifecycle command is already awaiting its hook result.');
    return;
  }
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
      persistState(file, {...state, pendingWorktree: {command, branch, path, baseRoot, baseBranch: gitBranch(baseRoot), baseHead: gitHead(baseRoot)}});
    }
    return;
  }
  if (toolName === 'Bash') {
    const creator = taskCreatorInvocation(command, cwd);
    if (creator) {
      if (state.pendingCreator?.command === command) {
        if (state.pendingCreator.retryable) {
          delete state.pendingCreator.retryable;
          persistState(file, state);
          return;
        }
        deny('TASK WORKTREE BUSY: this creator command is already running. Wait for its hook result before retrying.');
        return;
      }
      if (state.taskRoot || state.pendingCreator) {
        deny('TASK WORKTREE MISMATCH: this session is already bound to its task worktree.');
        return;
      }
      const baseRoot = gitRoot(creator.repository);
      if (!baseRoot) {
        deny('TASK WORKTREE REQUIRED: --repo must name a Git repository.');
        return;
      }
      const expectedPath = join(dirname(baseRoot), `${basename(baseRoot)}-task-${creator.slug}-${creator.id}`);
      const branch = `task/${creator.slug}-${creator.id}`;
      if (gitRoot(expectedPath) || gitRef(baseRoot, branch)) {
        deny('TASK CREATOR ID COLLISION: choose a new unique --id; existing worktree or branch was not rebound.');
        return;
      }
      const reservationDirectory = join(execFileSync('git', ['-C', baseRoot, 'rev-parse', '--absolute-git-dir'], {encoding: 'utf8'}).trim(), 'task-worktree-reservations');
      const reservationPath = join(reservationDirectory, `${creator.slug}-${creator.id}.nonce`);
      const nonce = randomUUID();
      const baseHead = gitHead(baseRoot);
      const baseBranch = gitBranch(baseRoot);
      let createdReservation = false;
      try {
        mkdirSync(reservationDirectory, {recursive: true});
        writeFileSync(reservationPath, `${JSON.stringify({nonce, baseHead, baseBranch})}\n`, {flag: 'wx'});
        createdReservation = true;
        execFileSync('git', ['-C', baseRoot, 'update-ref', `refs/heads/${branch}`, baseHead, '0000000000000000000000000000000000000000'], {stdio: 'ignore'});
      } catch {
        if (createdReservation) {
          try {
            if (JSON.parse(readFileSync(reservationPath, 'utf8')).nonce === nonce) rmSync(reservationPath, {force: true});
          } catch {
            // A replaced or already-removed reservation belongs to another transition.
          }
        }
        deny('TASK WORKTREE REQUIRED: could not reserve the requested creator id. Choose a new unique id.');
        return;
      }
      persistState(file, {...state, pendingCreator: {
        command,
        slug: creator.slug,
        id: creator.id,
        baseRoot,
        baseBranch,
        baseHead,
        branch,
        path: expectedPath,
        planOnly: creator.planOnly || state.planOnly,
        nonce,
        reservationPath,
      }});
      return;
    }
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
      persistState(file, nextState);
      return;
    }
    const action = finalizeAction(command, cwd, state);
    if (action) {
      persistState(file, {...state, pendingFinalize: {action, command, ...(action === 'squash' ? {preMergeHead: gitHead(state.callerRoot)} : {}), ...(action === 'commit' ? {preCommitHead: gitHead(state.callerRoot)} : {})}});
      return;
    }
    const planAction = planCleanupAction(command, cwd, state);
    if (planAction) {
      persistState(file, {...state, pendingFinalize: {action: planAction, command}});
      return;
    }
    if (/^git\s+merge\s+--squash\s+task\//u.test(command.trim())) {
      deny(`TASK VERIFICATION REQUIRED: merge-back is not ready. From the task worktree run \`node ~/.${runtime}/skills/task/scripts/task-verify.mjs --base <base>\`, resolve every red or soft-skipped gate, commit the verified content, then retry merge.`);
      return;
    }
    const taskAction = taskLifecycleAction(command, cwd, state);
    if (taskAction) {
      persistState(file, {...state, pendingTaskAction: {action: taskAction, command}});
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
    const gates = toolName === 'Bash' ? verificationGates(command, state) : [];
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
    persistState(file, nextState);
    return;
  }
  deny('TASK WORKTREE REQUIRED: create and use a task/* worktree before writing. The caller checkout is read-only.');
}

const payload = readPayload();
const sessionId = payload.session_id ?? payload.transcript_path;
if (sessionId) {
  const file = statePath(sessionId);
  withSessionLock(file, () => {
    if (!handleLifecycle(payload, file)) enforce(payload, file);
  });
}
