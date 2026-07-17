#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';

const gitOutputMaxBuffer = 256 * 1024 * 1024;

const args = process.argv.slice(2);
if (args.length !== 8 || args[0] !== '--repo' || args[2] !== '--worktree' || args[4] !== '--branch' || args[6] !== '--head') {
  throw new Error('Usage: task-worktree-plan-cleanup.mjs --repo <path> --worktree <path> --branch <task/*> --head <commit>');
}
const repository = realpathSync(args[1]);
const worktree = realpathSync(args[3]);
const branch = args[5];
const expectedHead = args[7];
if (!/^task\/[a-zA-Z0-9._/-]+$/u.test(branch) || !/^[0-9a-f]{40,64}$/u.test(expectedHead)) throw new Error('Invalid task branch or expected commit');
const taskState = readFileSync(`${worktree}/.agent-tmp/task-state.md`, 'utf8');
const ignoredBaseline = taskState.match(/^- ignored baseline: ([0-9a-f]{64})$/mu)?.[1];
const superprojectIgnoredBaseline = taskState.match(/^- ignored superproject baseline: ([0-9a-f]{64})$/mu)?.[1];
if (!ignoredBaseline || !superprojectIgnoredBaseline) throw new Error('Plan worktree has no ignored setup baseline');

// Runs one Git command and returns its trimmed output.
function git(directory, commandArgs) {
  const result = spawnSync('git', ['-C', directory, ...commandArgs], {encoding: 'utf8', maxBuffer: gitOutputMaxBuffer});
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${commandArgs.join(' ')} failed in ${directory}`);
  return result.stdout.trim();
}

// Lists every ignored artifact except the task-local state namespace.
// This exemption must stay identical to the creator's ignoredFingerprint, which records the
// baseline this helper re-checks: the task workflow writes its own records under .agent-tmp/
// after the baseline is taken (the verification receipt, the setup resume lock), so a narrower
// exemption on either side makes the two hashes permanently unequal. Artifacts outside
// .agent-tmp/ still have to match the baseline byte for byte.
function ignoredFiles(directory) {
  return git(directory, ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'])
    .split('\0').filter((file) => file && !file.startsWith('.agent-tmp/')).sort();
}

// Records ignored artifact paths with content identities without following symlinks.
function ignoredEntries(directory, files = ignoredFiles(directory)) {
  const entries = [];
  for (let offset = 0; offset < files.length; offset += 200) {
    const batch = files.slice(offset, offset + 200);
    const records = batch.map((file) => ({file, stat: lstatSync(join(directory, file))}));
    const regularFiles = records.filter(({stat}) => stat.isFile()).map(({file}) => file);
    const result = spawnSync('git', ['-C', directory, 'hash-object', '--no-filters', '--', ...regularFiles], {encoding: 'utf8'});
    if (result.status !== 0) throw new Error(result.stderr.trim() || `could not fingerprint ignored files in ${directory}`);
    const hashes = result.stdout.trim().split('\n').filter(Boolean);
    if (hashes.length !== regularFiles.length) throw new Error(`ignored files changed while fingerprinting ${directory}`);
    const fileHashes = new Map(regularFiles.map((file, index) => [file, hashes[index]]));
    entries.push(...records.map(({file, stat}) => {
      const hash = stat.isSymbolicLink()
        ? createHash('sha256').update(readlinkSync(join(directory, file))).digest('hex')
        : fileHashes.get(file) ?? '';
      return {file, hash, type: stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other', mode: stat.mode & 0o7777};
    }));
  }
  return entries;
}

// Fingerprints the supplied ignored artifacts.
function ignoredFingerprint(directory, files = ignoredFiles(directory)) {
  const entries = ignoredEntries(directory, files)
    .map(({file, hash, type, mode}) => `${file}\0${type}\0${mode}\0${hash}`);
  return createHash('sha256').update(entries.join('\0')).digest('hex');
}

// Returns the exact content, type, and mode identity of one filesystem artifact.
function artifactIdentity(artifact) {
  const stat = lstatSync(artifact);
  const type = stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : 'other';
  if (stat.isSymbolicLink()) {
    return {hash: createHash('sha256').update(readlinkSync(artifact)).digest('hex'), type, mode: stat.mode & 0o7777};
  }
  if (!stat.isFile()) return {hash: '', type, mode: stat.mode & 0o7777};
  const result = spawnSync('git', ['hash-object', '--no-filters', artifact], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr.trim() || `could not hash ${artifact}`);
  return {hash: result.stdout.trim(), type, mode: stat.mode & 0o7777};
}

// Reports whether one path exists without following its final symlink.
function lexicallyExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

// Fingerprints every filesystem entry below a quarantined worktree without following symlinks.
function filesystemFingerprint(directory) {
  const entries = [];
  const visit = (current, relativePath = '') => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      const child = relativePath ? `${relativePath}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        entries.push(`${child}\0directory\0${stat.mode & 0o7777}`);
        visit(path, child);
      } else {
        const identity = artifactIdentity(path);
        entries.push(`${child}\0${identity.type}\0${identity.mode}\0${identity.hash}`);
      }
    }
  };
  visit(directory);
  return createHash('sha256').update(entries.join('\0')).digest('hex');
}

