#!/usr/bin/env node
/**
 * Generic, manifest-driven compatibility-seam smoke runner (CMP-04 / SC3).
 *
 * Iterates every `status: "active"` entry in
 * docs/architecture/compatibility-seams.json (Phase 5's manifest, source of
 * truth) and runs that entry's `tests[]` through the owning package's test
 * runner, reporting pass/fail per seam id to `seam_smoke.json`. Future seams
 * registered in the manifest are picked up automatically — no runner change
 * required (D-04).
 *
 * FAIL-CLOSED (Pitfall 1): a seam's `tests[]` may point at a file whose real
 * integration probe is gated behind an env flag (e.g.
 * verifyContinuity.test.js's RUN_CONTINUITY_INTEGRATION). If the seam's
 * required integration env/credentials are absent, the seam result is
 * ok:false with an explanatory detail — a skipped integration test is NEVER
 * reported as a pass. An unknown seam id (no runner mapping for its test
 * path) also fails closed rather than silently passing.
 *
 * NOTE: reuses `loadManifest` from ./check-compat-seams.js — this file must
 * never define its own manifest JSON parser.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { loadManifest } = require('./check-compat-seams.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const CANONICAL_MANIFEST_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'compatibility-seams.json');

/**
 * seam-id -> required-integration-env list (Pitfall 1 / Open Question 3).
 * ALL listed vars must be present (and, where SEAM_REQUIRED_ENV_VALUES pins
 * an exact value, match it) for the seam's real behavior probe to run.
 */
const SEAM_REQUIRED_ENV = {
  'db-continuity-legacy-backup': [
    'RUN_CONTINUITY_INTEGRATION',
    'SOURCE_DB_HOST',
    'SOURCE_DB_USER',
    'SOURCE_DB_PASSWORD',
    'SOURCE_DB_NAME',
  ],
};

// Env vars whose value must match exactly (not just be non-empty) to enable
// the seam's integration probe. Also the values injected into the child
// process env when a seam's required env is satisfied.
const SEAM_REQUIRED_ENV_VALUES = {
  RUN_CONTINUITY_INTEGRATION: 'true',
};

/**
 * test-path prefix -> owning-package runner dispatcher. EXTENSION POINT:
 * add a new { prefix, run } entry here for seams owned by other packages
 * (backend jest, frontend vitest, root node --test, etc.) as they're
 * registered. Only the migration-runner (jest) case is built now — no
 * active seam uses another runner yet (Pitfall 2 / Open Question 2).
 */
const TEST_PATH_RUNNERS = [
  {
    prefix: 'apps/dgfy-migration-runner/tests/',
    run: (testPath, env) => runCommand('npm', ['--prefix', 'apps/dgfy-migration-runner', 'test', '--', testPath], env),
  },
];

/**
 * Duplicated inline spawnSync helper (matches the shape of
 * gate-release-local.js's `runCommand`, adapted to accept a per-call child
 * env so a seam's required integration flags can be injected without
 * mutating the parent process.env).
 */
function runCommand(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
    cwd: REPO_ROOT,
  });
  if (result.error) {
    return { ok: false, detail: `command failed to launch: ${command} ${args.join(' ')}: ${result.error.message}` };
  }
  return { ok: result.status === 0, detail: `${command} ${args.join(' ')} exited ${result.status}` };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function captureGitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: REPO_ROOT });
  if (result.status !== 0) return 'unknown-sha';
  return String(result.stdout || '').trim() || 'unknown-sha';
}

/**
 * Active-filter (D-04, A3): "active" means status === 'active' only —
 * 'accepted' is deliberately excluded.
 */
const filterActiveSeams = (manifest) => (
  (manifest && Array.isArray(manifest.seams) ? manifest.seams : [])
    .filter((seam) => seam && seam.status === 'active')
);

const resolveRequiredEnv = (seamId) => SEAM_REQUIRED_ENV[seamId] || null;

/**
 * Fail-closed missing-env check. Returns null when every required var for
 * the seam is present (and matches any pinned value); otherwise returns the
 * list of missing/mismatched var names. A seam with no entry in
 * SEAM_REQUIRED_ENV requires no integration env (returns null).
 */
const findMissingEnv = (seamId, env = process.env) => {
  const required = resolveRequiredEnv(seamId);
  if (!required) return null;

  const missing = required.filter((key) => {
    const value = env[key];
    if (value === undefined || value === '') return true;
    const pinned = SEAM_REQUIRED_ENV_VALUES[key];
    if (pinned !== undefined && value !== pinned) return true;
    return false;
  });

  return missing.length > 0 ? missing : null;
};

