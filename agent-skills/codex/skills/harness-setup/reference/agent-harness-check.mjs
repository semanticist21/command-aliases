#!/usr/bin/env node
// Portable agent handoff guard. Config-driven, runtime-agnostic (plain Node ESM).
// Looks at changed files and nudges the agent about missing tests and stale docs
// before a commit or end-of-turn. Reads ./harness.config.json from the repo root.
//
// Modes (flags): --staged (default) | --worktree | --all   and   --reminder
//   --reminder downgrades errors to warnings and always exits 0 (for warn-only
//   Stop/end-of-turn hooks). Without it, any error exits 1 (for pre-commit/CI).

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

let repoRoot
try {
  repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
} catch {
  console.warn('WARN not a git repository; skipping agent harness check')
  process.exit(0)
}
const cfg = loadConfig()
const args = new Set(process.argv.slice(2))
const mode = args.has('--all') ? 'all' : args.has('--worktree') ? 'worktree' : 'staged'
const reminderOnly = args.has('--reminder')

const errors = []
const warnings = []
const HANGUL = /[가-힣]/

const files = listFiles(mode).filter(isRelevant)
const sources = files.filter(isSource)
const tests = files.filter(isTest)
const docs = files.filter(isDoc)

checkTestPairing(sources, tests)
checkDurableDocs(sources, docs)
checkRoleComments(files)
report()

function loadConfig() {
  const path = join(repoRoot, 'harness.config.json')
  const base = {
    ignorePrefixes: ['node_modules/', '.git/', 'dist/', 'build/', 'target/', 'vendor/'],
    sourceExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs', '.go', '.py'],
    testPatterns: ['(^|/)__tests__/', '\\.test\\.', '\\.spec\\.', '(^|/)tests?/'],
    testableGlobs: [], // path prefixes whose changes should be paired with a test; [] = any source
    docFileNames: ['AGENTS.md', 'CLAUDE.md'],
    durableSourceGlobs: [], // path prefixes where a touched dir should also update its agent-doc; [] = any source
    // Opt-in (blocking) role-comment rules; [] = off. Each rule:
    //   { pathPrefix, extensions, lang: 'js'|'rust', requireHangul?: bool, exclude?: [basename] }
    // Enforces a one-line leading comment on each exported/public declaration in that tree.
    roleComments: [],
  }
  if (!existsSync(path)) return base
  try {
    return { ...base, ...JSON.parse(readFileSync(path, 'utf8')) }
  } catch (err) {
    console.warn(`WARN could not parse harness.config.json (${err.message}); using defaults`)
    return base
  }
}

function listFiles(which) {
  if (which === 'all') {
    return gitFiles('ls-files').filter((f) => existsSync(join(repoRoot, f)))
  }
  const staged = gitFiles('diff --cached --name-only --diff-filter=ACMR')
  if (which === 'staged') return staged
  return unique([
    ...staged,
    ...gitFiles('diff --name-only --diff-filter=ACMR'),
    ...gitFiles('ls-files --others --exclude-standard'),
  ])
}

