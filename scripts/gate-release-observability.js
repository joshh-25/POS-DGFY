#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    ...options
  });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio || 'ignore',
    shell: false,
    env: { ...process.env, ...(options.env || {}) },
    ...options
  });
  return result.status === 0;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function addCheck(checks, name, status, detail) {
  checks.push({ name, status, ok: status === 'pass', detail });
  const label = status.toUpperCase();
  console.log(`[observability:${label}] ${name} :: ${detail}`);
}

function parseDeployedHead(summaryContent) {
  const match = String(summaryContent || '').match(/deployed_head=([a-f0-9]{7,40})/i);
  return match ? match[1].toLowerCase() : '';
}

function normalizeSha(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-f0-9]{7,40}$/.test(normalized) ? normalized : '';
}

function parseHealthRuntimeSha(healthText) {
  try {
    const payload = JSON.parse(String(healthText || '{}'));
    const observability = payload?.services?.observability || {};
    return {
      runtimeSha: normalizeSha(observability.runtime_sha),
      source: observability.runtime_sha_source || null,
      present: Boolean(observability.runtime_sha_present || normalizeSha(observability.runtime_sha))
    };
  } catch (_error) {
    return {
      runtimeSha: '',
      source: null,
      present: false
    };
  }
}

async function fetchText(url, requestId) {
  if (typeof fetch !== 'function') {
    return { ok: false, status: 0, text: '', headers: {}, error: 'fetch unavailable' };
  }
  try {
    const response = await fetch(url, { headers: { 'x-request-id': requestId } });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      headers: {
        request_id: response.headers.get('x-request-id'),
        trace_id: response.headers.get('x-trace-id')
      }
    };
  } catch (error) {
    return { ok: false, status: 0, text: '', headers: {}, error: error.message };
  }
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function evaluateReleaseVerdict({ checks, verdictFile, evidenceDir, targetSha, env = process.env }) {
  const verdict = readJsonIfExists(verdictFile);
  if (!verdict) {
    const qaDeploySummaryFile = path.join(evidenceDir, 'qa_deploy_summary.txt');
    if (!fs.existsSync(qaDeploySummaryFile)) {
      addCheck(checks, 'release.verdict.present_for_stale_qa_review', 'warn', `Missing ${verdictFile}; stale QA review skipped in report mode.`);
      return;
    }
    const deployedHead = parseDeployedHead(fs.readFileSync(qaDeploySummaryFile, 'utf8'));
    if (deployedHead && deployedHead === targetSha) {
      addCheck(checks, 'qa.deploy.summary.sha_match.reviewed', 'pass', `deployed_head=${deployedHead}; target_sha=${targetSha}`);
      return;
    }
    const emergencyBypass = env.RELEASE_EMERGENCY_BYPASS === '1'
      && String(env.RELEASE_EMERGENCY_REASON || '').trim()
      && String(env.RELEASE_EMERGENCY_ACTOR || '').trim();
    addCheck(
      checks,
      'qa.deploy.summary.sha_match.reviewed',
      emergencyBypass ? 'pass' : 'fail',
      `deployed_head=${deployedHead || '<missing>'}; target_sha=${targetSha}; verdict_file_pending=true`
    );
    return;
  }

  const shaGate = Array.isArray(verdict.gates)
    ? verdict.gates.find((gate) => gate.name === 'qa.deploy.summary.sha_match')
    : null;
  if (!shaGate) {
    addCheck(checks, 'qa.deploy.summary.sha_match.reviewed', 'warn', 'No qa.deploy.summary.sha_match gate found in release verdict.');
    return;
  }

  if (shaGate.ok === true) {
    addCheck(checks, 'qa.deploy.summary.sha_match.reviewed', 'pass', shaGate.detail || 'SHA parity passed.');
    return;
  }

  if (verdict.verdict === 'bypassed' && verdict.emergency_bypass?.reason && verdict.emergency_bypass?.actor) {
    addCheck(checks, 'qa.deploy.summary.sha_match.reviewed', 'pass', 'Mismatch is recorded with explicit emergency bypass metadata.');
    return;
  }

  addCheck(checks, 'qa.deploy.summary.sha_match.reviewed', 'fail', 'QA deployed-head mismatch exists without explicit emergency bypass metadata.');
}

