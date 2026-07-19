#!/usr/bin/env node

import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve} from 'node:path';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : null;
const dryRun = args.includes('--dry-run');
const validGates = new Set(['test', 'lint', 'typecheck', 'build']);
const requestedGates = args.flatMap((argument, index) => argument === '--gate' ? [args[index + 1]] : []);
const rawRequestedPackages = args.flatMap((argument, index) => argument === '--package' ? [args[index + 1]] : []);
const requestedPackages = rawRequestedPackages.map((root) => typeof root === 'string' ? root.replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+$/, '') || '.' : root);
const allowedArgs = new Set(['--base', '--dry-run', '--gate', '--package']);
if (
  !base
  || base.startsWith('--')
  || requestedGates.length === 0
  || requestedGates.some((gate) => !validGates.has(gate))
  || rawRequestedPackages.some((root) => !root || isAbsolute(root) || /^[A-Za-z]:[\\/]|^[\\/]{2}/u.test(root))
  || requestedPackages.some((root) => root.split('/').includes('..'))
  || args.some((argument, index) => !allowedArgs.has(argument) && index !== baseIndex + 1 && !['--gate', '--package'].includes(args[index - 1]))
) throw new Error('Usage: task-verify.mjs --base <git-ref> --gate <test|lint|typecheck|build> [--gate ...] [--package <relative-root>]... [--dry-run]');

// Runs Git in the given directory and returns trimmed output.
function git(root, gitArgs) {
  return execFileSync('git', ['-C', root, ...gitArgs], {encoding: 'utf8'}).trim();
}

// Returns a stable slash-separated path relative to the repository root.
function repoRelative(repoRoot, path) {
  return relative(repoRoot, path).replaceAll('\\', '/') || '.';
}

// Finds the nearest ancestor containing one package marker.
function nearestPackageRoot(repoRoot, file, marker) {
  let directory = resolve(repoRoot, dirname(file));
  while (directory.startsWith(repoRoot)) {
    if (existsSync(join(directory, marker))) return directory;
    if (directory === repoRoot) break;
    directory = dirname(directory);
  }
  return null;
}

// Selects the installed JavaScript package runner for one package.
function packageRunner(directory) {
  if (existsSync(join(directory, 'bun.lock')) || existsSync(join(directory, 'bun.lockb'))) return ['bun', 'run'];
  if (existsSync(join(directory, 'pnpm-lock.yaml'))) return ['pnpm', 'run'];
  if (existsSync(join(directory, 'yarn.lock'))) return ['yarn', 'run'];
  return ['npm', 'run'];
}

// Executes one verification command while preserving its complete output.
function runCommand(command, commandArgs, cwd) {
  process.stdout.write(`\n[task-verify] ${command} ${commandArgs.join(' ')}\n`);
  if (dryRun) return {command: [command, ...commandArgs], cwd, status: 0, output: ''};
  const result = spawnSync(command, commandArgs, {cwd, encoding: 'utf8', env: process.env, maxBuffer: 128 * 1024 * 1024});
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  return {command: [command, ...commandArgs], cwd, status: result.status ?? 1, output};
}

// Hashes one filesystem entry without following symbolic links.
function hashEntry(hash, path, label) {
  hash.update(`\0${label}\0`);
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    hash.update('<deleted>');
    return;
  }
  hash.update(`${stat.mode}:${stat.isFile() ? 'file' : stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'other'}`);
  if (stat.isFile()) hash.update(readFileSync(path));
  else if (stat.isSymbolicLink()) hash.update(readlinkSync(path));
}

// Hashes a nested Git worktree, including dirty and untracked entry identity.
function hashNestedRepository(hash, path) {
  const nestedHead = spawnSync('git', ['-C', path, 'rev-parse', 'HEAD'], {encoding: 'utf8'});
  if (nestedHead.status !== 0) return false;
  const nestedDiff = spawnSync('git', ['-C', path, 'diff', '--binary', 'HEAD'], {encoding: 'utf8'});
  const nestedUntracked = spawnSync('git', ['-C', path, 'ls-files', '--others', '--exclude-standard', '-z'], {encoding: 'utf8'});
  if (nestedDiff.status !== 0 || nestedUntracked.status !== 0) throw new Error(`Cannot fingerprint nested Git worktree: ${path}`);
  hash.update(nestedHead.stdout.trim());
  hash.update(nestedDiff.stdout);
  for (const nestedFile of nestedUntracked.stdout.split('\0').filter(Boolean).sort()) {
    hashEntry(hash, join(path, nestedFile), nestedFile);
  }
  return true;
}

