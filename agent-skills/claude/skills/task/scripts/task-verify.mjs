#!/usr/bin/env node

import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : null;
const dryRun = args.includes('--dry-run');
const allowedArgs = new Set(['--base', '--dry-run']);
if (
  !base
  || base.startsWith('--')
  || args.some((argument, index) => !allowedArgs.has(argument) && index !== baseIndex + 1)
) throw new Error('Usage: task-verify.mjs --base <git-ref> [--dry-run]');

// Runs Git in the given directory and returns trimmed output.
function git(root, gitArgs) {
  return execFileSync('git', ['-C', root, ...gitArgs], {encoding: 'utf8'}).trim();
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

// Writes the verification receipt, including failures that stop command execution early.
function writeReceipt(repoRoot, changed, results, failure) {
  const receiptDirectory = join(repoRoot, '.agent-tmp');
  mkdirSync(receiptDirectory, {recursive: true});
  const receipt = {
    base,
    head: git(repoRoot, ['rev-parse', 'HEAD']),
    changed,
    generatedAt: new Date().toISOString(),
    dryRun,
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
const changed = [...new Set([
  ...git(repoRoot, ['diff', '--name-only', base, '--']).split('\n'),
  ...git(repoRoot, ['ls-files', '--others', '--exclude-standard']).split('\n'),
])].filter((file) => file && !file.startsWith('.agent-tmp/')).sort();
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

const commands = [
  ...[...packageRoots].flatMap(javascriptCommands),
  ...[...crateRoots].flatMap(rustCommands),
];
if (commands.length === 0) {
  writeReceipt(repoRoot, changed, [], 'no supported package found for changed files');
  process.stderr.write('[task-verify] no supported package found for changed files\n');
  process.exit(1);
}

const results = [];
for (const crateRoot of crateRoots) {
  if (!hasSoftDatabaseTests(crateRoot)) continue;
  if (!dryRun && !process.env.DATABASE_URL) {
    const failure = `DATABASE_URL is required because ${relative(repoRoot, crateRoot) || '.'} contains soft-skipping DB tests`;
    writeReceipt(repoRoot, changed, [], failure);
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
      cwd: relative(repoRoot, crateRoot) || '.',
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
  results.push({...result, gate, cwd: relative(repoRoot, cwd) || '.'});
  if (/skip:\s*no local postgres/iu.test(result.output)) {
    process.stderr.write('[task-verify] soft-skipped integration dependency detected\n');
    results[results.length - 1].status = 1;
  }
}

const failed = results.some((result) => result.status !== 0);
writeReceipt(repoRoot, changed, results, failed ? 'verification command failed or soft-skipped' : dryRun ? 'dry-run does not verify' : null);
if (failed || dryRun) process.exit(1);
process.stdout.write(`\n[task-verify] passed ${results.length} commands; receipt: .agent-tmp/task-verification.json\n`);
