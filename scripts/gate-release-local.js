#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const npmCmd = 'npm';
const nodeCmd = 'node';

function runCommand(command, args) {
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const targetSha = (process.env.RELEASE_TARGET_SHA || captureStdout('git', ['rev-parse', 'HEAD'])).toLowerCase();
  const evidenceDir = path.join('.tmp', 'release-gates', targetSha);
  ensureDir(evidenceDir);
  const outputFile = path.join(evidenceDir, 'local_readiness.json');
  const gates = [];

  addGate(gates, 'release.target_sha', Boolean(targetSha), `target_sha=${targetSha || '<missing>'}`);
  addGate(gates, 'dependencies.audit.prod', runCommand(npmCmd, ['run', 'audit:dependencies:prod']), 'npm run audit:dependencies:prod');
  addGate(gates, 'dependencies.audit.full', runCommand(npmCmd, ['run', 'audit:dependencies']), 'npm run audit:dependencies');
  addGate(gates, 'docs.lint', runCommand(npmCmd, ['run', 'lint:docs']), 'npm run lint:docs');
  addGate(gates, 'architecture.guardrails', runCommand(npmCmd, ['run', 'check:architecture']), 'npm run check:architecture');
  addGate(gates, 'compliance.contracts', runCommand(npmCmd, ['run', 'check:compliance']), 'npm run check:compliance');
  addGate(gates, 'production.env.fixtures', runCommand(npmCmd, ['run', 'check:production-env']), 'npm run check:production-env');
  addGate(gates, 'runtime.doctor', runCommand(npmCmd, ['run', 'doctor:runtime']), 'npm run doctor:runtime');
  addGate(gates, 'backend.lint', runCommand(npmCmd, ['--prefix', 'backend', 'run', 'lint']), 'npm --prefix backend run lint');
  addGate(gates, 'backend.test_matrix', runCommand(npmCmd, ['run', 'test:backend:matrix']), 'npm run test:backend:matrix');
  addGate(gates, 'frontend.lint', runCommand(npmCmd, ['--prefix', 'frontend', 'run', 'lint']), 'npm --prefix frontend run lint');
  addGate(gates, 'frontend.contracts', runCommand(npmCmd, ['run', 'test:frontend:contracts']), 'npm run test:frontend:contracts');
  const frontendBudgetReportFile = path.join(evidenceDir, 'frontend-budgets', 'frontend_budget_report.json');
  addGate(
    gates,
    'frontend.budgets',
    runCommand(npmCmd, ['run', 'check:frontend-budgets', '--', '--report', frontendBudgetReportFile]),
    `npm run check:frontend-budgets -- --report ${frontendBudgetReportFile}`
  );
  addGate(
    gates,
    'scroll.contracts',
    runCommand(npmCmd, [
      '--prefix',
      'frontend',
      'test',
      '--',
      '--run',
      'src/features/pos/__tests__/terminalResponsiveScroll.contract.test.js',
      'src/features/pos/utils/__tests__/scrollKeyControls.behavior.test.js',
    ]),
    'npm --prefix frontend test -- --run <scroll-contract-suite>'
  );
  addGate(
    gates,
    'observability.evidence.report',
    runCommand(npmCmd, ['run', 'gate:release:observability', '--', '--evidence-dir', evidenceDir]),
    'npm run gate:release:observability -- --evidence-dir <release-evidence-dir>'
  );

  const verdictFile = path.join('.tmp', 'release-gates', targetSha, 'release_verdict.json');
  const observabilityEvidenceFile = path.join(evidenceDir, 'observability_evidence.json');
  if (fs.existsSync(verdictFile)) {
    addGate(
      gates,
      'release.verdict.contract',
      runCommand(nodeCmd, ['scripts/verify-release-verdict.js', '--file', verdictFile, '--sha', targetSha]),
      `node scripts/verify-release-verdict.js --file ${verdictFile} --sha ${targetSha}`
    );
  } else {
    addGate(gates, 'release.verdict.contract', true, `Skipped: verdict file not present (${verdictFile})`);
  }

  const failed = gates.filter((gate) => !gate.ok);
  const payload = {
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    verdict: failed.length === 0 ? 'pass' : 'fail',
    gate_count: gates.length,
    failed_gate_count: failed.length,
    gates,
    artifact_paths: {
      local_readiness_file: outputFile,
      release_verdict_file: verdictFile,
      frontend_budget_report_file: frontendBudgetReportFile,
      observability_evidence_file: observabilityEvidenceFile,
    },
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));
  console.log(`Local readiness artifact: ${outputFile}`);

  if (failed.length > 0) process.exit(2);
}

main();
