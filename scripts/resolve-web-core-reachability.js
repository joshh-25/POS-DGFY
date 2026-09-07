#!/usr/bin/env node
/**
 * Static reachability oracle for `packages/web-core` (and `packages/shared-constants`) -- #1695,
 * Phase 303 (shadow-mode, zero behavior change). Full investigation and design:
 * the #1695 plan doc (`computeAppReachableModules`/`auditReachabilitySafety`, §3.2-3.4).
 *
 * `check-app-version-bump.js`'s `detectChangedApps()` marks an app "changed" whenever ANY changed
 * file falls under a `file:`-dependency package directory -- directory containment, not reachability.
 * PR #1689 is a confirmed real false positive from this: `dgfy-storefront` was flagged changed (and
 * bumped) because `packages/web-core/src/utils/imageEncoding/bulk*` changed, even though
 * `dgfy-storefront`'s own bundle never imports that code (it's reached only through
 * `storefrontCatalogService.js`, itself imported only by admin/catalog-authoring code under
 * `dgfy-ims`/`dgfy-pos`).
 *
 * This module answers, for one app's real bundler entry point, "does this app's own module graph
 * actually reach file Y" -- a real reachability oracle, not a substitute for the directory check.
 * `check-app-version-bump.js` wires this in LOG-ONLY (shadow) mode: it computes and prints this
 * verdict alongside the existing directory-level one but keeps gating on the OLD verdict only.
 * Nothing here changes CI outcomes by itself.
 *
 * Built on `madge` (new devDependency) rather than a hand-rolled AST walker -- madge already
 * handles ESM static imports and dynamic `import()` natively. The #1695 plan's own audit (repo-wide
 * grep across `packages/web-core`'s ~842 files) found every dynamic `import()` specifier there is a
 * plain string literal (zero computed/templated specifiers), zero `import.meta.glob(...)` usage,
 * and exactly one `new Worker(...)` construction, in the one known-safe
 * `new Worker(new URL('<literal>', import.meta.url))` shape -- which is *not* an edge madge's own
 * static analysis follows (confirmed live: madge's parse of `imageEncoding/index.js` omits
 * `encodeWorker.js` from its dependency list entirely). `auditReachabilitySafety()` below re-checks
 * these exact risk patterns every time reachability narrowing is attempted (never a one-time
 * approval), and the one Worker pattern is folded into the graph as a synthetic edge (§3.2/§3.3).
 *
 * Deletion handling (§3.4) is NOT this module's job -- a file deleted between base and head can
 * never appear in a reachability graph built from HEAD's working tree, so "not reachable" would be
 * silently, wrongly correct-looking for a deleted file. That conservative override belongs to the
 * caller, which has the git ref context this module deliberately does not (see below).
 *
 * Reachability is always computed against the literal on-disk working tree under `repoRoot` (via
 * `fs`/`madge`, not `git show <ref>:path`) -- this matches `headGitRef === 'HEAD'`, the overwhelming
 * common case for a real PR-check invocation. For `--staged` mode (index vs. working tree can
 * differ if there are further unstaged edits on top of what's staged), this is a documented,
 * harmless simplification: shadow-mode output never gates anything, so a rare index/working-tree
 * mismatch here can, at worst, make one shadow-mode log line slightly stale -- never a false gate.
 *
 * Exports:
 *   computeAppReachableModules(repoRoot, entryFile) -> Promise<Set<repo-relative path>>
 *     Every `packages/web-core/**` or `packages/shared-constants/**` file reachable from
 *     `entryFile` (a repo-relative path, e.g. `apps/dgfy-storefront/src/main.jsx`) via static
 *     import/export edges, dynamic `import()`, or the one recognized synthetic Worker-URL edge.
 *     Everything outside those two package trees is dropped from the result -- irrelevant to the
 *     fan-out question this exists to answer, and dropping it keeps the Set small. Throws if
 *     `entryFile` does not exist on disk under `repoRoot` (cannot prove reachability from nothing).
 *
 *   auditReachabilitySafety(repoRoot, packageDirs) -> { safe: boolean, violations: [...] }
 *     The fail-closed precondition check (§3.3). Scans every non-test `.js`/`.jsx`/`.mjs`/`.cjs`
 *     file under each of `packageDirs` (repo-relative, e.g. `['packages/web-core',
 *     'packages/shared-constants']`) for the disqualifying patterns above. ANY violation anywhere
 *     in the package -- not just in the current diff -- means `safe: false`; a pre-existing risky
 *     file elsewhere on the path from an app entry to a changed file is just as dangerous as a
 *     risky file in the diff itself. `violations` is never empty when `safe` is false, and always
 *     empty when `safe` is true.
 *
 * A single `node scripts/check-app-version-bump.js` invocation calls `computeAppReachableModules`
 * once per fan-out-triggered app (up to 3 times, for `dgfy-ims`/`dgfy-pos`/`dgfy-storefront` -- the
 * only apps with a real bundler entry point; `dgfy-api`/`dgfy-migration-runner` are backend, Node
 * module resolution rather than a bundler graph, explicitly out of scope per the plan's §3.5). Only
 * one real `madge()` parse runs per process for all of those calls combined -- see
 * `buildUnionGraph()`'s cache below -- not three separate parses.
 */

