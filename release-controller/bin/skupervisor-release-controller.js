#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  ReleaseControllerError,
  NonceLedger,
  sha256File,
  readJson,
  run,
  requireCommand,
  parseAuthorizationMessage,
  validateAuthorizationFields,
  verifySignedTag,
  validateTagName,
  validateInventory,
  validateInventoryDocumentation,
  validateDocumentationClosureEvidence,
  validateEvidence,
  validateLiveGithubEvidence,
  validateAccuracyProofBundle,
  validateProductionBaselineProof,
  ReleaseRecordStore,
  runQualification,
  createWorktree,
  removeWorktree,
  buildRemoteDeployArgs,
  buildRemoteProofArgs,
  parseProductionProofOutput,
} = require('../lib/release-controller');

function parseArgs(argv) {
  const options = { dryRun: true, finalize: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (['--phase', '--target-sha', '--tag', '--payment-tag', '--inventory', '--evidence', '--documentation-closure', '--regression-risk-notice', '--accuracy-proof', '--config'].includes(arg)) {
      options[arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--execute') {
      options.dryRun = false;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--finalize') {
      options.finalize = true;
    } else {
      throw new ReleaseControllerError('INVALID_ARGS', `Unknown argument: ${arg}`);
    }
  }
  for (const field of ['phase', 'targetSha', 'tag', 'inventory', 'evidence', 'documentationClosure', 'regressionRiskNotice', 'config']) {
    if (!options[field]) throw new ReleaseControllerError('INVALID_ARGS', `Missing --${field.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`);
  }
  if (!['promotion', 'production'].includes(options.phase)) throw new ReleaseControllerError('INVALID_ARGS', '--phase must be promotion or production');
  if (options.finalize && options.phase !== 'production') throw new ReleaseControllerError('INVALID_ARGS', '--finalize is valid only for production');
  if (options.finalize && !options.accuracyProof) throw new ReleaseControllerError('INVALID_ARGS', '--finalize requires --accuracy-proof');
  if (!options.finalize && options.phase === 'production' && options.accuracyProof) {
    throw new ReleaseControllerError('PREDEPLOY_ACCURACY_FORBIDDEN', 'Production accuracy proof is accepted only by the separate post-deploy --finalize operation');
  }
  return options;
}

function loadConfig(filePath) {
  const config = readJson(filePath, 'controller configuration');
  for (const field of ['repository', 'git_mirror', 'ledger_dir', 'release_records_dir']) {
    if (!config[field]) throw new ReleaseControllerError('CONFIG_INVALID', `Controller configuration is missing ${field}`);
  }
  if (!Array.isArray(config.allowed_signer_fingerprints) || config.allowed_signer_fingerprints.length === 0) {
    throw new ReleaseControllerError('CONFIG_INVALID', 'Controller configuration requires allowed_signer_fingerprints');
  }
  return config;
}

function collectProductionBaselineProof(config, targetSha) {
  const output = requireCommand(
    run(config.ssh_bin || 'ssh', buildRemoteProofArgs(config, targetSha), { timeoutMs: Number(config.proof_timeout_ms || 120_000) }),
    'PRODUCTION_PROOF_COLLECTION_FAILED',
    'Collect exact-SHA production baseline proof'
  );
  return validateProductionBaselineProof(parseProductionProofOutput(output), targetSha);
}

function buildReleaseRecord({ options, inventory, evidence, documentationClosure, regressionRiskNotice, authorization, paymentAuthorization, qualification, baselineProof, ledgerState, residualRisks = [], accuracyProof = null }) {
  return {
    schema: 'sku-external-release-record/v1',
    version: 1,
    recorded_at: new Date().toISOString(),
    target_sha: options.targetSha,
    branch: options.phase === 'production' ? 'master' : 'staging',
    inventory_sha256: sha256File(options.inventory),
    evidence_sha256: sha256File(options.evidence),
    documentation_closure: {
      status: documentationClosure.status,
      report_sha256: sha256File(options.documentationClosure),
      release_slices: documentationClosure.release_slices,
    },
    regression_risk_notice: {
      status: regressionRiskNotice.status,
      highest_regression_risk_level: regressionRiskNotice.highest_regression_risk_level,
      report_sha256: sha256File(options.regressionRiskNotice),
    },
    authorization: {
      tag: authorization.tag,
      signer_fingerprint: authorization.signerFingerprint,
      nonce: authorization.auth.nonce,
      phase: authorization.auth.phase,
      expires_at: authorization.auth.expires_at,
    },
    payment_authorization: paymentAuthorization ? {
      tag: paymentAuthorization.tag,
      signer_fingerprint: paymentAuthorization.signerFingerprint,
      nonce: paymentAuthorization.auth.nonce,
    } : null,
    ledger_state: ledgerState,
    qualification,
    deployment_proof: baselineProof,
    release_slices: (inventory.release_slices || []).map((slice) => ({
      id: slice.id,
      slice_name: slice.slice_name || slice.name,
      purpose: slice.plain_english_purpose || slice.purpose,
      documentation_closure: slice.documentation_closure,
      regression_risk_level: slice.regression_risk_level,
      accuracy_state: accuracyProof ? 'accurately_reflected' : 'deployed_pending_accuracy',
    })),
    accuracy_proof: accuracyProof ? {
      status: 'pass',
      bundle_sha256: sha256File(options.accuracyProof),
      proof_count: accuracyProof.proofs.length,
    } : null,
    residual_risks: residualRisks,
    evidence_schema: evidence.schema,
  };
}

function refreshMirror(config) {
  requireCommand(run(config.git_bin || 'git', [`--git-dir=${config.git_mirror}`, 'fetch', '--force', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*', '+refs/tags/*:refs/tags/*']), 'GIT_FETCH_FAILED', 'Refresh trusted Git mirror');
}

function remoteSha(config, branch) {
  const output = requireCommand(run(config.git_bin || 'git', ['ls-remote', '--exit-code', config.remote_url, `refs/heads/${branch}`]), 'REMOTE_REF_MISSING', `Read origin/${branch}`);
  return output.split(/\s+/)[0];
}

function liveGithubEvidence(config, prNumber, targetSha) {
  const repo = config.repository;
  const pr = JSON.parse(requireCommand(run(config.gh_bin || 'gh', ['api', `repos/${repo}/pulls/${prNumber}`]), 'GITHUB_PR_QUERY_FAILED', `Read PR #${prNumber}`));
  const checksResponse = JSON.parse(requireCommand(run(config.gh_bin || 'gh', ['api', '-H', 'Accept: application/vnd.github+json', `repos/${repo}/commits/${targetSha}/check-runs?per_page=100`]), 'GITHUB_CHECK_QUERY_FAILED', `Read checks for ${targetSha}`));
  return {
    number: pr.number,
    state: pr.merged ? 'MERGED' : String(pr.state || '').toUpperCase(),
    base: pr.base?.ref,
    head: pr.head?.ref,
    headSha: pr.head?.sha,
    mergeCommitSha: pr.merge_commit_sha,
    checks: (checksResponse.check_runs || []).map((check) => ({ name: check.name, conclusion: check.conclusion })),
  };
}

function verifyAuthorization(options, config, expected, tag) {
  const signed = verifySignedTag({
    gitBin: config.git_bin,
    gitDir: config.git_mirror,
    tag,
    allowedFingerprints: config.allowed_signer_fingerprints,
  });
  if (signed.targetSha !== expected.targetSha) throw new ReleaseControllerError('TAG_TARGET_MISMATCH', 'Signed tag target does not match the authorized SHA');
  const auth = validateAuthorizationFields(parseAuthorizationMessage(signed.message), expected);
  validateTagName(tag, auth);
  return { auth, signerFingerprint: signed.fingerprint, tag };
}

function controllerMain(options) {
  const config = loadConfig(options.config);
  if (!config.remote_url) throw new ReleaseControllerError('CONFIG_INVALID', 'Controller configuration is missing remote_url');
  refreshMirror(config);

  const inventoryHash = sha256File(options.inventory);
  const evidenceHash = sha256File(options.evidence);
  const documentationClosureHash = sha256File(options.documentationClosure);
  const regressionRiskNoticeHash = sha256File(options.regressionRiskNotice);
  const inventory = validateInventory(readJson(options.inventory, 'reviewed inventory'), options.targetSha);
  const evidence = readJson(options.evidence, 'candidate evidence');
  const documentationClosure = validateDocumentationClosureEvidence(
    readJson(options.documentationClosure, 'documentation closure'),
    { targetSha: options.targetSha, inventoryHash }
  );
  const regressionRiskNotice = readJson(options.regressionRiskNotice, 'Regression Risk Notice');
  if (regressionRiskNotice.status !== 'pass' || regressionRiskNotice.target_sha !== options.targetSha) {
    throw new ReleaseControllerError('REGRESSION_RISK_NOTICE_INVALID', 'Regression Risk Notice is missing, failed, or stale');
  }
  const expected = {
    repository: config.repository,
    phase: options.phase,
    targetSha: options.targetSha,
    inventoryHash,
    evidenceHash,
    documentationClosureHash,
    regressionRiskNoticeHash,
    paymentSensitive: Boolean(inventory.payment_sensitive),
    prNumber: evidence.pr?.number,
  };

  // Signature and replay checks intentionally occur before any candidate worktree exists.
  const authorization = verifyAuthorization(options, config, expected, options.tag);
  const ledger = new NonceLedger(config.ledger_dir);
  if (!options.finalize) ledger.assertUnused(authorization.auth);
  validateEvidence(evidence, expected, config.required_checks?.[options.phase] || []);

  let paymentAuthorization = null;
  if (inventory.payment_sensitive) {
    if (!options.paymentTag) throw new ReleaseControllerError('PAYMENT_AUTH_REQUIRED', 'Payment-sensitive release requires --payment-tag');
    paymentAuthorization = verifyAuthorization(options, config, { ...expected, phase: 'payment' }, options.paymentTag);
    if (!options.finalize) ledger.assertUnused(paymentAuthorization.auth);
  }

  const branch = options.phase === 'promotion' ? 'staging' : 'master';
  const currentRemoteSha = remoteSha(config, branch);
  if (currentRemoteSha !== options.targetSha) throw new ReleaseControllerError('REMOTE_MOVED', `origin/${branch} moved: expected=${options.targetSha} actual=${currentRemoteSha}`);
  const live = liveGithubEvidence(config, expected.prNumber, options.targetSha);
  validateLiveGithubEvidence(live, evidence, options.phase);

  if (options.phase === 'production') {
    // Dry-run validates credential presence and fixed command construction without using the credential.
    buildRemoteDeployArgs(config, options.targetSha);
  }

  const plan = {
    status: options.finalize ? 'authorized_for_accuracy_finalization' : 'authorized_pre_checkout',
    dry_run: options.dryRun,
    phase: options.phase,
    target_sha: options.targetSha,
    tag: options.tag,
    signer_fingerprint: authorization.signerFingerprint,
    payment_tag: paymentAuthorization?.tag || null,
    inventory_sha256: inventoryHash,
    evidence_sha256: evidenceHash,
    documentation_closure_sha256: documentationClosureHash,
    regression_risk_notice_sha256: regressionRiskNoticeHash,
    pr_number: expected.prNumber,
  };
  const recordStore = new ReleaseRecordStore(config.release_records_dir);
  if (options.dryRun) return plan;

  if (options.finalize) {
    const entry = ledger.read(authorization.auth);
    if (entry.status !== 'deployed_pending_accuracy') throw new ReleaseControllerError('LEDGER_STATE_INVALID', `Finalization requires deployed_pending_accuracy, got ${entry.status}`);
    const baselineProof = collectProductionBaselineProof(config, options.targetSha);
    let ledgerCompleted = false;
    try {
      const accuracyProof = validateAccuracyProofBundle(
        readJson(options.accuracyProof, 'production accuracy proof'),
        inventory,
        options.targetSha,
        { notBefore: entry.deployed_at, verifyArtifacts: true }
      );
      const completed = ledger.finalize(authorization.auth, {
        production_proof: baselineProof,
        accuracy_proof_sha256: sha256File(options.accuracyProof),
      });
      if (paymentAuthorization) ledger.finalize(paymentAuthorization.auth, { accuracy_proof_sha256: sha256File(options.accuracyProof) });
      ledgerCompleted = true;
      const record = buildReleaseRecord({ options, inventory, evidence, documentationClosure, regressionRiskNotice, authorization, paymentAuthorization, qualification: entry.details?.qualification, baselineProof, ledgerState: completed.status, accuracyProof });
      const recordPaths = recordStore.writeFinalizationRecord(record);
      return { ...plan, status: 'completed', completion_state: 'accurately_reflected', release_record: recordPaths };
    } catch (error) {
      if (!ledgerCompleted) {
        ledger.recordAccuracyFailure(authorization.auth, { code: error.code || 'ACCURACY_FINALIZATION_FAILED', message: error.message });
        if (paymentAuthorization) ledger.recordAccuracyFailure(paymentAuthorization.auth, { code: error.code || 'ACCURACY_FINALIZATION_FAILED' });
      }
      throw error;
    }
  }

  let worktree;
  let deploymentSucceeded = false;
  try {
    worktree = createWorktree({ gitBin: config.git_bin, gitDir: config.git_mirror, targetSha: options.targetSha, worktreeRoot: config.worktree_root });
    const changedOutput = requireCommand(
      run(config.git_bin || 'git', ['diff', '--name-only', `${inventory.base_sha}...${options.targetSha}`, '--'], { cwd: worktree }),
      'DOCUMENTATION_CLOSURE_INVALID',
      'Recompute exact candidate diff for documentation closure'
    );
    validateInventoryDocumentation(inventory, {
      worktree,
      gitBin: config.git_bin,
      changedFiles: changedOutput.split(/\r?\n/).filter(Boolean),
    });
    const qualification = runQualification({
      worktree,
      targetSha: options.targetSha,
      commands: config.qualification_commands?.[options.phase],
      timeoutMs: Number(config.qualification_timeout_ms || 1_800_000),
      env: process.env,
    });

    ledger.reserve(authorization.auth, { signerFingerprint: authorization.signerFingerprint, tag: options.tag });
    if (paymentAuthorization) ledger.reserve(paymentAuthorization.auth, { signerFingerprint: paymentAuthorization.signerFingerprint, tag: options.paymentTag });

    if (options.phase === 'promotion') {
      const result = run(config.gh_bin || 'gh', ['pr', 'merge', String(expected.prNumber), '--repo', config.repository, '--merge', '--match-head-commit', options.targetSha]);
      requireCommand(result, 'PROMOTION_MERGE_FAILED', `Merge PR #${expected.prNumber}`);
    } else {
      const result = run(config.ssh_bin || 'ssh', buildRemoteDeployArgs(config, options.targetSha), { timeoutMs: Number(config.deploy_timeout_ms || 1_800_000) });
      requireCommand(result, 'PRODUCTION_DEPLOY_FAILED', 'Execute fixed production deploy command');
      deploymentSucceeded = true;
    }

    if (options.phase === 'promotion') {
      ledger.complete(authorization.auth, 'completed', { qualification });
      if (paymentAuthorization) ledger.complete(paymentAuthorization.auth, 'completed', { qualification });
      return { ...plan, status: 'completed', qualification };
    }

    let baselineProof = null;
    let proofError = null;
    try {
      baselineProof = collectProductionBaselineProof(config, options.targetSha);
    } catch (error) {
      proofError = error;
    }
    const residualRisks = proofError ? [{ code: proofError.code || 'PRODUCTION_PROOF_FAILED', message: proofError.message }] : ['Per-slice post-deployment accuracy proof is pending trusted finalization.'];
    const pending = ledger.markDeployedPendingAccuracy(authorization.auth, { qualification, production_proof: baselineProof, residual_risks: residualRisks });
    if (paymentAuthorization) ledger.markDeployedPendingAccuracy(paymentAuthorization.auth, { qualification, production_proof: baselineProof, residual_risks: residualRisks });
    const record = buildReleaseRecord({ options, inventory, evidence, documentationClosure, regressionRiskNotice, authorization, paymentAuthorization, qualification, baselineProof, ledgerState: pending.status, residualRisks });
    const recordPaths = recordStore.writeDeploymentRecord(record);
    if (proofError) throw proofError;
    return { ...plan, status: 'deployed_pending_accuracy', qualification, release_record: recordPaths };
  } catch (error) {
    try {
      const ledgerPath = ledger.entryPath(authorization.auth);
      if (fs.existsSync(ledgerPath)) {
        const current = ledger.read(authorization.auth);
        if (current.status === 'reserved' && deploymentSucceeded) ledger.markDeployedPendingAccuracy(authorization.auth, { residual_risks: [{ code: error.code || 'UNEXPECTED', message: error.message }] });
        else if (current.status === 'reserved') ledger.complete(authorization.auth, 'failed', { code: error.code || 'UNEXPECTED' });
        else if (current.status === 'deployed_pending_accuracy') ledger.recordAccuracyFailure(authorization.auth, { code: error.code || 'UNEXPECTED', message: error.message });
      }
      if (paymentAuthorization && fs.existsSync(ledger.entryPath(paymentAuthorization.auth))) {
        const current = ledger.read(paymentAuthorization.auth);
        if (current.status === 'reserved' && deploymentSucceeded) ledger.markDeployedPendingAccuracy(paymentAuthorization.auth, { residual_risks: [{ code: error.code || 'UNEXPECTED' }] });
        else if (current.status === 'reserved') ledger.complete(paymentAuthorization.auth, 'failed', { code: error.code || 'UNEXPECTED' });
        else if (current.status === 'deployed_pending_accuracy') ledger.recordAccuracyFailure(paymentAuthorization.auth, { code: error.code || 'UNEXPECTED' });
      }
    } catch (_) {
      // Preserve the original failure; ledger repair is an operator incident.
    }
    throw error;
  } finally {
    if (worktree) removeWorktree({ gitBin: config.git_bin, gitDir: config.git_mirror }, worktree);
  }
}

function main() {
  try {
    const result = controllerMain(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    if (error instanceof ReleaseControllerError) {
      console.error(`[release-controller] ${error.code}: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) main();

module.exports = {
  parseArgs,
  loadConfig,
  refreshMirror,
  remoteSha,
  liveGithubEvidence,
  verifyAuthorization,
  collectProductionBaselineProof,
  buildReleaseRecord,
  controllerMain,
};
