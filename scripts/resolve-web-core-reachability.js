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
 *   resolveAppReachabilityVerdict(repoRoot, app, changedFiles, { fileExistsAtRef }) -> Promise<verdict>
 *     #1809, Phase 324: the single shared oracle both `check-app-version-bump.js` (gating
 *     `runCheck()`/`runFloor()`) and `resolve-frontend-build-triggers.js` (gating the CI
 *     build-trigger filter) call through -- one place that fixes the pre-#1809 shadow-mode bug
 *     where reachability was only ever checked against ONE of an app's REACHABILITY_SCOPE_DIRS
 *     dependency packages (whichever `depPackages.find()` happened to pick first), silently
 *     dropping a real changed file under the OTHER scoped package from consideration entirely.
 *     Here, `changedFiles` is the app's full changed-file list (not pre-filtered to one package) --
 *     this function does its own filtering against the full `REACHABILITY_SCOPE_DIRS` union.
 *     `fileExistsAtRef` is a REQUIRED, caller-injected `(relativePath) => boolean` -- this module
 *     deliberately has no git-ref awareness of its own (see above); a caller that omits it gets a
 *     thrown error immediately, not a silently-less-safe default (a caller-programming-error, not a
 *     runtime data condition -- this is the one thing this function does NOT catch and fail closed
 *     on). Every other failure mode (missing entry file, a `madge()` parse error, anything
 *     unexpected) is caught internally and degrades to the same conservative "changed" verdict a
 *     pre-#1809 caller would have reached -- this function never throws once past that one
 *     precondition check, mirroring the old (now-removed) `computeReachabilityShadowVerdict`'s own
 *     "never throws" contract so every consumer gets that safety net for free instead of
 *     re-implementing it.
 *     Returns `{ applicable: false, reason }` when there's no known bundler entry for `app`
 *     (backend app) or no changed file falls under `REACHABILITY_SCOPE_DIRS` at all. Otherwise
 *     `{ applicable: true, changed, code, safetyNetPassed, relevantChangedFiles, detail, ... }`
 *     where `code` is one of `'reachable'`, `'not-reachable'`, `'deleted-file-fail-closed'`,
 *     `'safety-net-tripped'`, or `'reachability-error-fail-closed'`.
 *
 * A single check-app-version-bump.js/resolve-frontend-build-triggers.js invocation calls
 * `computeAppReachableModules` once per fan-out-triggered app (up to 3 times, for
 * `dgfy-ims`/`dgfy-pos`/`dgfy-storefront` -- the only apps with a real bundler entry point;
 * `dgfy-api`/`dgfy-migration-runner` are backend, Node module resolution rather than a bundler
 * graph, explicitly out of scope per the plan's §3.5). Only one real `madge()` parse runs per
 * process for all of those calls combined -- see `buildUnionGraph()`'s cache below -- not three
 * separate parses.
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

// --- Self-referential alias resolution (`@/...`, `@sieitzz/...`) -----------------------------
//
// Each frontend app's vite.config.js resolves a handful of `@/...` aliases into
// packages/web-core (and, via packages/web-core/vite/webCoreRuntimeDeps.js's
// WEB_CORE_SRC_MAPPED_DEPS, `@sieitzz/shared-constants`/`@sieitzz/pos-receipt` into their own
// packages) at build time -- a rewrite madge's plain static import analysis knows nothing about.
// Left unhandled, any file that reaches a REACHABILITY_SCOPE_DIRS file ONLY through one of these
// aliases (never a relative import) is invisible to computeAppReachableModules(), silently
// UNDER-counting the reachable set (RF-2, PR #1708 review) -- confirmed live against this exact
// repo: packages/web-core/src/features/settings/modeItemTaxonomy.js reaches
// packages/shared-constants/src/workflowModes.js ONLY via `@sieitzz/shared-constants/workflowModes`,
// and apps/dgfy-ims/src itself imports that same family of specifiers directly (not just
// packages/web-core's own self-referential code). This is the opposite direction of the
// over-flag-not-under-flag philosophy §2/§3.3 already apply to Worker/dynamic-import risk, and
// just as dangerous: a real reachable change would misreport as "not-reachable".
//
// Fixed the same way the one other resolver gap in this file (Worker-URL construction, above) is
// already fixed: a static regex scan for the alias specifier shape, resolved through a known,
// hand-maintained alias map, folded in as synthetic graph edges (§3.2/§3.3) -- rather than handing
// madge's entire module resolution to a webpack/enhanced-resolve config, which would also have to
// faithfully reproduce Vite's extension/exports-map/dedupe behavior for every OTHER import in the
// tree (not just the aliased ones) to avoid silently changing resolution for code that already
// resolves correctly today. Lower blast radius, same technique already proven in this file.
//
// Deliberately an ALLOWLIST, not a denylist: only the exact alias keys confirmed live against all
// three apps' own vite.config.js `resolve.alias` arrays (dgfy-ims, dgfy-pos, dgfy-storefront) and
// packages/web-core/vite/webCoreRuntimeDeps.js's WEB_CORE_SRC_MAPPED_DEPS are recognized. A
// `@sieitzz/...` specifier this table doesn't know how to resolve trips the safety net outright
// (see resolveSelfAlias()) -- extending this table is the fix, not loosening that check. A
// `@/...` specifier gets one more chance first: resolveAgainstAnyAppRoot() below, for the
// app-owned aliases (`@/Pages`, the bare `@` fallback) that deliberately aren't listed here.
const SELF_REFERENTIAL_ALIASES = Object.freeze({
  '@/hooks': 'packages/web-core/src/hooks',
  '@/components': 'packages/web-core/Components',
  '@/lib': 'packages/web-core/src/lib',
  '@/services': 'packages/web-core/src/services',
  '@/src': 'packages/web-core/src',
  // Both are `file:` deps resolved through a package.json `exports` map via each app's own
  // node_modules symlink in production (webCoreRuntimeDeps.js's WEB_CORE_SRC_MAPPED_DEPS) --
  // aliasing straight to the real repo-root package source here is equivalent (every app's
  // node_modules symlink points at the same file: target) and avoids needing a per-app
  // node_modules lookup, which this repo-relative-only module doesn't have.
  '@sieitzz/shared-constants': 'packages/shared-constants/src',
  '@sieitzz/pos-receipt': 'packages/pos-receipt/src',
});

// Longest key first, so e.g. `@/services` is checked before any shorter key that happens to share
// its prefix -- no such collision exists in the table above today, but matching must never depend
// on Object.keys() insertion order.
const SELF_REFERENTIAL_ALIAS_KEYS = Object.keys(SELF_REFERENTIAL_ALIASES).sort((a, b) => b.length - a.length);

// Where a self-referential alias specifier can actually appear: packages/web-core and
// packages/shared-constants (the self-referential convention noted throughout this file and
// apps/*/vite.config.js's own comments), packages/pos-receipt (imports itself the same way --
// see ReceiptPrintView.jsx's real `@sieitzz/pos-receipt` import; omitting this dir would make
// auditReachabilitySafety() permanently unsafe against the real repo, not just theoretically
// incomplete), and every app with a real bundler entry (RF-2's own example -- an app's OWN
// source, not just packages/web-core's, uses these aliases directly).
const ALIAS_EDGE_SCAN_DIRS = Object.freeze([
  ...REACHABILITY_SCOPE_DIRS,
  'packages/pos-receipt',
  ...Object.keys(ENTRY_FILE_BY_APP).map((app) => `apps/${app}`),
]);

// Matches the specifier string of a static `import ... from '<spec>'`/`export ... from '<spec>'`,
// a bare side-effect `import '<spec>'`, a dynamic `import('<spec>')`, or a `require('<spec>')` --
// deliberately loose (a superset of the real grammar) per this file's existing over-flag-rather-
// than-under-flag scanning philosophy (see scanFileForViolations below).
const IMPORT_SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;

// Resolve `absPathNoExt` the way this scope's imports are actually written: an exact file, one of
// the recognized extensions appended, or (for a bare package-root alias like `@sieitzz/pos-
// receipt`, which has no subpath) an `index.<ext>` inside it if it's a directory.
function resolveModuleFile(absPathNoExt) {
  let stat;
  try {
    stat = fs.statSync(absPathNoExt);
  } catch {
    stat = null;
  }
  if (stat && stat.isFile()) return absPathNoExt;
  for (const ext of ['.js', '.jsx', '.mjs', '.cjs']) {
    const candidate = `${absPathNoExt}${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  if (stat && stat.isDirectory()) {
    for (const ext of ['.js', '.jsx', '.mjs', '.cjs']) {
      const candidate = path.join(absPathNoExt, `index${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// A `@/...` specifier that doesn't match any SELF_REFERENTIAL_ALIASES key MIGHT still be a
// legitimate, resolvable reference -- dgfy-ims's own `@/Pages` alias and its bare `@` app-root
// fallback (`{ find: '@', replacement: __dirname }`, both outside SELF_REFERENTIAL_ALIASES since
// neither can ever target REACHABILITY_SCOPE_DIRS). NOT a hypothetical: confirmed live, several
// packages/web-core Components files (e.g. Components/items/ItemCard.jsx) import `@/utils.js`,
// which only dgfy-ims's bare `@` fallback resolves, to apps/dgfy-ims/utils.js -- and that happens
// from INSIDE packages/web-core, so "which app's root" can't be inferred from the importing
// file's own location either (buildUnionGraph() unions all three apps into one parse; a shared
// web-core file has no single "current app"). Resolved by trying the specifier's `@/`-stripped
// remainder against every known app's REAL root directory (in whichever apps actually exist on
// disk) rather than assuming any `@/foo` that isn't a web-core alias is automatically fine --
// that would just re-introduce RF-2's own bug for a different prefix, silently swallowing a
// genuinely unresolvable (typo'd, or referencing a future alias this module hasn't been taught
// about) `@/...` specifier as if it were a harmless app-root reference. Only a specifier that
// resolves under at least one real app root is treated as such; anything that resolves under NONE
// of them falls through to "unresolved" like any other unrecognized alias. `@sieitzz/...`
// specifiers have no app-root-fallback equivalent, so this never applies to them.
function resolveAgainstAnyAppRoot(repoRoot, specifier) {
  if (!specifier.startsWith('@/')) return null;
  const remainder = specifier.slice('@/'.length);
  for (const app of Object.keys(ENTRY_FILE_BY_APP)) {
    const appRoot = path.join(repoRoot, 'apps', app);
    if (!fs.existsSync(appRoot)) continue;
    const absPathNoExt = remainder ? path.join(appRoot, remainder) : appRoot;
    if (resolveModuleFile(absPathNoExt)) return true;
  }
  return false;
}

// Resolves one import specifier against SELF_REFERENTIAL_ALIASES.
//   { kind: 'not-alias' }           -- doesn't start with `@/` or `@sieitzz/` at all, OR is a
//                                        `@/...` specifier that resolves under a real app's own
//                                        root instead (see resolveAgainstAnyAppRoot() above)
//   { kind: 'resolved', absPath }    -- a known alias, and its target file exists on disk
//   { kind: 'unresolved', reason }   -- alias-shaped, but this module can't prove where it goes
//                                        (unknown key whose specifier resolves nowhere, or a
//                                        known key whose target is missing)
function resolveSelfAlias(repoRoot, specifier) {
  if (!specifier.startsWith('@/') && !specifier.startsWith('@sieitzz/')) {
    return { kind: 'not-alias' };
  }
  const matchedKey = SELF_REFERENTIAL_ALIAS_KEYS.find((key) => specifier === key || specifier.startsWith(`${key}/`));
  if (!matchedKey) {
    if (resolveAgainstAnyAppRoot(repoRoot, specifier)) return { kind: 'not-alias' };
    return { kind: 'unresolved', reason: `no known alias mapping for "${specifier}", and it does not resolve under any app's own root either` };
  }
  const remainder = specifier.slice(matchedKey.length).replace(/^\//, '');
  const targetDir = path.join(repoRoot, SELF_REFERENTIAL_ALIASES[matchedKey]);
  const absPathNoExt = remainder ? path.join(targetDir, remainder) : targetDir;
  const resolved = resolveModuleFile(absPathNoExt);
  if (!resolved) {
    return {
      kind: 'unresolved',
      reason: `alias "${matchedKey}" resolved "${specifier}" to "${toRepoRelative(repoRoot, absPathNoExt)}", which does not exist on disk`,
    };
  }
  return { kind: 'resolved', absPath: resolved };
}

// Repo-wide scan (across `scanDirs`) for every self-referential alias import/require -- mirrors
// findWorkerUrlTargets()'s shape and purpose: `edges` feeds the same synthetic-edge injection
// buildUnionGraph() already does for Worker-URL targets; `violations` feeds
// auditReachabilitySafety()'s fail-closed result so an alias this module can't resolve trips the
// safety net instead of silently under-counting reachability.
function findSelfAliasEdges(repoRoot, scanDirs) {
  const edges = [];
  const violations = [];
  for (const dir of scanDirs) {
    const absDir = path.join(repoRoot, dir);
    if (!fs.existsSync(absDir)) continue;
    for (const absFile of walkScanFiles(absDir)) {
      let content;
      try {
        content = fs.readFileSync(absFile, 'utf8');
      } catch {
        continue; // an unreadable file is already reported by auditReachabilitySafety's own scan
      }
      const relativePath = toRepoRelative(repoRoot, absFile);
      for (const match of content.matchAll(IMPORT_SPECIFIER_RE)) {
        const specifier = match[2];
        const resolution = resolveSelfAlias(repoRoot, specifier);
        if (resolution.kind === 'not-alias') continue;
        if (resolution.kind === 'unresolved') {
          violations.push({ file: relativePath, pattern: 'unresolved-internal-alias', snippet: `"${specifier}" -- ${resolution.reason}` });
          continue;
        }
        edges.push({ from: relativePath, toAbs: resolution.absPath });
      }
    }
  }
  return { edges, violations };
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
  // RF-2 (PR #1708 review): the same synthetic-edge treatment as workerEdges, but for
  // `@/...`/`@sieitzz/...` self-referential alias imports -- see the "Self-referential alias
  // resolution" section above findSelfAliasEdges() for why this is a real, live gap otherwise
  // (`.violations` is deliberately unused here; it's auditReachabilitySafety()'s job to fail
  // closed on those, not this function's -- callers are expected to have already checked it).
  const aliasEdges = findSelfAliasEdges(repoRoot, ALIAS_EDGE_SCAN_DIRS).edges;
  const syntheticEdges = [...workerEdges, ...aliasEdges];
  const allEntryAbsPaths = unique([...knownEntryAbsPaths, ...syntheticEdges.map((edge) => edge.toAbs)]);

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

    // Inject the synthetic Worker-URL and self-referential-alias edges madge itself cannot see.
    // Each target file was already included as a real parsed entry point above, so its OWN
    // dependencies are already correctly present in `graph` -- this only adds the one edge from
    // the referencing file to it.
    for (const edge of syntheticEdges) {
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

// `aliasScanDirs` defaults to `packageDirs` (matching every existing caller/test that only ever
// passed one dirs argument) but is deliberately a separate parameter: RF-2 (PR #1708 review)'s
// unresolved-internal-alias check has to cover more than just the shared package itself -- an
// app's own source can (and, confirmed live, does) reference these aliases directly too -- while
// the risky-pattern checks above stay scoped exactly to `packageDirs`, unchanged, since those are
// about the shared package's own instability, not its consumers'.
function auditReachabilitySafety(repoRoot, packageDirs, aliasScanDirs = packageDirs) {
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
  // RF-2: any `@/...`/`@sieitzz/...` specifier this module can't prove resolves to a real file
  // trips the safety net exactly like the risky patterns above -- see findSelfAliasEdges()'s own
  // header for why silently ignoring it would be the same under-counting bug this exists to fix.
  violations.push(...findSelfAliasEdges(repoRoot, unique(aliasScanDirs)).violations);
  return { safe: violations.length === 0, violations };
}

// #1809, Phase 324: the shared reachability oracle -- see the file header for the full contract.
// Supersedes check-app-version-bump.js's old shadow-mode-only `computeReachabilityShadowVerdict`
// (which derived `relevantChangedFiles` from a single pre-picked fan-out package, the bug this
// function fixes by scoping against the full REACHABILITY_SCOPE_DIRS union instead).
async function resolveAppReachabilityVerdict(repoRoot, app, changedFiles, { fileExistsAtRef } = {}) {
  if (typeof fileExistsAtRef !== 'function') {
    throw new Error('resolveAppReachabilityVerdict: fileExistsAtRef is required (deletion handling needs git-ref context this module does not have)');
  }

  const entryFile = ENTRY_FILE_BY_APP[app];
  if (!entryFile) {
    return { applicable: false, reason: `no known bundler entry for ${app} (backend app -- out of scope)` };
  }

  const relevantChangedFiles = changedFiles.filter((file) =>
    REACHABILITY_SCOPE_DIRS.some((dir) => file.startsWith(`${dir}/`)));
  if (relevantChangedFiles.length === 0) {
    return { applicable: false, reason: 'no changed file under packages/web-core or packages/shared-constants' };
  }

  try {
    const scopeDirs = REACHABILITY_SCOPE_DIRS.filter((dir) => fs.existsSync(path.join(repoRoot, dir)));
    // RF-2 (PR #1708 review, carried forward here): the safety-net audit must also cover this
    // app's own source tree and packages/pos-receipt, not just the scoped packages themselves --
    // a self-referential `@/...`/`@sieitzz/...` alias this module can't resolve can appear in
    // either. See ALIAS_EDGE_SCAN_DIRS's own header comment above.
    const aliasScanDirs = [...new Set([...scopeDirs, 'packages/pos-receipt', `apps/${app}`])]
      .filter((dir) => fs.existsSync(path.join(repoRoot, dir)));
    const audit = auditReachabilitySafety(repoRoot, scopeDirs, aliasScanDirs);
    if (!audit.safe) {
      return {
        applicable: true,
        changed: true,
        code: 'safety-net-tripped',
        safetyNetPassed: false,
        violations: audit.violations,
        relevantChangedFiles,
        detail: `safety net found ${audit.violations.length} disqualifying pattern(s) in ${aliasScanDirs.join(', ')} -- falling back to conservative "changed"`,
      };
    }

    const reachable = await computeAppReachableModules(repoRoot, entryFile);
    const reachableHits = relevantChangedFiles.filter((file) => reachable.has(file));
    // §3.4: a file deleted between base and head can never appear in a graph built from HEAD's
    // working tree -- its absence there must not be silently read as "not reachable, therefore not
    // obligating a bump".
    const deletedHits = relevantChangedFiles.filter((file) => !reachable.has(file) && !fileExistsAtRef(file));
    const changed = reachableHits.length > 0 || deletedHits.length > 0;

    return {
      applicable: true,
      changed,
      code: reachableHits.length > 0 ? 'reachable' : (deletedHits.length > 0 ? 'deleted-file-fail-closed' : 'not-reachable'),
      safetyNetPassed: true,
      reachableCount: reachable.size,
      relevantChangedFiles,
      hitFiles: [...reachableHits, ...deletedHits],
      detail: changed
        ? `${reachableHits.length > 0 ? `reachability hit: ${reachableHits.slice(0, 3).join(', ')}${reachableHits.length > 3 ? ', ...' : ''}` : ''}`
          + `${reachableHits.length > 0 && deletedHits.length > 0 ? '; ' : ''}`
          + `${deletedHits.length > 0 ? `${deletedHits.length} deleted file(s) can't be checked for reachability, conservatively counted as changed: ${deletedHits.slice(0, 3).join(', ')}${deletedHits.length > 3 ? ', ...' : ''}` : ''}`
        : `none of ${relevantChangedFiles.length} changed file(s) under ${REACHABILITY_SCOPE_DIRS.join('/')} are reachable from ${entryFile} (${reachable.size} scoped modules reachable in total)`,
    };
  } catch (error) {
    // Never let an unexpected failure (a missing entry file, a madge parse error, ...) propagate
    // past this function -- degrade to the same conservative "changed" a pre-#1809 caller would
    // have reached. See the file header's contract for this function.
    return {
      applicable: true,
      changed: true,
      code: 'reachability-error-fail-closed',
      safetyNetPassed: false,
      relevantChangedFiles,
      detail: `reachability computation threw unexpectedly (${error.message}) -- falling back to conservative "changed"`,
    };
  }
}

module.exports = {
  REACHABILITY_SCOPE_DIRS,
  ENTRY_FILE_BY_APP,
  computeAppReachableModules,
  auditReachabilitySafety,
  resolveAppReachabilityVerdict,
};