const fs = require('node:fs');
const path = require('node:path');
const madge = require('madge');

// The two `file:`-dependency package trees this module ever reasons about. Everything else
// reached along the way (app-level files, node_modules-external skips) is real graph structure
// but irrelevant to "did this app's build reach a changed fan-out-package file" -- dropped from
// computeAppReachableModules()'s returned Set, but NOT dropped from the graph walk itself (an app
// file can only reach a web-core file by first reaching other app files).
const REACHABILITY_SCOPE_DIRS = Object.freeze(['packages/web-core', 'packages/shared-constants']);

// The three frontend apps' real Vite entry points (confirmed live against each app's own
// index.html <script type="module" src="..."> tag). dgfy-api/dgfy-migration-runner intentionally
// have no entry here -- see the file header.
const ENTRY_FILE_BY_APP = Object.freeze({
  'dgfy-ims': 'apps/dgfy-ims/src/main.jsx',
  'dgfy-pos': 'apps/dgfy-pos/src/main.jsx',
  'dgfy-storefront': 'apps/dgfy-storefront/src/main.jsx',
});

const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const TEST_FILE_NAME_RE = /\.test\.[jt]sx?$/;
const SCAN_EXCLUDE_DIR_NAMES = new Set(['node_modules', '__tests__']);

// Only a relative-URL literal Worker/SharedWorker construction is recognized as safe (the one
// pattern §2's audit found in the wild) -- capture group 2 is the literal specifier so the caller
// can resolve it relative to the referencing file.
const WORKER_URL_EDGE_RE = /\bnew\s+(?:Shared)?Worker\s*\(\s*new\s+URL\s*\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*,\s*import\.meta\.url\s*\)\s*\)/g;

const ANY_WORKER_CONSTRUCT_RE = /\bnew\s+(?:Shared)?Worker\s*\(/g;
const NON_LITERAL_IMPORT_CALL_RE = /\bimport\(\s*([^)]*)\)/g;
const NON_LITERAL_REQUIRE_CALL_RE = /\brequire\(\s*([^)]*)\)/g;
const BARE_STRING_LITERAL_RE = /^(['"])((?:(?!\1)[^\\]|\\.)*)\1$/;

const unique = (values) => [...new Set(values)];

function toRepoRelative(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function toNormalizedRelative(relativePath) {
  return String(relativePath).split(path.sep).join('/');
}

function* walkScanFiles(absDir) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SCAN_EXCLUDE_DIR_NAMES.has(entry.name)) continue;
      yield* walkScanFiles(path.join(absDir, entry.name));
    } else if (entry.isFile()) {
      if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;
      if (TEST_FILE_NAME_RE.test(entry.name)) continue;
      yield path.join(absDir, entry.name);
    }
  }
}

