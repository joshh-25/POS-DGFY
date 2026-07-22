#!/usr/bin/env node
/**
 * Compatibility-seam manifest validator (CMP-02).
 *
 * Enforces docs/architecture/compatibility-seams.json as the single source
 * of truth for legacy compatibility seams:
 *   1. Schema validation (version, seam shape, id/type/status enums).
 *   2. Completeness gate — active/accepted seams must carry non-empty
 *      governance fields (rationale, tests, rollback, removal_criteria).
 *   3. Path-safety + existence for every `tests` entry (ASVS V5).
 *   4. Bidirectional code<->manifest reconciliation via an in-code seam
 *      marker comment convention.
 *
 * Supports both CI mode (default, full-tree scan) and `--staged` mode
 * (pre-commit, restricted to `git diff --cached --name-only`).
 *
 * NOTE: the seam marker token this file scans for is deliberately never
 * spelled out as a single literal substring anywhere in this file (including
 * comments) — see MARKER_TAG below. Writing the literal marker text in this
 * script (or in check-compat-seams.test.js) would make the full-repo scan
 * match its own source and fail the build on a phantom entry.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = new Set(process.argv.slice(2));
const useStagedCli = args.has('--staged');

const REPO_ROOT = path.resolve(__dirname, '..');
process.chdir(REPO_ROOT);

const CANONICAL_MANIFEST_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'compatibility-seams.json');

const VALID_TYPES = new Set(['db-level', 'api-boundary', 'build-time', 'data-migration']);
const VALID_STATUSES = new Set(['active', 'accepted', 'pending', 'removed']);
const COMPLETE_STATUSES = new Set(['active', 'accepted']);
const ALLOWED_TOP_LEVEL_KEYS = new Set(['version', 'seams']);
const ALLOWED_SEAM_KEYS = new Set(['id', 'type', 'status', 'rationale', 'tests', 'rollback', 'removal_criteria']);
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const CODE_FILE_EXTENSIONS = ['.js', '.mjs', '.cjs'];
const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.planning', 'dist', 'build', 'coverage', '.next', '.cache']);

// Built from parts on purpose (see file header) — never a single literal token.
const MARKER_TAG = ['@compat', '-seam'].join('');
const MARKER_KEY = ['i', 'd', '='].join('');
const MARKER_PATTERN = new RegExp(`${MARKER_TAG}\\s+${MARKER_KEY}([a-z0-9-]+)`, 'g');

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const unique = (values) => [...new Set(values)];
const toPosixPath = (inputPath) => inputPath.replace(/\\/g, '/');

const runCommand = (command, { allowFail = false, cwd = REPO_ROOT } = {}) => {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], cwd }).trim();
  } catch (error) {
    if (allowFail) return '';
    throw error;
  }
};

const splitLines = (raw) => (
  String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
);

/**
 * Resolve the manifest path for this run: explicit option wins, then the
 * COMPAT_SEAMS_MANIFEST_PATH env override (testing only, so tests never
 * mutate the real manifest), then the canonical repo path.
 */
const resolveManifestPath = (options = {}) => {
  if (options.manifestPath) return path.resolve(options.manifestPath);
  if (process.env.COMPAT_SEAMS_MANIFEST_PATH) return path.resolve(process.env.COMPAT_SEAMS_MANIFEST_PATH);
  return CANONICAL_MANIFEST_PATH;
};

/**
 * Resolve the repo root used for (a) the code-marker scan and (b) resolving
 * manifest `tests` paths. Explicit option wins, then COMPAT_SEAMS_REPO_ROOT
 * (testing only), then the real repo root.
 */
const resolveRepoRoot = (options = {}) => {
  if (options.repoRoot) return path.resolve(options.repoRoot);
  if (process.env.COMPAT_SEAMS_REPO_ROOT) return path.resolve(process.env.COMPAT_SEAMS_REPO_ROOT);
  return REPO_ROOT;
};