// Atomically moves recursive submodule artifacts outside deinit while leaving write-through proxies.
function isolateSubmoduleArtifacts(directory, entries, holdingRoot, repositoryPath) {
  return entries.map((entry) => {
    const artifact = resolve(directory, entry.file);
    const isolated = join(holdingRoot, repositoryPath, entry.file);
    mkdirSync(dirname(isolated), {recursive: true});
    renameSync(artifact, isolated);
    const identity = artifactIdentity(isolated);
    if (identity.hash !== entry.hash || identity.type !== entry.type || identity.mode !== entry.mode) {
      renameSync(isolated, artifact);
      throw new Error(`Submodule ignored artifact changed during isolation: ${repositoryPath}/${entry.file}`);
    }
    symlinkSync(isolated, artifact);
    return {...entry, artifact, isolated, repositoryPath};
  });
}

// Restores isolated submodule artifacts after a failed cleanup attempt.
function restoreIsolatedArtifacts(entries) {
  for (const entry of entries) {
    if (!lexicallyExists(entry.isolated)) continue;
    rmSync(entry.artifact, {recursive: true, force: true});
    mkdirSync(dirname(entry.artifact), {recursive: true});
    renameSync(entry.isolated, entry.artifact);
  }
}

// Lists the initialized superproject and recursive submodule repository roots.
function repositoryRoots(directory) {
  const result = spawnSync('git', ['-C', directory, 'submodule', 'foreach', '--quiet', '--recursive', 'printf "%s\\0" "$toplevel/$sm_path"'], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr.trim() || `could not inspect recursive submodules in ${directory}`);
  return [directory, ...result.stdout.split('\0').filter(Boolean)];
}

// Records initialized submodule Git directories so a quarantined worktree can be repaired.
function submoduleRecords(directory) {
  return repositoryRoots(directory).slice(1).map((submodule) => ({
    path: relative(directory, submodule),
    gitDirectory: git(submodule, ['rev-parse', '--absolute-git-dir']),
  }));
}

// Points recorded submodule Git directories at their worktrees below one relocated root.
function repairSubmodules(records, directory) {
  for (const record of records) {
    const result = spawnSync('git', ['config', '--file', join(record.gitDirectory, 'config'), 'core.worktree', join(directory, record.path)], {encoding: 'utf8'});
    if (result.status !== 0) throw new Error(result.stderr.trim() || `could not repair submodule ${record.path}`);
  }
}