function resolveRelativeModule(fromAbsDir, specifier) {
  const base = path.resolve(fromAbsDir, specifier);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of ['.js', '.jsx', '.mjs', '.cjs']) {
    const candidate = `${base}${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// Repo-wide scan (across `scopeDirs`) for every `new Worker(new URL('<literal>', import.meta.url))`
// / `new SharedWorker(...)` call site -- the one edge shape madge's own static analysis does not
// follow. Returns `{ from: repo-relative path, toAbs: absolute path }` for every one whose target
// resolves to a real file, so the caller can (a) feed `toAbs` into madge as an additional entry
// point -- so the target's OWN transitive dependencies are correctly parsed too, not just this one
// edge -- and (b) inject the single `from -> to` edge the parse itself can't see.
function findWorkerUrlTargets(repoRoot, scopeDirs) {
  const edges = [];
  for (const dir of scopeDirs) {
    const absDir = path.join(repoRoot, dir);
    if (!fs.existsSync(absDir)) continue;
    for (const absFile of walkScanFiles(absDir)) {
      let content;
      try {
        content = fs.readFileSync(absFile, 'utf8');
      } catch {
        continue;
      }
      for (const match of content.matchAll(WORKER_URL_EDGE_RE)) {
        const specifier = match[2];
        if (!specifier.startsWith('.')) continue; // only a relative target is resolvable this way
        const resolved = resolveRelativeModule(path.dirname(absFile), specifier);
        if (resolved) edges.push({ from: toRepoRelative(repoRoot, absFile), toAbs: resolved });
      }
    }
  }
  return edges;
}

// One real madge() parse per repoRoot per process -- keyed by repoRoot, and rebuilt only if a
// caller asks about an entry file not already covered by the last build for that repoRoot (a fresh
// process, i.e. a fresh CI invocation, always starts with an empty cache, so this never serves
// stale data across separate `node scripts/check-app-version-bump.js` runs).
const graphCache = new Map();

async function buildUnionGraph(repoRoot, requiredEntryFile) {
  const cached = graphCache.get(repoRoot);
  if (cached && cached.includedEntries.has(requiredEntryFile)) {
    return cached.promise;
  }

  // Union the fixed known frontend entries (whichever exist on disk) with whatever entry was
  // actually requested -- covers this repo's real 3-app wiring in one parse (§3.2's "run madge
  // once... not three separate parses") while staying correct for an arbitrary caller/test entry
  // too.
  const entrySet = unique([...Object.values(ENTRY_FILE_BY_APP), requiredEntryFile]);
  const knownEntryAbsPaths = entrySet
    .map((relativePath) => path.join(repoRoot, relativePath))
    .filter((absolutePath) => fs.existsSync(absolutePath));

  const workerEdges = findWorkerUrlTargets(repoRoot, REACHABILITY_SCOPE_DIRS);
  const allEntryAbsPaths = unique([...knownEntryAbsPaths, ...workerEdges.map((edge) => edge.toAbs)]);

  const promise = (async () => {
    if (allEntryAbsPaths.length === 0) return {};

    const result = await madge(allEntryAbsPaths, {
      baseDir: repoRoot,
      fileExtensions: ['js', 'jsx', 'mjs', 'cjs'],
      // Dynamic import() is walked by default (skipAsyncImports defaults to false) -- the §2 audit
      // is what makes relying on that default safe/complete for this package today; the
      // fail-closed auditReachabilitySafety() below is what keeps that honest as the tree evolves.
      detectiveOptions: { es6: { skipAsyncImports: false } },
    });
    const graph = result.obj();

    // Inject the synthetic Worker-URL edges madge itself cannot see. The target file was already
    // included as a real parsed entry point above, so its OWN dependencies are already correctly
    // present in `graph` -- this only adds the one edge from the referencing file to it.
    for (const edge of workerEdges) {
      const toRel = toRepoRelative(repoRoot, edge.toAbs);
      if (!graph[edge.from]) graph[edge.from] = [];
      if (!graph[edge.from].includes(toRel)) graph[edge.from].push(toRel);
    }

    return graph;
  })();

  graphCache.set(repoRoot, { promise, includedEntries: new Set(entrySet) });
  return promise;
}

async function computeAppReachableModules(repoRoot, entryFile) {
  const normalizedEntry = toNormalizedRelative(entryFile);
  const absEntry = path.join(repoRoot, normalizedEntry);
  if (!fs.existsSync(absEntry)) {
    throw new Error(`resolve-web-core-reachability: entry file "${entryFile}" does not exist under ${repoRoot} -- cannot compute reachability`);
  }

  const graph = await buildUnionGraph(repoRoot, normalizedEntry);

  const seen = new Set([normalizedEntry]);
  const queue = [normalizedEntry];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of graph[current] || []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const scoped = new Set();
  for (const modulePath of seen) {
    if (REACHABILITY_SCOPE_DIRS.some((dir) => modulePath === dir || modulePath.startsWith(`${dir}/`))) {
      scoped.add(modulePath);
    }
  }
  return scoped;
}

// Pure regex scan of one file's content for the disqualifying patterns (§2/§3.3). Deliberately the
// same cheap, regex-based method as the plan's own audit -- not an AST parse -- so an ambiguous
// match (e.g. a literal string followed by a trailing comment inside the call) is allowed to
// over-flag rather than risk under-flagging: a false "violation" only ever makes the narrowing
// fall back to today's conservative behavior, never the other way around.
function scanFileForViolations(relativePath, content) {
  const violations = [];

  for (const match of content.matchAll(NON_LITERAL_IMPORT_CALL_RE)) {
    // An empty argument (`import()`) is not valid JS for a real dynamic import (which requires
    // exactly one argument) -- it can only occur inside a comment or string, e.g. a code span like
    // `` `import()` `` documenting the pattern in prose. Skip it rather than flag it; this mirrors
    // the §2 audit's own grep (`import\([^'"` + '`' + `)]`), which also requires a real character
    // right after `(` and so never matched this shape either.
    const arg = match[1].trim();
    if (arg.length > 0 && !BARE_STRING_LITERAL_RE.test(arg)) {
      violations.push({ file: relativePath, pattern: 'non-literal-dynamic-import', snippet: match[0].slice(0, 160) });
    }
  }

  for (const match of content.matchAll(NON_LITERAL_REQUIRE_CALL_RE)) {
    const arg = match[1].trim();
    if (arg.length > 0 && !BARE_STRING_LITERAL_RE.test(arg)) {
      violations.push({ file: relativePath, pattern: 'non-literal-require', snippet: match[0].slice(0, 160) });
    }
  }

  if (content.includes('import.meta.glob')) {
    violations.push({ file: relativePath, pattern: 'import-meta-glob', snippet: 'import.meta.glob(...) enumerates the filesystem at build time -- not a fixed set of edges' });
  }

  const anyWorkerCount = (content.match(ANY_WORKER_CONSTRUCT_RE) || []).length;
  const safeWorkerCount = (content.match(WORKER_URL_EDGE_RE) || []).length;
  if (anyWorkerCount > safeWorkerCount) {
    violations.push({
      file: relativePath,
      pattern: 'unrecognized-worker-construct',
      snippet: `${anyWorkerCount - safeWorkerCount} Worker/SharedWorker construction(s) not matching the known-safe new (Shared)Worker(new URL('<literal>', import.meta.url)) shape`,
    });
  }

  return violations;
}

function auditReachabilitySafety(repoRoot, packageDirs) {
  const violations = [];
  for (const dir of packageDirs) {
    const absDir = path.join(repoRoot, dir);
    if (!fs.existsSync(absDir)) continue;
    for (const absFile of walkScanFiles(absDir)) {
      let content;
      try {
        content = fs.readFileSync(absFile, 'utf8');
      } catch {
        // An unreadable file is itself a reason not to trust completeness -- fail closed rather
        // than silently skip it.
        violations.push({ file: toRepoRelative(repoRoot, absFile), pattern: 'unreadable-file', snippet: 'could not read file content' });
        continue;
      }
      violations.push(...scanFileForViolations(toRepoRelative(repoRoot, absFile), content));
    }
  }
  return { safe: violations.length === 0, violations };
}

module.exports = {
  REACHABILITY_SCOPE_DIRS,
  ENTRY_FILE_BY_APP,
  computeAppReachableModules,
  auditReachabilitySafety,
};