// Fingerprints the exact changed content covered by this verification run.
function snapshotFingerprint(repoRoot, changed) {
  const hash = createHash('sha256');
  for (const file of changed) {
    const path = join(repoRoot, file);
    hashEntry(hash, path, file);
    if (existsSync(path) && lstatSync(path).isDirectory()) {
      if (!hashNestedRepository(hash, path)) hash.update('<directory>');
    }
  }
  return hash.digest('hex');
}

// Lists the exact tracked and untracked paths changed from the verification base.
function changedFiles(repoRoot) {
  return [...new Set([
    ...git(repoRoot, ['diff', '--name-only', base, '--']).split('\n'),
    ...git(repoRoot, ['ls-files', '--others', '--exclude-standard']).split('\n'),
  ])].filter((file) => file && !file.startsWith('.agent-tmp/')).sort();
}

// Writes the verification receipt, including failures that stop command execution early.
function writeReceipt(repoRoot, changed, results, failure) {
  const receiptDirectory = join(repoRoot, '.agent-tmp');
  mkdirSync(receiptDirectory, {recursive: true});
  const receipt = {
    base,
    head: git(repoRoot, ['rev-parse', 'HEAD']),
    gitStatus: git(repoRoot, ['status', '--porcelain=v2', '--untracked-files=all']),
    snapshotFingerprint: initialSnapshotFingerprint,
    finalSnapshotFingerprint: snapshotFingerprint(repoRoot, changedFiles(repoRoot)),
    changed,
    generatedAt: new Date().toISOString(),
    dryRun,
    requestedGates: [...new Set(requestedGates)],
    requestedPackages: [...new Set(requestedPackages)],
    passed: !failure && !dryRun,
    failure: failure ?? null,
    results: results.map(({output, ...result}) => result),
  };
  writeFileSync(join(receiptDirectory, 'task-verification.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}

// Returns package-level commands for every changed JavaScript package.
function javascriptCommands(packageRoot) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const runner = packageRunner(packageRoot);
  return ['test', 'lint', 'typecheck', 'build']
    .filter((name) => manifest.scripts?.[name])
    .map((name) => [runner[0], [...runner.slice(1), name], packageRoot, name]);
}

// Returns crate-level commands for every changed Rust package.
function rustCommands(crateRoot) {
  const manifest = join(crateRoot, 'Cargo.toml');
  return [
    ['cargo', ['test', '--manifest-path', manifest, '--', '--nocapture'], crateRoot, 'test'],
    ['cargo', ['clippy', '--manifest-path', manifest, '--all-targets', '--', '-D', 'warnings'], crateRoot, 'lint'],
    ['cargo', ['check', '--manifest-path', manifest, '--all-targets'], crateRoot, 'typecheck'],
    ['cargo', ['build', '--manifest-path', manifest, '--all-targets'], crateRoot, 'build'],
  ];
}

// Detects Rust integration-test soft-skip patterns without external search tools.
function hasSoftDatabaseTests(directory) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    if (entry.name === 'target' || entry.name === '.git') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory() && hasSoftDatabaseTests(path)) return true;
    if (entry.isFile() && entry.name.endsWith('.rs') && /try_real_pool|skip:\s*no local postgres/iu.test(readFileSync(path, 'utf8'))) return true;
  }
  return false;
}

const repoRoot = git(process.cwd(), ['rev-parse', '--show-toplevel']);
const canonicalRepoRoot = realpathSync(repoRoot);
const changed = changedFiles(repoRoot);
const initialSnapshotFingerprint = snapshotFingerprint(repoRoot, changed);
if (changed.length === 0) {
  writeReceipt(repoRoot, changed, [], 'no changed files');
  process.stdout.write('[task-verify] no changed files\n');
  process.exit(1);
}

const packageRoots = new Set();
const crateRoots = new Set();
for (const file of changed) {
  const packageRoot = nearestPackageRoot(repoRoot, file, 'package.json');
  const crateRoot = nearestPackageRoot(repoRoot, file, 'Cargo.toml');
  if (packageRoot) packageRoots.add(packageRoot);
  if (crateRoot) crateRoots.add(crateRoot);
}
for (const root of requestedPackages) {
  const absoluteRoot = resolve(repoRoot, root);
  const canonicalRoot = existsSync(absoluteRoot) ? realpathSync(absoluteRoot) : absoluteRoot;
  const boundary = relative(canonicalRepoRoot, canonicalRoot);
  if (boundary === '..' || boundary.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(boundary)) {
    throw new Error(`Requested package root escapes repository: ${root}`);
  }
  if (existsSync(join(absoluteRoot, 'package.json'))) packageRoots.add(absoluteRoot);
  if (existsSync(join(absoluteRoot, 'Cargo.toml'))) crateRoots.add(absoluteRoot);
}