/**
 * Resolve the runner function for a test path via the TEST_PATH_RUNNERS
 * prefix map. Returns null when no mapping exists (unknown seam owner) —
 * callers must treat a null return as fail-closed, never a silent pass.
 */
const resolveRunnerForTestPath = (testPath) => {
  const match = TEST_PATH_RUNNERS.find((entry) => testPath.startsWith(entry.prefix));
  return match ? match.run : null;
};

/**
 * Run a single active seam's tests[] with required integration env set.
 * Fail-closed at every branch: missing required env, empty tests[], or an
 * unmapped test path all resolve to { ok:false }, never a pass.
 */
const runSeam = (seam, env = process.env) => {
  const missing = findMissingEnv(seam.id, env);
  if (missing) {
    return {
      id: seam.id,
      ok: false,
      detail: `Missing required integration env for seam "${seam.id}": ${missing.join(', ')} — a skipped integration test is never reported as a pass`,
    };
  }

  const testPaths = Array.isArray(seam.tests) ? seam.tests : [];
  if (testPaths.length === 0) {
    return { id: seam.id, ok: false, detail: `Seam "${seam.id}" has no tests[] entries to run` };
  }

  const childEnv = { ...env };
  const required = resolveRequiredEnv(seam.id) || [];
  required.forEach((key) => {
    if (SEAM_REQUIRED_ENV_VALUES[key] !== undefined) childEnv[key] = SEAM_REQUIRED_ENV_VALUES[key];
  });

  const results = testPaths.map((testPath) => {
    const run = resolveRunnerForTestPath(testPath);
    if (!run) {
      return { ok: false, detail: `No test-runner mapping for path "${testPath}" (unknown seam owner — fail-closed)` };
    }
    return run(testPath, childEnv);
  });

  const ok = results.every((result) => result.ok);
  return { id: seam.id, ok, detail: results.map((result) => result.detail).join(' | ') };
};

/**
 * Full pipeline: load manifest -> filter active -> run each seam. Pure
 * options in, structured result out — directly callable from tests.
 */
const runSeamSmoke = (options = {}) => {
  const manifestPath = options.manifestPath || CANONICAL_MANIFEST_PATH;
  const env = options.env || process.env;

  const manifest = loadManifest(manifestPath);
  const activeSeams = filterActiveSeams(manifest);
  const seams = activeSeams.map((seam) => runSeam(seam, env));
  const ok = seams.every((seam) => seam.ok);

  return { ok, seams, seamCount: seams.length };
};

const resolveEvidenceDir = (options = {}) => {
  if (options.evidenceDir) return options.evidenceDir;
  if (process.env.SEAM_SMOKE_EVIDENCE_DIR) return process.env.SEAM_SMOKE_EVIDENCE_DIR;
  const sha = (process.env.RELEASE_TARGET_SHA || captureGitSha()).toLowerCase();
  return path.join('.tmp', 'release-gates', sha);
};

function parseCliOptions(argv) {
  const options = {};
  const evidenceDirIndex = argv.indexOf('--evidence-dir');
  if (evidenceDirIndex !== -1 && argv[evidenceDirIndex + 1]) {
    options.evidenceDir = argv[evidenceDirIndex + 1];
  }
  return options;
}

function main() {
  const cliOptions = parseCliOptions(process.argv.slice(2));
  const evidenceDir = resolveEvidenceDir(cliOptions);
  ensureDir(evidenceDir);
  const outputFile = path.join(evidenceDir, 'seam_smoke.json');

  const result = runSeamSmoke();

  result.seams.forEach((seam) => {
    console.log(`[${seam.ok ? 'PASS' : 'FAIL'}] ${seam.id} :: ${seam.detail}`);
  });

  const payload = {
    generated_at: new Date().toISOString(),
    ok: result.ok,
    seam_count: result.seamCount,
    seams: result.seams,
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  console.log(`Seam smoke artifact: ${outputFile}`);

  if (!result.ok) process.exit(2);
}

if (require.main === module) main();

module.exports = {
  runSeamSmoke,
  filterActiveSeams,
  resolveRequiredEnv,
  findMissingEnv,
  resolveRunnerForTestPath,
  runSeam,
  resolveEvidenceDir,
  SEAM_REQUIRED_ENV,
  SEAM_REQUIRED_ENV_VALUES,
  TEST_PATH_RUNNERS,
};