const loadManifest = (manifestPath) => {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  const raw = fs.readFileSync(manifestPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Manifest at ${manifestPath} is not valid JSON: ${error.message}`);
  }
};

/**
 * Schema validation: strict top-level/per-seam key allowlist, version pin,
 * id uniqueness + kebab-case, type/status enums. Never touches the filesystem.
 */
const validateManifestSchema = (manifest) => {
  const failures = [];

  if (manifest == null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    failures.push('Manifest root must be a JSON object');
    return { failures, seams: [] };
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      failures.push(`Unknown top-level manifest key "${key}"`);
    }
  }

  if (manifest.version !== 1) {
    failures.push(`Manifest "version" must be 1, got ${JSON.stringify(manifest.version)}`);
  }

  if (!Array.isArray(manifest.seams)) {
    failures.push('Manifest "seams" must be an array');
    return { failures, seams: [] };
  }

  const seenIds = new Set();

  manifest.seams.forEach((seam, index) => {
    const label = `seams[${index}]`;

    if (seam == null || typeof seam !== 'object' || Array.isArray(seam)) {
      failures.push(`${label} must be an object`);
      return;
    }

    for (const key of Object.keys(seam)) {
      if (!ALLOWED_SEAM_KEYS.has(key)) {
        failures.push(`${label} (id=${seam.id || 'unknown'}) has unknown key "${key}"`);
      }
    }

    if (typeof seam.id !== 'string' || !KEBAB_CASE_PATTERN.test(seam.id)) {
      failures.push(`${label}.id must be a kebab-case string, got ${JSON.stringify(seam.id)}`);
    } else if (seenIds.has(seam.id)) {
      failures.push(`Duplicate seam id "${seam.id}"`);
    } else {
      seenIds.add(seam.id);
    }

    if (!VALID_TYPES.has(seam.type)) {
      failures.push(`${label} (id=${seam.id || 'unknown'}).type must be one of ${[...VALID_TYPES].join(', ')}, got ${JSON.stringify(seam.type)}`);
    }

    if (!VALID_STATUSES.has(seam.status)) {
      failures.push(`${label} (id=${seam.id || 'unknown'}).status must be one of ${[...VALID_STATUSES].join(', ')}, got ${JSON.stringify(seam.status)}`);
    }
  });

  return { failures, seams: manifest.seams };
};

/**
 * Completeness gate (D-06): active/accepted seams must carry non-empty
 * rationale/rollback/removal_criteria and a non-empty tests array.
 */
const validateSeamCompleteness = (seam) => {
  const failures = [];
  if (!seam || !COMPLETE_STATUSES.has(seam.status)) return failures;

  const label = `seam "${seam.id || 'unknown'}"`;

  if (!isNonEmptyString(seam.rationale)) failures.push(`${label}.rationale must be a non-empty string`);
  if (!isNonEmptyString(seam.rollback)) failures.push(`${label}.rollback must be a non-empty string`);
  if (!isNonEmptyString(seam.removal_criteria)) failures.push(`${label}.removal_criteria must be a non-empty string`);
  if (!Array.isArray(seam.tests) || seam.tests.length === 0) {
    failures.push(`${label}.tests must be a non-empty array`);
  }

  return failures;
};

/**
 * Path-safety (ASVS V5) + existence for every `tests` entry. Absolute paths
 * and `..` segments are rejected BEFORE any fs.existsSync call.
 */
const validateSeamTestPaths = (seam, repoRoot) => {
  const failures = [];
  if (!seam || !Array.isArray(seam.tests)) return failures;

  const label = `seam "${seam.id || 'unknown'}"`;

  for (const testPath of seam.tests) {
    if (typeof testPath !== 'string' || !testPath.trim()) {
      failures.push(`${label}.tests contains an invalid entry: ${JSON.stringify(testPath)}`);
      continue;
    }

    if (path.isAbsolute(testPath)) {
      failures.push(`${label}.tests path "${testPath}" must be repo-relative, not absolute`);
      continue;
    }

    if (testPath.split(/[\\/]/).includes('..')) {
      failures.push(`${label}.tests path "${testPath}" must not contain ".." segments`);
      continue;
    }

    const resolved = path.resolve(repoRoot, testPath);
    const relativeToRoot = path.relative(repoRoot, resolved);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      failures.push(`${label}.tests path "${testPath}" resolves outside the repository root`);
      continue;
    }

    // Only reached once the path is proven repo-relative and traversal-free.
    if (!fs.existsSync(resolved)) {
      failures.push(`${label}.tests path "${testPath}" does not exist`);
    }
  }

  return failures;
};

const isSeamComplete = (seam, repoRoot) => (
  Boolean(seam)
    && COMPLETE_STATUSES.has(seam.status)
    && validateSeamCompleteness(seam).length === 0
    && validateSeamTestPaths(seam, repoRoot).length === 0
);

const collectCodeFiles = (directoryPath, repoRoot, out = []) => {
  if (!fs.existsSync(directoryPath)) return out;

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      collectCodeFiles(path.join(directoryPath, entry.name), repoRoot, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!CODE_FILE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;

    out.push(path.join(directoryPath, entry.name));
  }

  return out;
};

const resolveStagedCodeFiles = (repoRoot) => {
  const staged = unique(splitLines(runCommand('git diff --cached --name-only', { allowFail: true, cwd: repoRoot })));
  return staged
    .filter((relativePath) => CODE_FILE_EXTENSIONS.some((ext) => relativePath.endsWith(ext)))
    .filter((relativePath) => !relativePath.split('/').some((segment) => SKIP_DIR_NAMES.has(segment)))
    .map((relativePath) => path.resolve(repoRoot, relativePath))
    .filter((absolutePath) => fs.existsSync(absolutePath));
};

const resolveCodeFilesForScan = (repoRoot, staged) => (
  staged ? resolveStagedCodeFiles(repoRoot) : collectCodeFiles(repoRoot, repoRoot)
);

/**
 * Scan the given code files for seam marker comments, resetting the shared
 * `/g` regex's lastIndex between reads (RESEARCH: guardrail hasPattern idiom).
 */
const scanCodeMarkers = (codeFiles, repoRoot) => {
  const markerIdsByFile = new Map();

  for (const absolutePath of codeFiles) {
    const source = fs.readFileSync(absolutePath, 'utf8');
    MARKER_PATTERN.lastIndex = 0;
    const idsInFile = [];
    let match = MARKER_PATTERN.exec(source);
    while (match !== null) {
      idsInFile.push(match[1]);
      match = MARKER_PATTERN.exec(source);
    }
    MARKER_PATTERN.lastIndex = 0;

    if (idsInFile.length > 0) {
      markerIdsByFile.set(toPosixPath(path.relative(repoRoot, absolutePath)), idsInFile);
    }
  }

  return markerIdsByFile;
};

/**
 * Bidirectional reconciliation (D-05c):
 *   - every marker id must map to a complete active/accepted manifest entry.
 *   - every active/accepted manifest entry must appear as at least one
 *     marker (orphan-entry check) — skipped in --staged mode, where only a
 *     partial file set is visible.
 */
const reconcileMarkersAndSeams = (seams, markerIdsByFile, repoRoot, { staged = false } = {}) => {
  const failures = [];

  const markerIds = new Set();
  for (const ids of markerIdsByFile.values()) {
    ids.forEach((id) => markerIds.add(id));
  }

  const seamById = new Map(
    seams.filter((seam) => seam && typeof seam.id === 'string').map((seam) => [seam.id, seam])
  );

  for (const [relativePath, ids] of markerIdsByFile.entries()) {
    for (const id of ids) {
      const seam = seamById.get(id);
      if (!isSeamComplete(seam, repoRoot)) {
        failures.push(`Code marker id "${id}" in ${relativePath} has no complete active/accepted manifest entry`);
      }
    }
  }

  if (!staged) {
    for (const seam of seams) {
      if (!seam || !COMPLETE_STATUSES.has(seam.status)) continue;
      if (!markerIds.has(seam.id)) {
        failures.push(`Manifest seam "${seam.id}" is ${seam.status} but no matching code marker was found (orphan entry)`);
      }
    }
  }

  return failures;
};

/**
 * Full validation pipeline. Pure options in, structured result out — no
 * process.exit here, so this is directly callable from tests.
 */
const runCheck = (options = {}, logger = console) => {
  const repoRoot = resolveRepoRoot(options);
  const manifestPath = resolveManifestPath(options);
  const staged = Boolean(options.staged);

  const failures = [];
  let seams = [];

  let manifest;
  try {
    manifest = loadManifest(manifestPath);
  } catch (error) {
    return { ok: false, failures: [error.message], manifestPath, repoRoot, seamCount: 0 };
  }

  const schemaResult = validateManifestSchema(manifest);
  failures.push(...schemaResult.failures);
  seams = schemaResult.seams;

  for (const seam of seams) {
    if (!seam || typeof seam !== 'object' || Array.isArray(seam)) continue;
    failures.push(...validateSeamCompleteness(seam));
    failures.push(...validateSeamTestPaths(seam, repoRoot));
  }

  const codeFiles = resolveCodeFilesForScan(repoRoot, staged);
  const markerIdsByFile = scanCodeMarkers(codeFiles, repoRoot);
  failures.push(...reconcileMarkersAndSeams(seams, markerIdsByFile, repoRoot, { staged }));

  if (logger && typeof logger.log === 'function' && options.verbose) {
    logger.log(`[check:compat-seams] Scanned ${codeFiles.length} code file(s) under ${repoRoot}`);
  }

  return { ok: failures.length === 0, failures, manifestPath, repoRoot, seamCount: seams.length };
};

const main = () => {
  const result = runCheck({ staged: useStagedCli });

  if (!result.ok) {
    console.error('[check:compat-seams] FAILED');
    result.failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log('[check:compat-seams] PASS');
  console.log(`[check:compat-seams] Seams checked: ${result.seamCount}`);
};

if (require.main === module) main();

module.exports = {
  runCheck,
  loadManifest,
  validateManifestSchema,
  validateSeamCompleteness,
  validateSeamTestPaths,
  scanCodeMarkers,
  reconcileMarkersAndSeams,
  resolveManifestPath,
  resolveRepoRoot,
  resolveCodeFilesForScan,
  VALID_TYPES,
  VALID_STATUSES,
};