const commands = [
  ...[...packageRoots].flatMap(javascriptCommands),
  ...[...crateRoots].flatMap(rustCommands),
].filter((command) => requestedGates.includes(command[3]))
  .filter((command) => requestedPackages.length === 0 || requestedPackages.includes(repoRelative(repoRoot, command[2])));
const discoveredRoots = [...new Set([...packageRoots, ...crateRoots].map((root) => repoRelative(repoRoot, root)))];
const unknownPackages = requestedPackages.filter((root) => !discoveredRoots.includes(root));
if (unknownPackages.length) throw new Error(`Requested package roots have no supported manifest: ${unknownPackages.join(', ')}`);
const selectedRoots = requestedPackages.length ? requestedPackages : discoveredRoots;
const missing = selectedRoots.flatMap((root) => requestedGates
  .filter((gate) => !commands.some((command) => repoRelative(repoRoot, command[2]) === root && command[3] === gate))
  .map((gate) => ({command: [], cwd: root, status: null, gate, nA: 'no command'})));
if (commands.length === 0) {
  writeReceipt(repoRoot, changed, missing, 'requested gates have no verification command');
  process.stderr.write('[task-verify] requested gates have no verification command\n');
  process.exit(1);
}

const results = [...missing];
for (const crateRoot of crateRoots) {
  if (!commands.some(([, , cwd, gate]) => cwd === crateRoot && gate === 'test')) continue;
  if (!hasSoftDatabaseTests(crateRoot)) continue;
  if (!dryRun && !process.env.DATABASE_URL) {
    const failure = `DATABASE_URL is required because ${repoRelative(repoRoot, crateRoot)} contains soft-skipping DB tests`;
    writeReceipt(repoRoot, changed, results, failure);
    process.stderr.write(`[task-verify] ${failure}\n`);
    process.exit(1);
  }
  if (!dryRun) {
    process.stdout.write('\n[task-verify] psql <DATABASE_URL> -v ON_ERROR_STOP=1 -Atqc select 1\n');
    const preflight = spawnSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-Atqc', 'select 1'], {
      cwd: crateRoot, encoding: 'utf8', env: {...process.env, PSQLRC: '/dev/null'},
    });
    const output = `${preflight.stdout ?? ''}${preflight.stderr ?? ''}`;
    process.stdout.write(output);
    const result = {
      command: ['psql', '<DATABASE_URL>', '-v', 'ON_ERROR_STOP=1', '-Atqc', 'select 1'],
      cwd: repoRelative(repoRoot, crateRoot),
      status: preflight.status ?? 1,
      output,
      gate: 'dependency',
    };
    results.push(result);
    if (result.status !== 0 || output.trim() !== '1') {
      const failure = 'database preflight failed; install psql and verify DATABASE_URL reaches PostgreSQL';
      writeReceipt(repoRoot, changed, results, failure);
      process.stderr.write(`[task-verify] ${failure}\n`);
      process.exit(1);
    }
  }
}

for (const [command, commandArgs, cwd, gate] of commands) {
  const result = runCommand(command, commandArgs, cwd);
  results.push({...result, gate, cwd: repoRelative(repoRoot, cwd)});
  if (/skip:\s*no local postgres/iu.test(result.output)) {
    process.stderr.write('[task-verify] soft-skipped integration dependency detected\n');
    results[results.length - 1].status = 1;
  }
}

const failed = results.some((result) => typeof result.status === 'number' && result.status !== 0);
const snapshotChanged = snapshotFingerprint(repoRoot, changedFiles(repoRoot)) !== initialSnapshotFingerprint;
const failure = failed
  ? 'verification command failed or soft-skipped'
  : missing.length
    ? 'requested gates have no verification command'
  : snapshotChanged
    ? 'working snapshot changed during verification'
    : dryRun ? 'dry-run does not verify' : null;
writeReceipt(repoRoot, changed, results, failure);
if (failure) process.exit(1);
const executedCount = results.filter((result) => typeof result.status === 'number').length;
process.stdout.write(`\n[task-verify] passed ${executedCount} commands; ${missing.length} N/A; receipt: .agent-tmp/task-verification.json\n`);
