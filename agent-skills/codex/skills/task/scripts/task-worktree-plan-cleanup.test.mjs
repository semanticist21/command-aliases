import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, chmodSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readlinkSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join, relative} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
const creatorScript = fileURLToPath(new URL('./task-worktree-create.mjs', import.meta.url));
const planCleanupScript = fileURLToPath(new URL('./task-worktree-plan-cleanup.mjs', import.meta.url));

// Runs a Git command inside a fixture repository.
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory, ...args], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// Records the empty ignored-artifact baseline expected by manual plan fixtures.
function preparePlanState(worktree) {
  const empty = createHash('sha256').update('').digest('hex');
  const submodules = spawnSync('git', ['-C', worktree, 'submodule', 'foreach', '--quiet', '--recursive', 'printf "%s\\0" "$toplevel/$sm_path"'], {encoding: 'utf8'});
  assert.equal(submodules.status, 0, submodules.stderr);
  const repositories = [worktree, ...submodules.stdout.split('\0').filter(Boolean)];
  const recursive = createHash('sha256').update(repositories.map((repository) => {
    const path = relative(worktree, repository).split('\\').join('/') || '.';
    return `${path}\0${empty}`;
  }).sort().join('\0')).digest('hex');
  mkdirSync(join(worktree, '.agent-tmp'), {recursive: true});
  writeFileSync(join(worktree, '.agent-tmp', 'task-state.md'), `- ignored baseline: ${recursive}\n- ignored superproject baseline: ${empty}\n`);
  const exclude = git(worktree, 'rev-parse', '--git-path', 'info/exclude');
  appendFileSync(exclude, '\n.agent-tmp/\n');
}

test('cleanup helper rejects tracked worktree changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-plan-cleanup-tracked-'));
  const worktree = `${root}-plan`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-tracked', worktree, 'HEAD');
    preparePlanState(worktree);
    writeFileSync(join(worktree, 'file'), 'changed\n');
    const cleaned = spawnSync(process.execPath, [
      planCleanupScript,
      '--repo', git(root, 'rev-parse', '--show-toplevel'),
      '--worktree', git(worktree, 'rev-parse', '--show-toplevel'),
      '--branch', 'task/plan-tracked',
      '--head', git(root, 'rev-parse', 'HEAD'),
    ], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.match(cleaned.stderr, /contains changes/u);
    assert.equal(readFileSync(join(worktree, 'file'), 'utf8'), 'changed\n');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper restores the worktree when quarantine repair fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-repair-fail-'));
  const worktree = `${root}-plan`;
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-repair-fail-bin-'));
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-repair-fail', worktree, 'HEAD');
    preparePlanState(worktree);
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    const failMarker = join(bin, 'repair-failed');
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "worktree" ] && [ "$4" = "repair" ] && [ ! -e "$FAIL_MARKER" ]; then : > "$FAIL_MARKER"; exit 55; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-repair-fail', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, FAIL_MARKER: failMarker},
    });
    assert.notEqual(cleaned.status, 0);
    assert.equal(git(worktree, 'branch', '--show-current'), 'task/plan-repair-fail');
    assert.match(git(root, 'branch', '--list', 'task/plan-repair-fail'), /task\/plan-repair-fail/u);
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves ignored files created after setup', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-ignored-race-'));
  const worktree = `${root}-plan`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nprivate-output/\n');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-ignored-race', worktree, 'HEAD');
    preparePlanState(worktree);
    mkdirSync(join(worktree, 'private-output'));
    writeFileSync(join(worktree, 'private-output', 'note'), 'preserve me\n');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-ignored-race', '--head', head], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.match(cleaned.stderr, /ignored artifacts changed/u);
    assert.equal(readFileSync(join(worktree, 'private-output', 'note'), 'utf8'), 'preserve me\n');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves a branch advanced after worktree removal', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-ref-race-'));
  const worktree = `${root}-plan`;
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-ref-race-bin-'));
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-ref-race', worktree, 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    preparePlanState(worktree);
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "update-ref" ] && [ "$4" = "-d" ]; then\n  tree=$("$REAL_GIT" -C "$RACE_REPO" rev-parse HEAD^{tree})\n  raced=$(printf "race\\n" | "$REAL_GIT" -C "$RACE_REPO" commit-tree "$tree" -p "$RACE_HEAD")\n  "$REAL_GIT" -C "$RACE_REPO" update-ref "refs/heads/$RACE_BRANCH" "$raced" "$RACE_HEAD"\nfi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-ref-race', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, RACE_REPO: canonicalRoot, RACE_BRANCH: 'task/plan-ref-race', RACE_HEAD: head},
    });
    assert.notEqual(cleaned.status, 0);
    assert.notEqual(git(root, 'rev-parse', 'refs/heads/task/plan-ref-race'), head);
    assert.equal(lstatSync(join(worktree, '.agent-tmp', 'task-state.md')).isFile(), true);
    assert.equal(lstatSync(join(worktree, '.agent-tmp', 'task-state.md')).isSymbolicLink(), false);
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper quarantines the worktree before final removal', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-final-race-'));
  const worktree = `${root}-plan`;
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-final-race-bin-'));
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-final-race', worktree, 'HEAD');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    preparePlanState(worktree);
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "worktree" ] && [ "$4" = "prune" ]; then mkdir -p "$RACE_WORKTREE"; printf "raced\\n" > "$RACE_WORKTREE/raced"; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-final-race', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, RACE_WORKTREE: canonicalWorktree},
    });
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(readFileSync(join(worktree, 'raced'), 'utf8'), 'raced\n');
    assert.equal(git(root, 'branch', '--list', 'task/plan-final-race'), '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper removes unchanged ignored setup artifacts safely', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-ignored-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-ignored-bin-'));
  const id = 'ignored-id';
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'ignored', '--id', id, '--repo', root, '--summary', 'Ignored cleanup', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-ignored-${id}`);
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', git(root, 'rev-parse', '--show-toplevel'), '--worktree', git(worktree, 'rev-parse', '--show-toplevel'), '--branch', `task/ignored-${id}`, '--head', head], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', `task/ignored-${id}`), '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

// The verifier writes .agent-tmp/task-verification.json after the creator records its ignored
// baseline. Exempting only .agent-tmp/task-state.md made that receipt diverge from the baseline,
// so every worktree that ran the verifier became permanently uncleanable.
test('cleanup helper removes a worktree whose task-local state grew after setup', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-verified-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-verified-bin-'));
  const id = 'verified-id';
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'verified', '--id', id, '--repo', root, '--summary', 'Verified cleanup', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-verified-${id}`);
    writeFileSync(join(worktree, '.agent-tmp', 'task-verification.json'), '{"status":"passed"}\n');
    mkdirSync(join(worktree, '.agent-tmp', 'nested'), {recursive: true});
    writeFileSync(join(worktree, '.agent-tmp', 'nested', 'scratch'), 'nested task-local state\n');
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', git(root, 'rev-parse', '--show-toplevel'), '--worktree', git(worktree, 'rev-parse', '--show-toplevel'), '--branch', `task/verified-${id}`, '--head', head], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', `task/verified-${id}`), '');
    assert.equal(existsSync(worktree), false);
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

