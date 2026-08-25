#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const npmCmd = 'npm';
const nodeCmd = 'node';

function runCommand(command, args) {
  return () => {
    const result = spawnSync(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    });
    if (result.error) {
      console.error(`[gate:release:local] command failed to launch: ${command} ${args.join(' ')}`);
      console.error(result.error.message);
      return false;
    }
    return result.status === 0;
  };
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

function parseCsvArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return [];
  const value = process.argv[index + 1] || '';
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

// --only takes precedence over --skip if both are somehow passed; --skip alone excludes.
const onlyGates = parseCsvArg('--only');
const skipGates = parseCsvArg('--skip');

function isSelected(name) {
  if (onlyGates.length > 0) return onlyGates.includes(name);
  if (skipGates.length > 0) return !skipGates.includes(name);
  return true;
}

// Gates that are structurally incapable of failing on a clean promotion checkout -- flagged so a
// green result here is never cited as evidence of anything (#1016).
const STRUCTURALLY_CANNOT_FAIL = new Set([
  'compliance.contracts', // no compliance-relevant diff on a clean checkout -> nothing to flag
  'observability.evidence.report', // warns, never fails, unless run with --enforce (not passed here)
  'release.verdict.contract', // auto-skips unless a prior run already produced release_verdict.json
]);

