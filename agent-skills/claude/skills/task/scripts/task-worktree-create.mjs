#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, closeSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync} from 'node:fs';
import {basename, dirname, join, posix, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const gitOutputMaxBuffer = 256 * 1024 * 1024;

const [slug, ...extraArgs] = process.argv.slice(2);
if (!slug || !/^[a-z0-9][a-z0-9._-]*$/u.test(slug)) {
  throw new Error('Usage: task-worktree-create.mjs <lowercase-safe-slug> [--id <unique-id>] [--repo <path>] [--summary <text>] [--plan-only]');
}
let requestedRepository = process.cwd();
let taskSummary = slug;
let taskId;
let planOnly = false;
const seenOptions = new Set();
for (let offset = 0; offset < extraArgs.length;) {
  const option = extraArgs[offset];
  if (option === '--plan-only') {
    if (seenOptions.has(option)) throw new Error('--plan-only may appear only once');
    seenOptions.add(option);
    planOnly = true;
    offset += 1;
    continue;
  }
  const value = extraArgs[offset + 1];
  if (!['--id', '--repo', '--summary'].includes(option) || value === undefined || seenOptions.has(option)) {
    throw new Error('Usage: task-worktree-create.mjs <lowercase-safe-slug> [--id <unique-id>] [--repo <path>] [--summary <text>] [--plan-only]');
  }
  seenOptions.add(option);
  if (option === '--id') {
    if (!/^[a-z0-9][a-z0-9._-]*$/u.test(value)) throw new Error('--id must be lowercase and filesystem-safe');
    taskId = value;
  } else if (option === '--repo') requestedRepository = value;
  else if (!value.trim()) throw new Error('--summary must not be empty');
  else taskSummary = value;
  offset += 2;
}

// Runs a command and throws an actionable error when it cannot complete.
function run(command, args, cwd) {
  process.stdout.write(`[task-worktree] ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', env: process.env});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error?.code === 'ENOENT') throw new Error(`${command} is required to prepare dependencies in ${cwd}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in ${cwd} with exit ${result.status ?? 1}`);
  return result.stdout.trim();
}

// Returns one Git command's trimmed output without logging it.
function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {encoding: 'utf8', maxBuffer: gitOutputMaxBuffer});
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed in ${cwd}`);
  return result.stdout.trim();
}

// Formats a UTC timestamp suitable for branch and directory names.
function timestamp() {
  return new Date().toISOString().replace(/[-:.]/gu, '').replace('T', '-');
}

// Writes recoverable ownership and setup status for the created task worktree.
function writeState(worktree, values) {
  const directory = join(worktree, '.agent-tmp');
  try {
    if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('.agent-tmp must be a real directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  mkdirSync(directory, {recursive: true});
  const statePath = join(directory, 'task-state.md');
  try {
    if (!lstatSync(statePath).isFile() || lstatSync(statePath).isSymbolicLink()) throw new Error('task-state.md must be a regular file');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const lines = Object.entries(values).map(([key, value]) => `- ${key}: ${String(value).replace(/[\r\n]+/gu, ' ')}`);
  writeFileSync(statePath, `# Task state\n\n${lines.join('\n')}\n`);
}

// Reads labeled values from an existing retained task state file.
function readState(worktree) {
  const stateDirectory = join(worktree, '.agent-tmp');
  const statePath = join(worktree, '.agent-tmp', 'task-state.md');
  if (!lstatSync(stateDirectory).isDirectory() || lstatSync(stateDirectory).isSymbolicLink()
    || !lstatSync(statePath).isFile() || lstatSync(statePath).isSymbolicLink()) {
    throw new Error('Retained task-state.md must be a regular file');
  }
  return new Map(readFileSync(statePath, 'utf8').split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^- ([^:]+): (.*)$/u);
    return match ? [[match[1], match[2]]] : [];
  }));
}

// Atomically claims setup retry ownership and reclaims locks owned by dead processes.
function acquireResumeLock(lockPath) {
  let reclaimed = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidatePath = `${lockPath}.${process.pid}.${process.hrtime.bigint()}`;
    try {
      writeFileSync(candidatePath, `${JSON.stringify({pid: process.pid, created: new Date().toISOString()})}\n`, {flag: 'wx', mode: 0o600});
      try {
        linkSync(candidatePath, lockPath);
      } finally {
        rmSync(candidatePath, {force: true});
      }
      const fd = openSync(lockPath, 'r');
      return {fd, reclaimed};
    } catch (error) {
      rmSync(candidatePath, {force: true});
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(readFileSync(lockPath, 'utf8'));
      } catch {
        throw new Error('Existing failed task setup has an invalid resume lock');
      }
      if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Existing failed task setup has an invalid resume lock');
      try {
        process.kill(owner.pid, 0);
        throw new Error('Existing failed task setup is already being resumed');
      } catch (processError) {
        if (processError.message === 'Existing failed task setup is already being resumed' || processError.code === 'EPERM') {
          throw new Error('Existing failed task setup is already being resumed');
        }
        if (processError.code !== 'ESRCH') throw processError;
      }
      try {
        unlinkSync(lockPath);
        reclaimed = true;
      } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      }
    }
  }
  throw new Error('Existing failed task setup resume lock changed concurrently');
}