// The creator holds .agent-tmp/setup-resume.lock while it records the ignored baseline on a
// resumed setup and only unlinks it afterwards, so a baseline that covered the lock could never
// match again. This is why the creator's exemption has to be widened together with the helper's.
test('cleanup helper removes a worktree whose setup was resumed', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-resumed-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-resumed-bin-'));
  const id = 'resumed-id';
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexit 7\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const args = [creatorScript, 'resumed', '--id', id, '--repo', root, '--summary', 'Resumed cleanup', '--plan-only'];
    const options = {cwd: root, encoding: 'utf8', env: {...process.env, PATH: `${bin}:${process.env.PATH}`}};
    const failed = spawnSync(process.execPath, args, options);
    assert.notEqual(failed.status, 0);
    worktree = join(dirname(root), `${basename(root)}-task-resumed-${id}`);
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    const resumed = spawnSync(process.execPath, args, options);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(existsSync(join(worktree, '.agent-tmp', 'setup-resume.lock')), false);
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', git(root, 'rev-parse', '--show-toplevel'), '--worktree', git(worktree, 'rev-parse', '--show-toplevel'), '--branch', `task/resumed-${id}`, '--head', head], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', `task/resumed-${id}`), '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper compares ignored regular files without Git clean filters', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-plan-raw-hash-root-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-plan-raw-hash-bin-'));
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitattributes'), '*.txt text eol=lf\n');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "line\\r\\n" > node_modules/pkg/artifact.txt\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'raw-hash', '--id', 'fixed-id', '--repo', root, '--summary', 'Raw hash plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-raw-hash-fixed-id`);
    const cleaned = spawnSync(process.execPath, [
      planCleanupScript,
      '--repo', git(root, 'rev-parse', '--show-toplevel'),
      '--worktree', git(worktree, 'rev-parse', '--show-toplevel'),
      '--branch', 'task/raw-hash-fixed-id',
      '--head', git(root, 'rev-parse', 'HEAD'),
    ], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper handles ignored listings larger than the default child-process buffer', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-plan-large-ignore-root-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-plan-large-ignore-bin-'));
  const worktree = `${root}-plan`;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, 'file'), 'fixture\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    git(root, 'worktree', 'add', '-qb', 'task/plan-large-ignore', worktree, 'HEAD');
    preparePlanState(worktree);
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), `#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
const args = process.argv.slice(2);
const result = spawnSync(process.env.REAL_GIT, args);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status === 0 && args[2] === 'ls-files' && args[3] === '--others' && args[4] === '--ignored') {
  process.stdout.write(Buffer.alloc(1024 * 1024 + 1));
}
process.exit(result.status ?? 1);
`);
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [
      planCleanupScript,
      '--repo', git(root, 'rev-parse', '--show-toplevel'),
      '--worktree', git(worktree, 'rev-parse', '--show-toplevel'),
      '--branch', 'task/plan-large-ignore',
      '--head', git(root, 'rev-parse', 'HEAD'),
    ], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit},
    });
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', 'task/plan-large-ignore'), '');
  } finally {
    rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper removes an unchanged ignored dependency symlink safely', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-plan-symlink-root-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-plan-symlink-bin-'));
  const target = mkdtempSync(join(tmpdir(), 'task-plan-symlink-target-'));
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nignored-link\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nln -s "$TASK_SYMLINK_TARGET" ignored-link\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'plan-symlink', '--id', 'fixed-id', '--repo', root, '--summary', 'Symlink plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, TASK_SYMLINK_TARGET: target},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-plan-symlink-fixed-id`);
    const cleaned = spawnSync(process.execPath, [
      planCleanupScript,
      '--repo', git(root, 'rev-parse', '--show-toplevel'),
      '--worktree', git(worktree, 'rev-parse', '--show-toplevel'),
      '--branch', 'task/plan-symlink-fixed-id',
      '--head', git(root, 'rev-parse', 'HEAD'),
    ], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', 'task/plan-symlink-fixed-id'), '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(target, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper restores a dangling ignored symlink after a later failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-plan-dangling-root-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-plan-dangling-bin-'));
  const marker = join(bin, 'status-count');
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\ndangling-link\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nln -s missing-target dangling-link\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'dangling', '--id', 'fixed-id', '--repo', root, '--summary', 'Dangling plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-dangling-fixed-id`);
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "status" ]; then count=0; [ ! -f "$STATUS_MARKER" ] || read count < "$STATUS_MARKER"; count=$((count + 1)); printf "%s\\n" "$count" > "$STATUS_MARKER"; [ "$count" -ne 4 ] || exit 55; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [
      planCleanupScript,
      '--repo', git(root, 'rev-parse', '--show-toplevel'),
      '--worktree', git(worktree, 'rev-parse', '--show-toplevel'),
      '--branch', 'task/dangling-fixed-id',
      '--head', git(root, 'rev-parse', 'HEAD'),
    ], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, STATUS_MARKER: marker},
    });
    assert.notEqual(cleaned.status, 0);
    assert.equal(lstatSync(join(worktree, 'dangling-link')).isSymbolicLink(), true);
    assert.equal(readlinkSync(join(worktree, 'dangling-link')), 'missing-target');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves ignored setup artifacts whose mode changed', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-mode-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-mode-bin-'));
  let worktree;
  try {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'guard@example.test');
    git(root, 'config', 'user.name', 'Guard Test');
    writeFileSync(join(root, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
    writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
    writeFileSync(join(root, 'package-lock.json'), '{}\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fixture');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'mode', '--id', 'fixed-id', '--repo', root, '--summary', 'Mode plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-mode-fixed-id`);
    const artifact = join(worktree, 'node_modules', 'pkg', 'file');
    chmodSync(artifact, 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', git(root, 'rev-parse', '--show-toplevel'), '--worktree', git(worktree, 'rev-parse', '--show-toplevel'), '--branch', 'task/mode-fixed-id', '--head', git(root, 'rev-parse', 'HEAD')], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.equal(readFileSync(artifact, 'utf8'), 'baseline\n');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper deinitializes and removes a clean submodule worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-clean-submodule-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-clean-dependency-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    const created = spawnSync(process.execPath, [creatorScript, 'plan-clean-submodule', '--id', 'fixed-id', '--repo', root, '--summary', 'Clean submodule plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file'},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-plan-clean-submodule-fixed-id`);
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-clean-submodule-fixed-id', '--head', head], {encoding: 'utf8'});
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(git(root, 'branch', '--list', 'task/plan-clean-submodule-fixed-id'), '');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper quarantines before submodule deinitialization', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-race-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-race-dependency-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-race-bin-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    const created = spawnSync(process.execPath, [creatorScript, 'plan-submodule-race', '--id', 'fixed-id', '--repo', root, '--summary', 'Submodule race plan', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file'},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-plan-submodule-race-fixed-id`);
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "submodule" ] && [ "$4" = "deinit" ]; then mkdir -p "$RACE_WORKTREE/vendor/dependency"; printf "preserve\\n" > "$RACE_WORKTREE/vendor/dependency/new-artifact"; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/plan-submodule-race-fixed-id', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, RACE_WORKTREE: canonicalWorktree},
    });
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(readFileSync(join(worktree, 'vendor', 'dependency', 'new-artifact'), 'utf8'), 'preserve\n');
  } finally {
    if (worktree) rmSync(worktree, {recursive: true, force: true});
    rmSync(bin, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves changed ignored artifacts inside a submodule', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-ignored-root-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-ignored-dependency-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-ignored-bin-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    writeFileSync(join(dependency, 'package.json'), '{"name":"dependency"}\n');
    writeFileSync(join(dependency, 'package-lock.json'), '{}\n');
    git(dependency, 'add', 'package.json', 'package-lock.json');
    git(dependency, 'commit', '-qm', 'add dependencies');
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'submodule-ignored', '--id', 'fixed-id', '--repo', root, '--summary', 'Submodule ignored', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file', PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-submodule-ignored-fixed-id`);
    const ignoredFile = join(worktree, 'vendor', 'dependency', 'node_modules', 'pkg', 'file');
    writeFileSync(ignoredFile, 'user change\n');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/submodule-ignored-fixed-id', '--head', head], {encoding: 'utf8'});
    assert.notEqual(cleaned.status, 0);
    assert.match(cleaned.stderr, /ignored artifacts changed/u);
    assert.equal(readFileSync(ignoredFile, 'utf8'), 'user change\n');
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});