// commandFn is a zero-arg thunk so a skipped gate never launches its command (#1016) -- previously
// every gate's command ran eagerly as an addGate() argument regardless of any filter.
function runGate(gates, name, commandFn, detail) {
  const structurallyCannotFail = STRUCTURALLY_CANNOT_FAIL.has(name);
  if (!isSelected(name)) {
    gates.push({ name, ok: true, status: 'skipped', detail, duration_ms: 0, structurally_cannot_fail: structurallyCannotFail });
    console.log(`[SKIP] ${name} :: ${detail}`);
    return true;
  }
  const startedAt = Date.now();
  const ok = commandFn();
  const durationMs = Date.now() - startedAt;
  const status = ok ? 'pass' : 'fail';
  gates.push({ name, ok, status, detail, duration_ms: durationMs, structurally_cannot_fail: structurallyCannotFail });
  console.log(`[${status.toUpperCase()}] ${name} :: ${detail} (duration_ms=${durationMs})`);
  return ok;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const targetSha = (process.env.RELEASE_TARGET_SHA || captureStdout('git', ['rev-parse', 'HEAD'])).toLowerCase();
  const evidenceDir = path.join('.tmp', 'release-gates', targetSha);
  ensureDir(evidenceDir);
  const outputFile = path.join(evidenceDir, 'local_readiness.json');
  const gates = [];

  if (onlyGates.length > 0) {
    console.log(`[gate:release:local] --only=${onlyGates.join(',')} -- every other gate will be recorded as skipped`);
  } else if (skipGates.length > 0) {
    console.log(`[gate:release:local] --skip=${skipGates.join(',')}`);
  }

  runGate(gates, 'release.target_sha', () => Boolean(targetSha), `target_sha=${targetSha || '<missing>'}`);
  runGate(gates, 'dependencies.audit.prod', runCommand(npmCmd, ['run', 'audit:dependencies:prod']), 'npm run audit:dependencies:prod');
  runGate(gates, 'dependencies.audit.full', runCommand(npmCmd, ['run', 'audit:dependencies']), 'npm run audit:dependencies');
  runGate(gates, 'docs.lint', runCommand(npmCmd, ['run', 'lint:docs']), 'npm run lint:docs');
  runGate(gates, 'architecture.guardrails', runCommand(npmCmd, ['run', 'check:architecture']), 'npm run check:architecture');
  runGate(gates, 'compliance.contracts', runCommand(npmCmd, ['run', 'check:compliance']), 'npm run check:compliance');
  runGate(gates, 'production.env.fixtures', runCommand(npmCmd, ['run', 'check:production-env']), 'npm run check:production-env');
  runGate(gates, 'runtime.doctor', runCommand(npmCmd, ['run', 'doctor:runtime']), 'npm run doctor:runtime');
  runGate(gates, 'backend.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-api', 'run', 'lint']), 'npm --prefix apps/dgfy-api run lint');
  runGate(gates, 'backend.test_matrix', runCommand(npmCmd, ['run', 'test:backend:matrix']), 'npm run test:backend:matrix');
  runGate(gates, 'frontend.ims.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-ims', 'run', 'lint']), 'npm --prefix apps/dgfy-ims run lint');
  runGate(gates, 'frontend.pos.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-pos', 'run', 'lint']), 'npm --prefix apps/dgfy-pos run lint');
  runGate(gates, 'frontend.storefront.lint', runCommand(npmCmd, ['--prefix', 'apps/dgfy-storefront', 'run', 'lint']), 'npm --prefix apps/dgfy-storefront run lint');
  runGate(gates, 'frontend.contracts', runCommand(npmCmd, ['run', 'test:frontend:contracts']), 'npm run test:frontend:contracts');
  // frontend.lint fanned out to three gates (ims/pos/storefront) when the split landed (#322);
  // this gate wasn't -- it stayed pointed at ims only, so apps/dgfy-storefront's own
  // contract/integration tests silently dropped out of the pre-main release gate (RF-3, PR #513).
  // POS has no gate of its own here: apps/dgfy-pos has zero tests today (every POS test lives in
  // packages/web-core, exercised via dgfy-ims's own contracts gate above) -- add one alongside
  // this if that ever changes.
  runGate(gates, 'frontend.storefront.contracts', runCommand(npmCmd, ['run', 'test:frontend:contracts:storefront']), 'npm run test:frontend:contracts:storefront');
  const frontendBudgetReportFile = path.join(evidenceDir, 'frontend-budgets', 'frontend_budget_report.json');
  runGate(
    gates,
    'frontend.budgets',
    runCommand(npmCmd, ['run', 'check:frontend-budgets', '--', '--report', frontendBudgetReportFile]),
    `npm run check:frontend-budgets -- --report ${frontendBudgetReportFile}`
  );
  runGate(
    gates,
    'scroll.contracts',
    runCommand(npmCmd, [
      '--prefix',
      'apps/dgfy-ims',
      'test',
      '--',
      '--run',
      '../../packages/web-core/src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js',
      '../../packages/web-core/src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js',
    ]),
    'npm --prefix apps/dgfy-ims test -- --run <scroll-contract-suite>'
  );
  runGate(
    gates,
    'observability.evidence.report',
    runCommand(npmCmd, ['run', 'gate:release:observability', '--', '--evidence-dir', evidenceDir]),
    'npm run gate:release:observability -- --evidence-dir <release-evidence-dir>'
  );

  const verdictFile = path.join('.tmp', 'release-gates', targetSha, 'release_verdict.json');
  const observabilityEvidenceFile = path.join(evidenceDir, 'observability_evidence.json');
  if (fs.existsSync(verdictFile)) {
    runGate(
      gates,
      'release.verdict.contract',
      runCommand(nodeCmd, ['scripts/verify-release-verdict.js', '--file', verdictFile, '--sha', targetSha]),
      `node scripts/verify-release-verdict.js --file ${verdictFile} --sha ${targetSha}`
    );
  } else {
    runGate(gates, 'release.verdict.contract', () => true, `Skipped: verdict file not present (${verdictFile})`);
  }

  const failed = gates.filter((gate) => !gate.ok);
  const skipped = gates.filter((gate) => gate.status === 'skipped');
  const isPartialRun = onlyGates.length > 0 || skipGates.length > 0;
  const payload = {
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    // A partial run (--only/--skip) must never be citable as a full gate pass -- run_mode makes
    // that explicit in the artifact itself rather than relying on a reader noticing selection.
    run_mode: isPartialRun ? 'partial' : 'full',
    selection: { only: onlyGates, skip: skipGates },
    verdict: failed.length === 0 ? 'pass' : 'fail',
    gate_count: gates.length,
    failed_gate_count: failed.length,
    skipped_gate_count: skipped.length,
    gates,
    artifact_paths: {
      local_readiness_file: outputFile,
      release_verdict_file: verdictFile,
      frontend_budget_report_file: frontendBudgetReportFile,
      observability_evidence_file: observabilityEvidenceFile,
    },
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  console.log(`Local readiness artifact: ${outputFile} (run_mode=${payload.run_mode})`);

  if (failed.length > 0) process.exit(2);
}

main();