// Refuses repositories that already own the task-local state namespace.
function assertStateNamespaceUntracked(repository) {
  const files = git(repository, ['ls-files', '-z']).split('\0').filter(Boolean);
  if (files.some((file) => file.split('/')[0].toLocaleLowerCase('en-US') === '.agent-tmp')) {
    throw new Error('Task worktree creation requires .agent-tmp to be untracked without case-folded collisions');
  }
}

// Fingerprints ignored setup artifacts while excluding the task state record itself.
function ignoredFingerprint(worktree) {
  const files = git(worktree, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])
    .split('\0').filter((file) => file && file !== '.agent-tmp/task-state.md').sort();
  const entries = [];
  for (let offset = 0; offset < files.length; offset += 200) {
    const batch = files.slice(offset, offset + 200);
    const result = spawnSync('git', ['-C', worktree, 'hash-object', '--', ...batch], {encoding: 'utf8'});
    if (result.status !== 0) throw new Error(result.stderr.trim() || `could not fingerprint ignored setup files in ${worktree}`);
    const hashes = result.stdout.trim().split('\n').filter(Boolean);
    if (hashes.length !== batch.length) throw new Error(`ignored setup files changed while fingerprinting ${worktree}`);
    entries.push(...batch.map((file, index) => {
      const stat = lstatSync(join(worktree, file));
      const type = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other';
      return `${file}\0${type}\0${stat.mode & 0o7777}\0${hashes[index]}`;
    }));
  }
  return createHash('sha256').update(entries.join('\0')).digest('hex');
}

// Keeps task-local state out of Git status without changing tracked caller files.
function ensureAgentTempIgnored(worktree) {
  const check = spawnSync('git', ['-C', worktree, 'check-ignore', '-q', '.agent-tmp/task-state.md']);
  if (check.status === 0) return;
  const excludePath = git(worktree, ['rev-parse', '--git-path', 'info/exclude']);
  const contents = readFileSync(excludePath, 'utf8');
  if (!contents.split(/\r?\n/u).includes('.agent-tmp/')) appendFileSync(excludePath, `${contents.endsWith('\n') ? '' : '\n'}.agent-tmp/\n`);
}

// Lists the initialized superproject and recursive submodule repository roots.
function repositoryRoots(worktree) {
  const result = spawnSync('git', ['-C', worktree, 'submodule', 'foreach', '--quiet', '--recursive', 'printf "%s\\0" "$toplevel/$sm_path"'], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr.trim() || `could not inspect recursive submodules in ${worktree}`);
  return [worktree, ...result.stdout.split('\0').filter(Boolean)];
}

// Fingerprints ignored artifacts across the superproject and recursive submodules.
function recursiveIgnoredFingerprint(worktree) {
  const entries = repositoryRoots(worktree).map((repository) => {
    const path = relative(worktree, repository).split('\\').join('/') || '.';
    return `${path}\0${ignoredFingerprint(repository)}`;
  });
  return createHash('sha256').update(entries.sort().join('\0')).digest('hex');
}

// Builds one slash-separated tracked path independently of the host OS.
function trackedPath(directory, name) {
  return directory === '.' ? name : posix.join(directory, name);
}