test('cleanup helper preserves a submodule artifact changed during deinit', () => {
  const root = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-live-root-'));
  const dependency = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-live-dependency-'));
  const bin = mkdtempSync(join(tmpdir(), 'task-guard-plan-submodule-live-bin-'));
  let worktree;
  try {
    for (const directory of [root, dependency]) {
      git(directory, 'init', '-q', '-b', 'main');
      git(directory, 'config', 'user.email', 'guard@example.test');
      git(directory, 'config', 'user.name', 'Guard Test');
      writeFileSync(join(directory, '.gitignore'), '.agent-tmp/\nnode_modules/\n');
      writeFileSync(join(directory, 'file'), 'fixture\n');
      git(directory, 'add', '.');
      git(directory, 'commit', '-qm', 'fixture');
    }
    writeFileSync(join(dependency, 'package.json'), '{"name":"dependency"}\n');
    writeFileSync(join(dependency, 'package-lock.json'), '{}\n');
    git(dependency, 'add', 'package.json', 'package-lock.json');
    git(dependency, 'commit', '-qm', 'add dependencies');
    const added = spawnSync('git', ['-c', 'protocol.file.allow=always', '-C', root, 'submodule', 'add', '-q', dependency, 'vendor/dependency'], {encoding: 'utf8'});
    assert.equal(added.status, 0, added.stderr);
    git(root, 'commit', '-qm', 'add submodule');
    writeFileSync(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules/pkg\nprintf "baseline\\n" > node_modules/pkg/file\n');
    chmodSync(join(bin, 'npm'), 0o755);
    const created = spawnSync(process.execPath, [creatorScript, 'submodule-live', '--id', 'fixed-id', '--repo', root, '--summary', 'Submodule live race', '--plan-only'], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, GIT_ALLOW_PROTOCOL: 'file', PATH: `${bin}:${process.env.PATH}`},
    });
    assert.equal(created.status, 0, created.stderr);
    worktree = join(dirname(root), `${basename(root)}-task-submodule-live-fixed-id`);
    const ignoredFile = join(worktree, 'vendor', 'dependency', 'node_modules', 'pkg', 'file');
    const canonicalRoot = git(root, 'rev-parse', '--show-toplevel');
    const canonicalWorktree = git(worktree, 'rev-parse', '--show-toplevel');
    const head = git(root, 'rev-parse', 'HEAD');
    const realGit = spawnSync('sh', ['-c', 'command -v git'], {encoding: 'utf8'}).stdout.trim();
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nif [ "$3" = "submodule" ] && [ "$4" = "deinit" ]; then printf "live change\\n" > "$2/vendor/dependency/node_modules/pkg/file"; fi\nexec "$REAL_GIT" "$@"\n');
    chmodSync(join(bin, 'git'), 0o755);
    const cleaned = spawnSync(process.execPath, [planCleanupScript, '--repo', canonicalRoot, '--worktree', canonicalWorktree, '--branch', 'task/submodule-live-fixed-id', '--head', head], {
      encoding: 'utf8',
      env: {...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit},
    });
    assert.notEqual(cleaned.status, 0);
    assert.equal(readFileSync(ignoredFile, 'utf8'), 'live change\n');
  } finally {
    if (worktree) git(root, 'worktree', 'remove', '--force', worktree);
    rmSync(bin, {recursive: true, force: true});
    rmSync(dependency, {recursive: true, force: true});
    rmSync(root, {recursive: true, force: true});
  }
});
