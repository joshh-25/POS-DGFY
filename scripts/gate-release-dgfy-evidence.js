#!/usr/bin/env node
/**
 * On-demand DGFY release-evidence orchestrator gate (CMP-04 / D-01).
 *
 * Aggregates architecture-boundary checks, migration-verification +
 * tenant-drift evidence (06-01's `release-evidence` runner subcommand), and
 * compatibility-seam smoke (06-02's `scripts/dgfy-seam-smoke.js`) into a
 * single release_verdict-contract artifact (`dgfy_release_evidence.json`)
 * validated by `scripts/verify-release-verdict.js`.
 *
 * D-05: this is additive and on-demand only — it never touches
 * `.github/workflows/ci.yml` or any existing gate script.
 *
 * FAIL-CLOSED (T-06-03-01): the migration-runner CLI's `release-evidence`
 * action does not translate an internal `ok:false` report result into a
 * non-zero process exit (it only exits non-zero on a thrown exception), so
 * this orchestrator does NOT trust the child exit code alone to determine
 * the `migration.verification`/`tenant.drift` gates — it reads the written
 * report JSON and derives `ok` from `summary.ok`. A launch failure, a
 * missing report, or a non-zero exit is always treated as `ok:false`
 * (never assumed pass, per Pitfall 3/5).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const npmCmd = 'npm';
const nodeCmd = 'node';

/**
 * "Changed backend or API boundary" (SC1 / Pitfall 6, ADR 0032): any diff
 * touching the standalone API app, the migration runner, or the legacy
 * backend's Clean Architecture modules directory.
 */
const BOUNDARY_PREFIXES = ['apps/dgfy-api/', 'apps/dgfy-migration-runner/'];

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) {
    console.error(`[gate:release:dgfy-evidence] command failed to launch: ${command} ${args.join(' ')}`);
    console.error(result.error.message);
    return false;
  }
  return result.status === 0;
}