// Selects deterministic dependency installation commands from one Git repository.
function repositoryDependencyCommands(repository) {
  const files = git(repository, ['ls-files', '-z']).split('\0').filter(Boolean);
  const lockNames = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']);
  const javascriptLocks = new Map();
  const commands = [];
  for (const file of files) {
    const name = posix.basename(file);
    const relativeDirectory = posix.dirname(file);
    const directory = join(repository, ...relativeDirectory.split('/'));
    if (lockNames.has(name)) {
      const existing = javascriptLocks.get(relativeDirectory);
      if (existing) throw new Error(`conflicting JavaScript lockfiles: ${existing} and ${file}`);
      javascriptLocks.set(relativeDirectory, file);
      if (!files.includes(trackedPath(relativeDirectory, 'package.json'))) {
        throw new Error(`${file} requires a tracked package.json in the same directory`);
      }
      if (name === 'package-lock.json' || name === 'npm-shrinkwrap.json') commands.push(['npm', ['ci', '--ignore-scripts'], directory]);
      else if (name === 'pnpm-lock.yaml') commands.push(['pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], directory]);
      else if (name === 'bun.lock' || name === 'bun.lockb') commands.push(['bun', ['install', '--frozen-lockfile', '--ignore-scripts'], directory]);
      else {
        const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
        const berry = files.includes(trackedPath(relativeDirectory, '.yarnrc.yml')) || /^yarn@(?:[2-9]|\d{2,})/u.test(manifest.packageManager ?? '');
        commands.push(['yarn', berry ? ['install', '--immutable', '--mode=skip-build'] : ['install', '--frozen-lockfile', '--ignore-scripts'], directory]);
      }
    } else if (name === 'Cargo.lock') {
      if (!files.includes(trackedPath(relativeDirectory, 'Cargo.toml'))) throw new Error(`${file} requires a tracked Cargo.toml in the same directory`);
      commands.push(['cargo', ['fetch', '--locked'], directory]);
    } else if (name === 'pubspec.lock') {
      if (!files.includes(trackedPath(relativeDirectory, 'pubspec.yaml'))) throw new Error(`${file} requires a tracked pubspec.yaml in the same directory`);
      const manifest = readFileSync(join(directory, 'pubspec.yaml'), 'utf8');
      commands.push([/(?:^|\n)\s*flutter:\s*(?:\n|$)|sdk:\s*flutter/u.test(manifest) ? 'flutter' : 'dart', ['pub', 'get', '--enforce-lockfile'], directory]);
    }
  }
  return commands.sort((left, right) => left[2].localeCompare(right[2]) || left[0].localeCompare(right[0]));
}

// Selects deterministic dependency commands across the superproject and recursive submodules.
function dependencyCommands(worktree) {
  return repositoryRoots(worktree).flatMap((repository) => repositoryDependencyCommands(repository))
    .sort((left, right) => left[2].localeCompare(right[2]) || left[0].localeCompare(right[0]));
}

const caller = git(requestedRepository, ['rev-parse', '--show-toplevel']);
const callerBranch = git(caller, ['branch', '--show-current']);
git(caller, ['rev-parse', '--verify', 'HEAD']);
assertStateNamespaceUntracked(caller);

const suffix = taskId ?? timestamp();
const taskBranch = `task/${slug}-${suffix}`;
const worktree = join(dirname(caller), `${basename(caller)}-task-${slug}-${suffix}`);
const originalCaller = realpathSync(process.cwd());
const runtime = /[/\\]claude[/\\]skills[/\\]/u.test(fileURLToPath(import.meta.url)) ? 'claude' : 'codex';
const sessionId = process.env.CODEX_THREAD_ID ?? process.env.CODEX_SESSION_ID ?? process.env.CLAUDE_SESSION_ID;
const reservationPath = join(git(caller, ['rev-parse', '--absolute-git-dir']), 'task-worktree-reservations', `${slug}-${suffix}.nonce`);
let reservationNonce;
let reservationBaseHead;
let reservationBaseBranch;
try {
  const reservation = readFileSync(reservationPath, 'utf8').trim();
  try {
    const parsed = JSON.parse(reservation);
    reservationNonce = parsed.nonce;
    reservationBaseHead = parsed.baseHead;
    reservationBaseBranch = parsed.baseBranch;
  } catch {
    reservationNonce = reservation;
  }
} catch {
  // Unguarded use creates its own branch normally.
}
const baseBranch = reservationBaseBranch ?? callerBranch;
if (!baseBranch) throw new Error('Task worktree creation requires an attached base branch or a guarded base reservation');
let retainedState;
let retainedHead;
let resumeLockPath;
let resumeLockFd;
if (reservationNonce) {
  const reservedHead = reservationBaseHead ?? git(caller, ['rev-parse', `refs/heads/${taskBranch}`]);
  if (!/^[0-9a-f]{40,64}$/u.test(reservedHead) || git(caller, ['rev-parse', `refs/heads/${taskBranch}`]) !== reservedHead) {
    throw new Error('Guard-reserved task branch no longer matches its reserved base');
  }
  const existing = spawnSync('git', ['-C', worktree, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'});
  if (existing.status === 0) {
    if (existing.stdout.trim() !== realpathSync(worktree)
      || git(worktree, ['branch', '--show-current']) !== taskBranch
      || git(worktree, ['rev-parse', 'HEAD']) !== reservedHead) {
      throw new Error('Existing task worktree does not match the guard reservation');
    }
  } else {
    run('git', ['-C', caller, 'worktree', 'add', worktree, taskBranch], caller);
  }
} else {
  const existing = spawnSync('git', ['-C', worktree, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'});
  if (existing.status === 0) {
    retainedState = readState(worktree);
    retainedHead = git(worktree, ['rev-parse', 'HEAD']);
    const retainedOwner = retainedState.get('owner') ?? '';
    const expectedOwner = sessionId ? `${runtime}:${sessionId}` : null;
    const fallbackOwnerSuffix = `:${originalCaller}:${taskSummary}`;
    if (existing.stdout.trim() !== realpathSync(worktree)
      || git(worktree, ['branch', '--show-current']) !== taskBranch
      || retainedHead !== git(caller, ['rev-parse', `refs/heads/${taskBranch}`])
      || git(worktree, ['status', '--porcelain=v1'])
      || !['failed', 'in-progress'].includes(retainedState.get('setup'))
      || retainedState.get('base branch') !== baseBranch
      || retainedState.get('task branch') !== taskBranch
      || retainedState.get('worktree path') !== worktree
      || retainedState.get('original caller path') !== originalCaller
      || retainedState.get('task summary') !== taskSummary
      || retainedState.get('creator id') !== suffix
      || retainedState.get('plan only') !== String(planOnly)
      || (expectedOwner ? retainedOwner !== expectedOwner : !retainedOwner.startsWith(`${runtime}:`) || !retainedOwner.endsWith(fallbackOwnerSuffix))) {
      throw new Error('Existing task worktree is not the same clean failed setup owned by this invocation');
    }
    resumeLockPath = join(worktree, '.agent-tmp', 'setup-resume.lock');
    const lock = acquireResumeLock(resumeLockPath);
    resumeLockFd = lock.fd;
    if (retainedState.get('setup') === 'in-progress' && !lock.reclaimed) {
      closeSync(resumeLockFd);
      resumeLockFd = undefined;
      unlinkSync(resumeLockPath);
      throw new Error('In-progress task setup can resume only after reclaiming its dead owner lock');
    }
  } else {
    run('git', ['-C', caller, 'worktree', 'add', '-b', taskBranch, worktree, 'HEAD'], caller);
  }
}
const createdTime = retainedState?.get('created time') ?? new Date().toISOString();
const state = {
  'base branch': baseBranch,
  'task branch': taskBranch,
  'worktree path': worktree,
  'original caller path': originalCaller,
  'created time': createdTime,
  'task summary': taskSummary,
  'creator id': suffix,
  ...(reservationNonce ? {'guard nonce': reservationNonce} : {}),
  'plan only': planOnly,
  owner: retainedState?.get('owner') ?? (sessionId ? `${runtime}:${sessionId}` : `${runtime}:${createdTime}:${originalCaller}:${taskSummary}`),
};

let bindableState = false;
try {
  writeState(worktree, {...state, setup: 'in-progress'});
  bindableState = true;
  ensureAgentTempIgnored(worktree);
  run('git', ['submodule', 'update', '--init', '--recursive'], worktree);
  for (const [command, args, cwd] of dependencyCommands(worktree)) run(command, args, cwd);
  const ignoredBaseline = recursiveIgnoredFingerprint(worktree);
  const ignoredSuperprojectBaseline = ignoredFingerprint(worktree);
  if (retainedHead && (git(worktree, ['branch', '--show-current']) !== taskBranch
    || git(worktree, ['rev-parse', 'HEAD']) !== retainedHead
    || git(caller, ['rev-parse', `refs/heads/${taskBranch}`]) !== retainedHead)) {
    throw new Error('Retained task branch changed while setup was running');
  }
  writeState(worktree, {
    ...state,
    setup: 'complete',
    'ignored baseline': ignoredBaseline,
    'ignored superproject baseline': ignoredSuperprojectBaseline,
  });
  process.stdout.write(`[task-worktree] ready\nworktree: ${worktree}\nbranch: ${taskBranch}\nbase: ${baseBranch}\ncd ${JSON.stringify(worktree)}\n`);
} catch (error) {
  try {
    writeState(worktree, {...state, setup: 'failed', error: error.message});
    bindableState = true;
  } catch {
    // The retained path remains the recovery source when state itself cannot be written.
  }
  process.stderr.write(`[task-worktree] setup failed; worktree retained for diagnosis and retry: ${worktree}\nworktree: ${worktree}\nbranch: ${taskBranch}\n`);
  throw error;
} finally {
  if (resumeLockFd !== undefined) {
    closeSync(resumeLockFd);
    try {
      unlinkSync(resumeLockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (reservationNonce && bindableState) rmSync(reservationPath, {force: true});
}