async function buildObservabilityEvidence(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const targetSha = String(
    options.targetSha
    || process.env.RELEASE_TARGET_SHA
    || runCapture('git', ['rev-parse', 'HEAD'], { cwd: rootDir })
    || ''
  ).toLowerCase();
  const evidenceDir = path.resolve(rootDir, options.evidenceDir || process.env.RELEASE_EVIDENCE_DIR || path.join('.tmp', 'release-gates', targetSha || 'unknown'));
  ensureDir(evidenceDir);

  const baseUrl = options.baseUrl || process.env.OBSERVABILITY_BASE_URL || process.env.PROD_BASE_URL || process.env.QA_BASE_URL || '';
  const enforce = Boolean(options.enforce);
  const checks = [];
  const probeRequestId = `obs-${(targetSha || 'unknown').slice(0, 24)}`;

  if (baseUrl) {
    const health = await fetchText(new URL('/health', baseUrl).toString(), probeRequestId);
    addCheck(checks, 'health.reachable', health.ok ? 'pass' : 'fail', health.ok ? `status=${health.status}` : (health.error || `status=${health.status}`));
    addCheck(
      checks,
      'trace_context.round_trip',
      health.headers.request_id === probeRequestId && Boolean(health.headers.trace_id) ? 'pass' : 'fail',
      `x-request-id=${health.headers.request_id || '<missing>'}; x-trace-id=${health.headers.trace_id || '<missing>'}`
    );

    const runtimeSha = health.ok ? parseHealthRuntimeSha(health.text) : { runtimeSha: '', source: null, present: false };
    addCheck(
      checks,
      'health.runtime_sha.present',
      runtimeSha.present && runtimeSha.runtimeSha ? 'pass' : 'fail',
      `runtime_sha=${runtimeSha.runtimeSha || '<missing>'}; source=${runtimeSha.source || '<missing>'}`
    );
    if (targetSha && runtimeSha.runtimeSha) {
      const matchesTarget = runtimeSha.runtimeSha === targetSha
        || runtimeSha.runtimeSha.startsWith(targetSha)
        || targetSha.startsWith(runtimeSha.runtimeSha);
      addCheck(
        checks,
        'health.runtime_sha.matches_target',
        matchesTarget ? 'pass' : 'fail',
        `runtime_sha=${runtimeSha.runtimeSha}; target_sha=${targetSha}`
      );
    } else {
      addCheck(
        checks,
        'health.runtime_sha.matches_target',
        'warn',
        `runtime_sha=${runtimeSha.runtimeSha || '<missing>'}; target_sha=${targetSha || '<missing>'}`
      );
    }

    if (String(process.env.METRICS_ENABLED || '').toLowerCase() === 'true') {
      const metrics = await fetchText(new URL('/metrics', baseUrl).toString(), probeRequestId);
      addCheck(checks, 'metrics.reachable', metrics.ok && metrics.text.includes('sku_http_requests_total') ? 'pass' : 'fail', metrics.error || `status=${metrics.status}`);
    } else {
      addCheck(checks, 'metrics.reachable_when_enabled', 'warn', 'METRICS_ENABLED is not true for this gate run.');
    }
  } else {
    addCheck(checks, 'health.reachable', 'warn', 'OBSERVABILITY_BASE_URL/PROD_BASE_URL/QA_BASE_URL not set.');
    addCheck(checks, 'trace_context.round_trip', 'warn', 'Skipped because no observability base URL is configured.');
    addCheck(checks, 'metrics.reachable_when_enabled', 'warn', 'Skipped because no observability base URL is configured.');
  }

  addCheck(
    checks,
    'structured_request_logging.configured',
    fs.existsSync(path.join(rootDir, 'backend', 'src', 'middleware', 'requestOutcomeLogger.js')) ? 'pass' : 'fail',
    'backend/src/middleware/requestOutcomeLogger.js'
  );

  const incidentOutputDir = path.join(evidenceDir, 'incident-bundle-probe');
  const incidentOk = runCommand('node', [
    'scripts/create-incident-bundle.js',
    '--dry-run',
    '--request-id',
    probeRequestId,
    '--output-dir',
    incidentOutputDir
  ], { cwd: rootDir });
  addCheck(checks, 'incident_bundle.dry_run', incidentOk ? 'pass' : 'fail', incidentOutputDir);

  const deployedCommitFile = path.join(rootDir, '.deploy-state', 'last_deployed_commit');
  if (fs.existsSync(deployedCommitFile)) {
    const deployedCommit = fs.readFileSync(deployedCommitFile, 'utf8').trim().toLowerCase();
    addCheck(
      checks,
      'deploy_state.sha_present',
      deployedCommit ? 'pass' : 'fail',
      `.deploy-state/last_deployed_commit=${deployedCommit || '<empty>'}`
    );
  } else {
    addCheck(checks, 'deploy_state.sha_present', 'warn', '.deploy-state/last_deployed_commit not present in this checkout.');
  }

  const verdictFile = path.join(evidenceDir, 'release_verdict.json');
  evaluateReleaseVerdict({ checks, verdictFile, evidenceDir, targetSha });

  const failed = checks.filter((check) => check.status === 'fail');
  const payload = {
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    mode: enforce ? 'enforce' : 'report',
    verdict: failed.length === 0 ? 'pass' : (enforce ? 'fail' : 'report'),
    failed_check_count: failed.length,
    checks,
    artifact_paths: {
      observability_evidence_file: path.join(evidenceDir, 'observability_evidence.json'),
      incident_bundle_probe_dir: incidentOutputDir
    }
  };

  fs.writeFileSync(payload.artifact_paths.observability_evidence_file, JSON.stringify(payload, null, 2));
  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const enforce = args.enforce === true || args.mode === 'enforce' || process.env.OBSERVABILITY_GATE_MODE === 'enforce';
  const payload = await buildObservabilityEvidence({
    enforce,
    baseUrl: args['base-url'],
    evidenceDir: args['evidence-dir'],
    targetSha: args.sha
  });
  console.log(`Observability evidence artifact: ${payload.artifact_paths.observability_evidence_file}`);
  if (payload.verdict === 'fail') process.exit(2);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[observability-gate] ${error.message}`);
    process.exit(2);
  });
}

module.exports = {
  buildObservabilityEvidence,
  parseDeployedHead,
  parseHealthRuntimeSha,
  evaluateReleaseVerdict,
  parseArgs
};