function captureStdout(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) return '';
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function addGate(gates, name, ok, detail) {
  gates.push({ name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name} :: ${detail}`);
}

/**
 * CR-02: evidenceDir is reused across reruns of the gate against the same
 * SHA (a normal local-iteration workflow). Report files are timestamped
 * (never overwritten) and seam_smoke.json is a fixed filename only
 * rewritten on a clean completion — so without clearing first, a prior
 * run's leftovers can be read as current and silently mask real failures
 * as passes (fail-open). Recreate the directory from scratch before any
 * evidence-generating command executes.
 */
function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

/**
 * The migration-runner's report writer names files `{timestamp}-{command}.json`
 * (D-16), not a fixed filename — glob the evidence dir for the newest file
 * whose command suffix matches and parse it. Returns null when none exist
 * (fail-closed callers must never assume a pass on a missing report).
 */
function readLatestReport(evidenceDir, commandSuffix) {
  if (!fs.existsSync(evidenceDir)) return null;
  const matches = fs
    .readdirSync(evidenceDir)
    .filter((file) => file.endsWith(`-${commandSuffix}.json`))
    .sort();
  if (matches.length === 0) return null;
  return readJsonIfExists(path.join(evidenceDir, matches[matches.length - 1]));
}

/**
 * SC1/Pitfall 6: pure boundary-change classifier — true when any changed
 * file path starts with one of the DGFY backend/API boundary prefixes.
 */
function isBoundaryChanged(changedFiles) {
  return (changedFiles || []).some((file) => BOUNDARY_PREFIXES.some((prefix) => file.startsWith(prefix)));
}

function resolveDiffBase(targetSha) {
  if (process.env.RELEASE_DIFF_BASE) return process.env.RELEASE_DIFF_BASE;
  const mergeBase = captureStdout('git', ['merge-base', 'origin/main', targetSha]);
  if (mergeBase) return mergeBase;
  return `${targetSha}~1`;
}

function getChangedFiles(base, targetSha) {
  const diffOutput = captureStdout('git', ['diff', '--name-only', `${base}..${targetSha}`]);
  return diffOutput ? diffOutput.split('\n').filter(Boolean) : [];
}

/**
 * Pure verdict-payload builder — the exact `verify-release-verdict.js`
 * contract shape (generated_at, target_sha, verdict, gate_count,
 * failed_gate_count, gates, artifact_paths). Exported for unit testing.
 */
function buildVerdictPayload({ targetSha, gates, artifactPaths }) {
  const failed = (gates || []).filter((gate) => !gate.ok);
  return {
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    verdict: failed.length === 0 ? 'pass' : 'fail',
    gate_count: (gates || []).length,
    failed_gate_count: failed.length,
    gates: gates || [],
    artifact_paths: artifactPaths || {},
  };
}

function main() {
  const targetSha = (process.env.RELEASE_TARGET_SHA || captureStdout('git', ['rev-parse', 'HEAD'])).toLowerCase();
  const evidenceDir = path.join('.tmp', 'release-gates', targetSha);
  // CR-02: recreate (never reuse) the evidence dir at the start of each run
  // so a prior run's stale reports/seam_smoke.json can never be read as
  // current evidence.
  resetDir(evidenceDir);
  const outputFile = path.join(evidenceDir, 'dgfy_release_evidence.json');
  const gates = [];

  // GATE 0 (Pitfall 5): always record at least this gate so gates[] can
  // never be empty, whatever happens downstream.
  addGate(gates, 'release.target_sha', Boolean(targetSha), `target_sha=${targetSha || '<missing>'}`);

  // GATE 1 (SC1/Pitfall 6): architecture guardrails, conditional on a
  // changed backend/API boundary.
  const diffBase = resolveDiffBase(targetSha);
  const changedFiles = getChangedFiles(diffBase, targetSha);
  const boundaryChanged = isBoundaryChanged(changedFiles);
  if (boundaryChanged) {
    addGate(
      gates,
      'architecture.dgfy',
      runCommand(npmCmd, ['run', 'check:architecture']),
      `npm run check:architecture (boundary changed since ${diffBase})`
    );
  } else {
    addGate(gates, 'architecture.dgfy', true, `not applicable — no backend/API boundary change since ${diffBase}`);
  }

  // GATE 2 (SC2): migration-verification + tenant-drift, shelled out to the
  // 06-01 runner subcommand. Fail-closed (T-06-03-01): the CLI action does
  // not exit non-zero on an internal ok:false, so we derive ok from the
  // written report content, not the child exit code alone.
  const migrationCommandOk = runCommand(nodeCmd, [
    'apps/dgfy-migration-runner/src/cli.js',
    'release-evidence',
    '--evidence-dir',
    evidenceDir,
  ]);
  const migrationCommandDetail = `node apps/dgfy-migration-runner/src/cli.js release-evidence --evidence-dir ${evidenceDir}`;

  const releaseEvidenceReport = readLatestReport(evidenceDir, 'release-evidence');
  const noTargets = Boolean(releaseEvidenceReport && releaseEvidenceReport.no_targets);
  const migrationVerificationReport = readLatestReport(evidenceDir, 'migration-verification');
  const tenantDriftReport = readLatestReport(evidenceDir, 'tenant-drift');

  function addEvidenceGate(name, report) {
    if (!migrationCommandOk) {
      addGate(gates, name, false, `${migrationCommandDetail} — command failed (fail-closed, Pitfall 3)`);
      return;
    }
    if (noTargets) {
      addGate(gates, name, true, 'not applicable — no active, verified tenants in business_database_registry');
      return;
    }
    if (!report || !report.summary) {
      addGate(gates, name, false, `${migrationCommandDetail} — report file absent (fail-closed)`);
      return;
    }
    addGate(
      gates,
      name,
      Boolean(report.summary.ok),
      `summary.ok=${report.summary.ok} target_count=${report.summary.target_count}`
    );
  }

  addEvidenceGate('migration.verification', migrationVerificationReport);
  addEvidenceGate('tenant.drift', tenantDriftReport);

  // GATE 3 (SC3): compatibility-seam smoke, shelled out to the 06-02
  // manifest-driven runner. Read seam_smoke.json (fixed filename) and add
  // one gate per seam id; an absent file fails closed. An empty seams[]
  // (no active seams registered) is a legitimate not-applicable pass,
  // mirroring dgfy-seam-smoke.js's own `[].every()===true` semantics.
  const seamSmokeCommandOk = runCommand(nodeCmd, ['scripts/dgfy-seam-smoke.js', '--evidence-dir', evidenceDir]);
  const seamSmokeCommandDetail = `node scripts/dgfy-seam-smoke.js --evidence-dir ${evidenceDir}`;
  const seamSmokeFile = path.join(evidenceDir, 'seam_smoke.json');
  const seamSmokeReport = readJsonIfExists(seamSmokeFile);

  if (!seamSmokeCommandOk) {
    // CR-02: a non-zero exit (e.g. the runner crashed before writing
    // seam_smoke.json) must fail closed regardless of what the file
    // currently contains — never silently trust a leftover pass.
    addGate(gates, 'compat.seam.smoke', false, `${seamSmokeCommandDetail} — command failed (fail-closed)`);
  } else if (!seamSmokeReport) {
    addGate(gates, 'compat.seam.smoke', false, `${seamSmokeFile} absent (fail-closed)`);
  } else if (!Array.isArray(seamSmokeReport.seams) || seamSmokeReport.seams.length === 0) {
    addGate(
      gates,
      'compat.seam.smoke',
      Boolean(seamSmokeReport.ok),
      'not applicable — no active compatibility seams in manifest'
    );
  } else {
    seamSmokeReport.seams.forEach((seam) => {
      addGate(gates, `compat.seam.smoke.${seam.id}`, Boolean(seam.ok), seam.detail || `seam ${seam.id}`);
    });
  }

  const payload = buildVerdictPayload({ targetSha, gates });
  // artifact_paths: point at the on-disk evidence files this run produced
  // (or null when a given report was never written — e.g. no_targets/
  // absent). Resolved after buildVerdictPayload so the pure helper stays
  // free of filesystem lookups.
  payload.artifact_paths = {
    migration_verification: releaseEvidenceReport || migrationVerificationReport ? evidenceDir : null,
    tenant_drift: releaseEvidenceReport || tenantDriftReport ? evidenceDir : null,
    seam_smoke: seamSmokeReport ? seamSmokeFile : null,
  };

  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  console.log(`DGFY release-evidence artifact: ${outputFile}`);

  // Final self-validation (mirrors gate-release-local.js's contract-check
  // pattern): prove the artifact we just wrote conforms to the
  // verify-release-verdict.js contract. This validates dgfy_release_evidence.json
  // itself, so it necessarily runs after the write above, and its result
  // feeds the overall exit code alongside the aggregated gates.
  const selfValidationOk = runCommand(nodeCmd, [
    'scripts/verify-release-verdict.js',
    '--file',
    outputFile,
    '--sha',
    targetSha,
  ]);
  if (!selfValidationOk) {
    console.error('[gate:release:dgfy-evidence] self-validation FAILED — artifact does not conform to the release-verdict contract');
  }

  const failed = gates.filter((gate) => !gate.ok);
  if (failed.length > 0 || !selfValidationOk) process.exit(2);
}

if (require.main === module) main();

module.exports = {
  buildVerdictPayload,
  isBoundaryChanged,
  readLatestReport,
};
