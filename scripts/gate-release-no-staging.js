#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCmd(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  return result.status === 0;
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    return '';
  }
  return (result.stdout || '').trim();
}

function parseDeployedHead(summaryContent) {
  const match = summaryContent.match(/deployed_head=([a-f0-9]{7,40})/i);
  return match ? match[1].toLowerCase() : '';
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function addGate(gates, name, ok, detail) {
  gates.push({ name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name} :: ${detail}`);
}

function main() {
  const targetSha = (process.env.RELEASE_TARGET_SHA || runCapture('git', ['rev-parse', 'HEAD'])).toLowerCase();
  const evidenceDir = process.env.RELEASE_EVIDENCE_DIR || path.join('.tmp', 'release-gates', targetSha);
  ensureDir(evidenceDir);

  const qaSmokeResultFile = process.env.QA_SMOKE_RESULT_FILE || path.join(evidenceDir, 'smoke_result.json');
  const qaRollbackResultFile = process.env.QA_ROLLBACK_DRILL_OUTPUT || path.join(evidenceDir, 'rollback_drill_result.json');
  const qaRestoreResultFile = process.env.QA_RESTORE_DRILL_OUTPUT || path.join(evidenceDir, 'restore_drill_result.json');
  const qaDeploySummaryFile = process.env.QA_DEPLOY_SUMMARY_FILE || path.join(evidenceDir, 'qa_deploy_summary.txt');
  const batchInventoryFile = process.env.BATCH_INVENTORY_FILE || path.join(evidenceDir, 'batch_inventory.json');
  const regressionRiskNoticeFile = process.env.REGRESSION_RISK_NOTICE_FILE || path.join(evidenceDir, 'regression_risk_notice.json');
  const regressionRiskNoticeMarkdown = process.env.REGRESSION_RISK_NOTICE_MARKDOWN || path.join(evidenceDir, 'regression_risk_notice.md');
  const verdictFile = process.env.RELEASE_VERDICT_FILE || path.join(evidenceDir, 'release_verdict.json');
  const verdictMirrorFile = process.env.RELEASE_VERDICT_MIRROR_FILE || '';
  const mergeAdoptionManifest = process.env.MERGE_ADOPTION_MANIFEST || process.env.RELEASE_MERGE_ADOPTION_MANIFEST || '';
  const mergeAdoptionReportFile = process.env.MERGE_ADOPTION_REPORT_FILE || path.join(evidenceDir, 'merge_adoption_report.json');
  const mergeAdoptionBase = process.env.RELEASE_MERGE_ADOPTION_BASE || process.env.MERGE_ADOPTION_BASE || process.env.RELEASE_PREVIOUS_DEPLOYED_SHA || 'origin/master';
  const deploySourceContractReportFile = process.env.DEPLOY_SOURCE_CONTRACT_REPORT || path.join(evidenceDir, 'deploy_source_contract.json');
  const emergencyBypass = process.env.RELEASE_EMERGENCY_BYPASS === '1';
  const bypassReason = process.env.RELEASE_EMERGENCY_REASON || '';
  const bypassActor = process.env.RELEASE_EMERGENCY_ACTOR || '';

  const gates = [];

  addGate(gates, 'release.target_sha', Boolean(targetSha), `target_sha=${targetSha || '<missing>'}`);
  addGate(
    gates,
    'deploy.source_contract',
    runCmd('npm', ['run', 'check:deploy-source-contract', '--', '--target-sha', targetSha, '--skip-remote-match', '--report', deploySourceContractReportFile]),
    `npm run check:deploy-source-contract -- --target-sha ${targetSha}`
  );
  addGate(gates, 'docs.lint', runCmd('npm', ['run', 'lint:docs']), 'npm run lint:docs');
  addGate(gates, 'architecture.guardrails', runCmd('npm', ['run', 'check:architecture']), 'npm run check:architecture');
  addGate(
    gates,
    'regression.risk.notice',
    runCmd('npm', [
      'run',
      'check:regression-risk',
      '--',
      '--inventory',
      batchInventoryFile,
      '--output',
      regressionRiskNoticeFile,
      '--markdown',
      regressionRiskNoticeMarkdown,
      '--target-sha',
      targetSha,
    ]),
    'npm run check:regression-risk -- --inventory <batch-inventory>'
  );
  const mergeAdoptionRequiredArgs = ['run', 'check:merge-adoption-required', '--', '--base', mergeAdoptionBase, '--head', targetSha];
  if (mergeAdoptionManifest) {
    mergeAdoptionRequiredArgs.push('--manifest', mergeAdoptionManifest);
  }
  addGate(
    gates,
    'merge.adoption.required',
    runCmd('npm', mergeAdoptionRequiredArgs),
    `npm run check:merge-adoption-required -- --base ${mergeAdoptionBase} --head ${targetSha}`
  );
  if (mergeAdoptionManifest) {
    addGate(
      gates,
      'merge.adoption',
      runCmd('npm', ['run', 'check:merge-adoption', '--', '--manifest', mergeAdoptionManifest, '--report', mergeAdoptionReportFile]),
      `npm run check:merge-adoption -- --manifest ${mergeAdoptionManifest}`
    );
  } else {
    addGate(
      gates,
      'merge.adoption.not_required',
      true,
      `No MERGE_ADOPTION_MANIFEST provided; required-proof gate used base=${mergeAdoptionBase} head=${targetSha}.`
    );
  }

  const qaSmokeOk = runCmd('npm', ['run', 'gate:release:qa-contracts'], {
    RELEASE_TARGET_SHA: targetSha,
    QA_VERIFY_OUTPUT: qaSmokeResultFile,
  });
  addGate(gates, 'qa.smoke.command', qaSmokeOk, 'npm run gate:release:qa-contracts');

  const rollbackOk = runCmd('npm', ['run', 'drill:qa:rollback'], {
    RELEASE_TARGET_SHA: targetSha,
    QA_ROLLBACK_DRILL_OUTPUT: qaRollbackResultFile,
  });
  addGate(gates, 'qa.rollback.command', rollbackOk, 'npm run drill:qa:rollback');

  const restoreOk = runCmd('npm', ['run', 'drill:qa:restore'], {
    RELEASE_TARGET_SHA: targetSha,
    QA_RESTORE_DRILL_OUTPUT: qaRestoreResultFile,
  });
  addGate(gates, 'qa.restore.command', restoreOk, 'npm run drill:qa:restore');

  let summaryHead = '';
  if (fs.existsSync(qaDeploySummaryFile)) {
    const summaryContent = fs.readFileSync(qaDeploySummaryFile, 'utf8');
    summaryHead = parseDeployedHead(summaryContent);
    addGate(
      gates,
      'qa.deploy.summary.sha_match',
      summaryHead === targetSha,
      `deployed_head=${summaryHead || '<missing>'}; target_sha=${targetSha}`
    );
  } else {
    addGate(gates, 'qa.deploy.summary.exists', false, `Missing ${qaDeploySummaryFile}`);
  }

  const smokeArtifactOk = fs.existsSync(qaSmokeResultFile);
  addGate(gates, 'qa.smoke.artifact.exists', smokeArtifactOk, qaSmokeResultFile);
  if (smokeArtifactOk) {
    try {
      const smokeJson = readJsonFile(qaSmokeResultFile);
      addGate(gates, 'qa.smoke.artifact.ok', smokeJson.ok === true, `checks_failed=${smokeJson.checks_failed ?? 'unknown'}`);
    } catch (error) {
      addGate(gates, 'qa.smoke.artifact.parse', false, error.message);
    }
  }

  const rollbackArtifactOk = fs.existsSync(qaRollbackResultFile);
  addGate(gates, 'qa.rollback.artifact.exists', rollbackArtifactOk, qaRollbackResultFile);
  if (rollbackArtifactOk) {
    try {
      const rollbackJson = readJsonFile(qaRollbackResultFile);
      addGate(gates, 'qa.rollback.artifact.ok', rollbackJson.ok === true, `checks_failed=${rollbackJson.checks_failed ?? 'unknown'}`);
    } catch (error) {
      addGate(gates, 'qa.rollback.artifact.parse', false, error.message);
    }
  }

  const restoreArtifactOk = fs.existsSync(qaRestoreResultFile);
  addGate(gates, 'qa.restore.artifact.exists', restoreArtifactOk, qaRestoreResultFile);
  if (restoreArtifactOk) {
    try {
      const restoreJson = readJsonFile(qaRestoreResultFile);
      addGate(gates, 'qa.restore.artifact.ok', restoreJson.ok === true, `checks_failed=${restoreJson.checks_failed ?? 'unknown'}`);
    } catch (error) {
      addGate(gates, 'qa.restore.artifact.parse', false, error.message);
    }
  }

  const observabilityOk = runCmd('npm', ['run', 'gate:release:observability', '--', '--evidence-dir', evidenceDir], {
    RELEASE_TARGET_SHA: targetSha,
    RELEASE_EVIDENCE_DIR: evidenceDir
  });
  addGate(gates, 'observability.evidence.report', observabilityOk, 'npm run gate:release:observability -- --evidence-dir <release-evidence-dir>');

  let failed = gates.filter((gate) => !gate.ok);
  let verdict = failed.length === 0 ? 'pass' : 'fail';
  let bypass = null;

  if (verdict === 'fail' && emergencyBypass) {
    const nonBypassableGateNames = new Set([
      'deploy.source_contract',
      'merge.adoption.required',
      'merge.adoption',
      'regression.risk.notice',
    ]);
    const nonBypassableFailures = failed.filter((gate) => nonBypassableGateNames.has(gate.name));
    const hasReason = bypassReason.trim().length > 0;
    const hasActor = bypassActor.trim().length > 0;
    addGate(gates, 'emergency_bypass.reason_present', hasReason, 'RELEASE_EMERGENCY_REASON');
    addGate(gates, 'emergency_bypass.actor_present', hasActor, 'RELEASE_EMERGENCY_ACTOR');
    if (nonBypassableFailures.length > 0) {
      addGate(
        gates,
        'emergency_bypass.non_bypassable_clear',
        false,
        `Non-bypassable failures: ${nonBypassableFailures.map((gate) => gate.name).join(', ')}`
      );
    }
    failed = gates.filter((gate) => !gate.ok);
    if (hasReason && hasActor && nonBypassableFailures.length === 0) {
      verdict = 'bypassed';
      bypass = {
        enabled: true,
        reason: bypassReason,
        actor: bypassActor,
      };
    }
  }

  const verdictPayload = {
    generated_at: new Date().toISOString(),
    target_sha: targetSha,
    verdict,
    gate_count: gates.length,
    failed_gate_count: gates.filter((gate) => !gate.ok).length,
    gates,
    artifact_paths: {
      qa_deploy_summary_file: qaDeploySummaryFile,
      qa_smoke_result_file: qaSmokeResultFile,
      qa_rollback_drill_file: qaRollbackResultFile,
      qa_restore_drill_file: qaRestoreResultFile,
      batch_inventory_file: batchInventoryFile,
      regression_risk_notice_file: regressionRiskNoticeFile,
      regression_risk_notice_markdown: regressionRiskNoticeMarkdown,
      merge_adoption_report_file: mergeAdoptionManifest ? mergeAdoptionReportFile : null,
      deploy_source_contract_report_file: deploySourceContractReportFile,
      release_verdict_file: verdictFile,
      observability_evidence_file: path.join(evidenceDir, 'observability_evidence.json'),
    },
    emergency_bypass: bypass,
  };

  fs.writeFileSync(verdictFile, JSON.stringify(verdictPayload, null, 2));
  if (verdictMirrorFile) {
    ensureDir(path.dirname(verdictMirrorFile));
    fs.writeFileSync(verdictMirrorFile, JSON.stringify(verdictPayload, null, 2));
  }

  console.log(`Release verdict artifact: ${verdictFile}`);
  if (verdictMirrorFile) {
    console.log(`Release verdict mirror: ${verdictMirrorFile}`);
  }

  if (verdict === 'fail') {
    process.exit(2);
  }
}

main();