// quotepath=false + NUL termination keeps non-ASCII (e.g. Korean) and spaced paths intact.
function gitFiles(subcommand) {
  const out = execSync(`git -c core.quotepath=false ${subcommand} -z`, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return out.split('\0').filter(Boolean)
}

function unique(items) {
  return [...new Set(items)]
}

function isRelevant(file) {
  return !cfg.ignorePrefixes.some((p) => file.startsWith(p))
}

function isSource(file) {
  const base = file.slice(file.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return false // no extension (dot at 0 = dotfile)
  return cfg.sourceExtensions.includes(base.slice(dot))
}

function isTest(file) {
  return cfg.testPatterns.some((p) => new RegExp(p).test(file))
}

function isDoc(file) {
  const base = file.slice(file.lastIndexOf('/') + 1)
  return file.endsWith('.md') || cfg.docFileNames.includes(base)
}

function matchesAny(file, globs) {
  return globs.length === 0 || globs.some((g) => file.startsWith(g))
}

// Source logic changed but no test file changed -> nudge to add/adjust a test.
function checkTestPairing(sourceFiles, testFiles) {
  const testable = sourceFiles.filter((f) => !isTest(f) && matchesAny(f, cfg.testableGlobs))
  if (testable.length === 0 || testFiles.length > 0) return
  warnings.push('testable code changed but no test file changed; add/adjust a test or record why omitted in handoff')
}

// A touched source tree should keep its nearest agent-doc current.
function checkDurableDocs(sourceFiles, docFiles) {
  const durable = sourceFiles.filter((f) => matchesAny(f, cfg.durableSourceGlobs))
  if (durable.length === 0) return
  const missing = new Set()
  for (const file of durable) {
    if (!nearestDoc(dirname(file))) missing.add(topFolder(file))
  }
  for (const folder of missing) {
    warnings.push(`${folder}: no ${cfg.docFileNames.join('/')} found in parent chain`)
  }
  const touchedDoc = docFiles.some((f) => cfg.docFileNames.includes(f.slice(f.lastIndexOf('/') + 1)))
  if (!touchedDoc) {
    warnings.push(`durable behavior may have changed; review the nearest ${cfg.docFileNames[0]} and update if future sessions need the context`)
  }
}

function nearestDoc(folder) {
  let current = join(repoRoot, folder)
  while (true) {
    for (const name of cfg.docFileNames) {
      if (existsSync(join(current, name))) return join(current, name)
    }
    const rel = relative(repoRoot, current)
    if (rel === '' || rel.startsWith('..')) return null
    current = dirname(current)
  }
}

function topFolder(file) {
  const i = file.indexOf('/')
  return i === -1 ? '.' : file.slice(0, i)
}

// Opt-in: every exported/public declaration in a configured tree needs a leading
// comment (and Korean text when requireHangul). Failures are blocking errors.
function checkRoleComments(allFiles) {
  for (const rule of cfg.roleComments) {
    const exts = rule.extensions || []
    const exclude = rule.exclude || []
    const detect = rule.lang === 'rust' ? rustDecl : jsDecl
    const leading = rule.lang === 'rust' ? rustLeadingComment : jsLeadingComment
    const targets = allFiles.filter(
      (f) =>
        f.startsWith(rule.pathPrefix) &&
        exts.includes(f.slice(f.lastIndexOf('.'))) &&
        !isTest(f) &&
        !exclude.some((name) => f.endsWith(name)),
    )
    for (const file of targets) {
      const lines = readFileSync(join(repoRoot, file), 'utf8').split('\n')
      const limit = rule.lang === 'rust' ? rustBodyEnd(lines) : lines.length
      for (let i = 0; i < limit; i++) {
        if (!detect(lines[i])) continue
        const comment = leading(lines, i)
        if (comment === null) {
          errors.push(`${file}:${i + 1} exported/public declaration needs a one-line leading role comment`)
        } else if (rule.requireHangul && !HANGUL.test(comment)) {
          errors.push(`${file}:${i + 1} role comment must be written in Korean (Hangul)`)
        }
      }
    }
  }
}

function jsDecl(line) {
  const t = line.trim()
  if (t.startsWith('export {') || t.startsWith('export *')) return false
  if (/^export\s+(type|interface|enum|class|function)\s+[A-Za-z0-9_$]+/.test(t)) return true
  if (/^export\s+const\s+[A-Za-z0-9_$]+/.test(t)) return true
  if (/^export\s+default\s+function\s+[A-Za-z0-9_$]+/.test(t)) return true
  return /^(function|const)\s+[A-Z][A-Za-z0-9_$]+/.test(t)
}

function jsLeadingComment(lines, index) {
  for (let c = index - 1; c >= 0; c--) {
    const prev = lines[c].trim()
    if (prev === '') continue
    return /^(\/\/|\/\*\*?|\*)/.test(prev) ? prev : null
  }
  return null
}

// Module-top-level (col 0) pub item; indented members are covered by a parent comment.
function rustDecl(line) {
  if (/^\s/.test(line)) return false
  return /^pub(\([a-z]+\))?\s+(?:async\s+|unsafe\s+|extern\s+"[^"]*"\s+)*(fn|struct|enum|trait|type|const|static|union)\b/.test(
    line,
  )
}

function rustLeadingComment(lines, index) {
  for (let c = index - 1; c >= 0; c--) {
    const prev = lines[c].trim()
    if (prev === '' || prev.startsWith('#[') || prev.startsWith('#![')) continue
    return prev.startsWith('//') ? prev : null
  }
  return null
}

function rustBodyEnd(lines) {
  const t = lines.findIndex((l) => l.trim().startsWith('#[cfg(test)]'))
  return t === -1 ? lines.length : t
}

function report() {
  for (const w of warnings) console.warn(`WARN ${w}`)
  if (errors.length > 0) {
    if (reminderOnly) {
      for (const e of errors) console.warn(`WARN ${e}`)
      console.warn('REMINDER record durable context for these changes if future sessions need it')
      process.exit(0)
    }
    for (const e of errors) console.error(`ERROR ${e}`)
    process.exit(1)
  }
  if (reminderOnly && warnings.length > 0) {
    console.warn('REMINDER record durable context for these changes if future sessions need it')
    process.exit(0)
  }
  console.log(`agent harness ok (${files.length} files checked, mode=${mode})`)
}