// Fingerprints ignored artifacts across the superproject and recursive submodules.
function recursiveIgnoredFingerprint(directory) {
  const entries = repositoryRoots(directory).map((repository) => {
    const path = relative(directory, repository).split('\\').join('/') || '.';
    return `${path}\0${ignoredFingerprint(repository)}`;
  });
  return createHash('sha256').update(entries.sort().join('\0')).digest('hex');
}

// Confirms tracked state, refs, and ignored setup still match creation state.
function verifyCleanPlanWorktree(directory, includeSubmodules = true) {
  if (git(repository, ['rev-parse', '--show-toplevel']) !== repository) throw new Error('Repository path is not its Git root');
  if (git(directory, ['rev-parse', '--show-toplevel']) !== directory) throw new Error('Worktree path is not its Git root');
  if (git(directory, ['branch', '--show-current']) !== branch) throw new Error('Plan worktree branch changed');
  if (git(directory, ['rev-parse', 'HEAD']) !== expectedHead) throw new Error('Plan worktree commit changed');
  if (git(repository, ['rev-parse', `refs/heads/${branch}`]) !== expectedHead) throw new Error('Plan branch changed');
  if (git(directory, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'])) throw new Error('Plan worktree contains changes');
  const actualIgnored = includeSubmodules ? recursiveIgnoredFingerprint(directory) : ignoredFingerprint(directory);
  const expectedIgnored = includeSubmodules ? ignoredBaseline : superprojectIgnoredBaseline;
  if (actualIgnored !== expectedIgnored) throw new Error('Plan worktree ignored artifacts changed');
}

verifyCleanPlanWorktree(worktree);
const hasSubmodules = git(worktree, ['ls-files', '--stage']).split('\n').some((line) => line.startsWith('160000 '));
const recordedSubmodules = submoduleRecords(worktree);
const quarantine = `${worktree}.cleanup-${process.pid}-${randomUUID()}`;
const ignoredHolding = `${quarantine}.ignored-${randomUUID()}`;
const superprojectHolding = `${quarantine}.superproject-${randomUUID()}`;
const finalHolding = `${quarantine}.final-${randomUUID()}`;
let repairedWorktree = quarantine;
let relocated = false;
let isolatedSubmoduleEntries = [];
let isolatedSuperprojectEntries = [];
let submodulesDeinitialized = false;
let finalRelocated = false;
let branchDeleted = false;
try {
  renameSync(worktree, quarantine);
  relocated = true;
  git(repository, ['worktree', 'repair', quarantine]);
  repairSubmodules(recordedSubmodules, quarantine);
  repairedWorktree = realpathSync(quarantine);
  verifyCleanPlanWorktree(repairedWorktree);
  const baselineEntries = ignoredEntries(repairedWorktree);
  isolatedSubmoduleEntries = repositoryRoots(repairedWorktree).slice(1).flatMap((submodule) => {
    const repositoryPath = relative(repairedWorktree, submodule).split('\\').join('/');
    return isolateSubmoduleArtifacts(submodule, ignoredEntries(submodule), ignoredHolding, repositoryPath);
  });
  if (hasSubmodules) {
    git(repairedWorktree, ['submodule', 'deinit', '--all']);
    submodulesDeinitialized = true;
  }
  for (const entry of isolatedSubmoduleEntries) {
    const identity = artifactIdentity(entry.isolated);
    if (identity.hash !== entry.hash || identity.type !== entry.type || identity.mode !== entry.mode) {
      throw new Error(`Submodule ignored artifact changed during cleanup and was preserved at ${entry.isolated}`);
    }
  }
  verifyCleanPlanWorktree(repairedWorktree, false);
  const stateFile = join(repairedWorktree, '.agent-tmp', 'task-state.md');
  const stateIdentity = artifactIdentity(stateFile);
  isolatedSuperprojectEntries = isolateSubmoduleArtifacts(repairedWorktree, [
    ...baselineEntries,
    {file: '.agent-tmp/task-state.md', ...stateIdentity},
  ], superprojectHolding, 'superproject');
  if (git(repairedWorktree, ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'])) throw new Error('Plan worktree changed during cleanup');
  if (ignoredFiles(repairedWorktree).join('\0') !== baselineEntries.map(({file}) => file).join('\0')) throw new Error('Plan worktree gained ignored artifacts during cleanup');
  const finalFingerprint = filesystemFingerprint(repairedWorktree);
  renameSync(repairedWorktree, finalHolding);
  finalRelocated = true;
  if (filesystemFingerprint(finalHolding) !== finalFingerprint) throw new Error(`Plan worktree changed during final isolation and was preserved at ${finalHolding}`);
  git(repository, ['update-ref', '-d', `refs/heads/${branch}`, expectedHead]);
  branchDeleted = true;
  for (const entry of isolatedSuperprojectEntries) {
    const identity = artifactIdentity(entry.isolated);
    if (identity.hash !== entry.hash || identity.type !== entry.type || identity.mode !== entry.mode) {
      throw new Error(`Plan artifact changed during final removal and was preserved at ${entry.isolated}`);
    }
  }
  for (const entry of isolatedSubmoduleEntries) {
    const identity = artifactIdentity(entry.isolated);
    if (identity.hash !== entry.hash || identity.type !== entry.type || identity.mode !== entry.mode) {
      throw new Error(`Submodule artifact changed during final removal and was preserved at ${entry.isolated}`);
    }
  }
  if (filesystemFingerprint(finalHolding) !== finalFingerprint) throw new Error(`Plan worktree changed during final cleanup and was preserved at ${finalHolding}`);
  git(repository, ['worktree', 'prune', '--expire', 'now']);
  rmSync(finalHolding, {recursive: true});
  finalRelocated = false;
  rmSync(superprojectHolding, {recursive: true, force: true});
  isolatedSuperprojectEntries = [];
  rmSync(ignoredHolding, {recursive: true, force: true});
  isolatedSubmoduleEntries = [];
} catch (error) {
  let restoredOwnWorktree = false;
  if (branchDeleted) {
    try {
      git(repository, ['update-ref', `refs/heads/${branch}`, expectedHead, '0000000000000000000000000000000000000000']);
    } catch {
      // A concurrently recreated branch is preserved instead of overwritten.
    }
    branchDeleted = false;
  }
  if (finalRelocated && existsSync(finalHolding) && !existsSync(worktree)) {
    renameSync(finalHolding, worktree);
    finalRelocated = false;
    repairedWorktree = worktree;
    restoredOwnWorktree = true;
  } else if (relocated && existsSync(repairedWorktree) && !existsSync(worktree)) {
    renameSync(repairedWorktree, worktree);
    repairedWorktree = worktree;
    restoredOwnWorktree = true;
  }
  if (restoredOwnWorktree) {
    try {
      git(repository, ['worktree', 'repair', worktree]);
      repairSubmodules(recordedSubmodules, worktree);
    } catch {
      // The original cleanup error remains primary; preserved holdings retain recovery data.
    }
    if (submodulesDeinitialized || isolatedSubmoduleEntries.length > 0) {
      spawnSync('git', ['-C', worktree, 'submodule', 'update', '--init', '--recursive'], {encoding: 'utf8'});
      restoreIsolatedArtifacts(isolatedSubmoduleEntries.map((entry) => ({...entry, artifact: join(worktree, entry.repositoryPath, entry.file)})));
      rmSync(ignoredHolding, {recursive: true, force: true});
    }
    if (isolatedSuperprojectEntries.length > 0) {
      restoreIsolatedArtifacts(isolatedSuperprojectEntries.map((entry) => ({...entry, artifact: join(worktree, entry.file)})));
      rmSync(superprojectHolding, {recursive: true, force: true});
    }
  }
  throw error;
}
process.stdout.write(`[task-worktree] removed clean plan worktree ${worktree}\n`);
