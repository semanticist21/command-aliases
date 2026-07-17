#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const args = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < args.length; index += 2) {
  const [option, value] = args.slice(index, index + 2);
  if (!['--repo', '--base', '--branch', '--worktree', '--slug', '--head'].includes(option) || !value || options.has(option)) {
    throw new Error('Usage: task-finalize.mjs --repo <caller-root> --base <base> --branch <task-branch> --worktree <task-worktree> --slug <safe-slug> --head <task-head>');
  }
  options.set(option, value);
}
const repository = resolve(options.get('--repo') ?? '');
const base = options.get('--base') ?? '';
const branch = options.get('--branch') ?? '';
const worktree = resolve(options.get('--worktree') ?? '');
const slug = options.get('--slug') ?? '';
const head = options.get('--head') ?? '';
if (options.size !== 6 || !/^[a-z0-9][a-z0-9._-]*$/u.test(slug) || !/^[0-9a-f]{40}$/u.test(head)) throw new Error('Task finalizer requires a lowercase slug and full task head SHA');

// Runs Git in the recorded caller checkout and returns trimmed output.
function git(gitArgs, directory = repository) {
  const result = spawnSync('git', ['-C', directory, ...gitArgs], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${gitArgs.join(' ')} failed`);
  return result.stdout.trim();
}

// Reports whether a Git command exits successfully without changing its output.
function succeeds(gitArgs) {
  return spawnSync('git', ['-C', repository, ...gitArgs], {encoding: 'utf8'}).status === 0;
}

// Removes remaining task resources in the order Git requires.
function cleanup() {
  const branchExists = succeeds(['rev-parse', '--verify', `refs/heads/${branch}`]);
  if (branchExists && git(['rev-parse', branch]) !== head) throw new Error('Task branch advanced after landing; refusing to delete it');
  if (existsSync(worktree)) {
    if (!branchExists || git(['rev-parse', 'HEAD'], worktree) !== head) throw new Error('Task worktree changed after landing; refusing to remove it');
    git(['worktree', 'remove', worktree]);
  }
  if (branchExists) git(['branch', '-D', branch]);
}

const commonDirectory = resolve(repository, git(['rev-parse', '--git-common-dir']));
const marker = join(commonDirectory, `task-landing-${slug}`);
const squashMessage = resolve(repository, git(['rev-parse', '--git-path', 'SQUASH_MSG']));
// Finds the immutable journal entry for this task head on the recorded base.
const journal = () => git(['log', base, '--format=%H', `--grep=^Task-Head: ${head}$`]);
if (git(['branch', '--show-current']) !== base) throw new Error(`Caller checkout must be on ${base}`);
let landed = journal();

if (landed) {
  rmSync(marker, {force: true});
  cleanup();
  process.stdout.write(`Task ${head} already landed; cleanup converged.\n`);
  process.exit();
}

if (existsSync(marker)) {
  const recordedBase = readFileSync(marker, 'utf8').trim();
  const baseHead = git(['rev-parse', base]);
  const branchMatchesHead = succeeds(['rev-parse', '--verify', `refs/heads/${branch}`]) && git(['rev-parse', branch]) === head;
  const indexMatchesTask = succeeds(['diff', '--cached', '--quiet', head]);
  const worktreeMatchesIndex = succeeds(['diff', '--quiet']);
  if (recordedBase !== baseHead || !existsSync(squashMessage) || !branchMatchesHead || !indexMatchesTask || !worktreeMatchesIndex) {
    throw new Error('unknown landing state; marker recovery would overwrite work not proven to belong to this task');
  }
  git(['reset', '--hard', recordedBase]);
  rmSync(marker);
  process.stdout.write('recovered interrupted landing.\n');
}

if (existsSync(squashMessage)) throw new Error('unknown landing state; SQUASH_MSG exists without a recoverable task marker');
if (git(['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'])) throw new Error('Caller checkout must be clean before starting a recoverable squash landing');
if (!succeeds(['rev-parse', '--verify', `refs/heads/${branch}`]) || git(['rev-parse', branch]) !== head) throw new Error('Task branch no longer matches the recorded task head');

const paths = git(['diff', '--name-only', '-z', base, head, '--']).split('\0').filter(Boolean);
if (paths.length === 0) throw new Error('Task branch contains no paths to squash');
writeFileSync(marker, `${git(['rev-parse', base])}\n`, {flag: 'wx'});
git(['merge', '--squash', branch]);
if (!succeeds(['diff', '--cached', '--quiet', head])) throw new Error('unknown landing state; squash index does not match the task head');
git(['commit', '-F', squashMessage, '--trailer', `Task-Head: ${head}`, '--', ...paths]);
rmSync(marker);
landed = journal();
if (!landed) throw new Error('Task squash commit did not record its Task-Head journal trailer');
cleanup();
process.stdout.write(`Landed task ${head}.\n`);
