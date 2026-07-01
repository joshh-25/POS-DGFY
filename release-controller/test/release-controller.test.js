const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ReleaseControllerError,
  NonceLedger,
  parseAuthorizationMessage,
  validateAuthorizationFields,
  verifySignedTag,
  validateEvidence,
  validateEmergencyQaReport,
  validateInventoryDocumentation,
  validateDocumentationClosureEvidence,
  validateLiveGithubEvidence,
  validateGithubActionsUnavailabilityReport,
  validateAccuracyProofBundle,
  validateProductionBaselineProof,
  ReleaseRecordStore,
  buildRemoteDeployArgs,
} = require('../lib/release-controller');

const SHA = '0123456789abcdef0123456789abcdef01234567';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const FINGERPRINT = 'A'.repeat(40);

function authMessage(overrides = {}) {
  const fields = {
    schema: 'sku-release-authorization/v1',
    repository: 'owner/repo',
    phase: 'production',
    target_sha: SHA,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    nonce: 'c'.repeat(32),
    inventory_sha256: HASH_A,
    evidence_sha256: HASH_B,
    payment_sensitive: 'false',
    pr_number: '24',
    ...overrides,
  };
  return Object.entries(fields).map(([key, value]) => `${key}=${value}`).join('\n');
}

function expected(overrides = {}) {
  return {
    repository: 'owner/repo',
    phase: 'production',
    targetSha: SHA,
    inventoryHash: HASH_A,
    evidenceHash: HASH_B,
    paymentSensitive: false,
    prNumber: 24,
    ...overrides,
  };
}

test('rejects a forged or invalid tag signature', () => {
  const responses = [
    { ok: true, status: 0, stdout: 'tag\n', stderr: '' },
    { ok: true, status: 0, stdout: `${SHA}\n`, stderr: '' },
    { ok: false, status: 1, stdout: '', stderr: 'BAD signature' },
  ];
  assert.throws(
    () => verifySignedTag({ tag: 'release-tag', allowedFingerprints: [FINGERPRINT], runner: () => responses.shift() }),
    (error) => error instanceof ReleaseControllerError && error.code === 'SIGNATURE_INVALID'
  );
});

test('rejects a valid signature from a non-allowlisted signer', () => {
  const responses = [
    { ok: true, status: 0, stdout: 'tag\n', stderr: '' },
    { ok: true, status: 0, stdout: `${SHA}\n`, stderr: '' },
    { ok: true, status: 0, stdout: '', stderr: `[GNUPG:] VALIDSIG ${FINGERPRINT} 2026 0 4 0 1 10 00 ${FINGERPRINT}\n` },
  ];
  assert.throws(
    () => verifySignedTag({ tag: 'release-tag', allowedFingerprints: ['B'.repeat(40)], runner: () => responses.shift() }),
    (error) => error.code === 'SIGNER_NOT_ALLOWED'
  );
});

test('rejects expired authorization and wrong SHA', () => {
  assert.throws(
    () => validateAuthorizationFields(parseAuthorizationMessage(authMessage({ expires_at: '2020-01-01T00:00:00.000Z' })), expected()),
    (error) => error.code === 'AUTH_EXPIRED'
  );
  assert.throws(
    () => validateAuthorizationFields(parseAuthorizationMessage(authMessage()), expected({ targetSha: 'f'.repeat(40) })),
    (error) => error.code === 'AUTH_SHA_MISMATCH'
  );
});

test('nonce ledger refuses replay even after a failed action', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-ledger-'));
  try {
    const auth = validateAuthorizationFields(parseAuthorizationMessage(authMessage()), expected());
    const ledger = new NonceLedger(root);
    ledger.reserve(auth, { signerFingerprint: FINGERPRINT, tag: 'tag' });
    ledger.complete(auth, 'failed', { reason: 'simulated' });
    assert.throws(() => ledger.assertUnused(auth), (error) => error.code === 'AUTH_REPLAYED');
    assert.throws(() => ledger.reserve(auth), (error) => error.code === 'AUTH_REPLAYED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('candidate evidence fails for failed checks and stale QA', () => {
  const evidence = {
    schema: 'sku-release-evidence/v2',
    version: 2,
    repository: 'owner/repo',
    phase: 'production',
    target_sha: SHA,
    pr: { number: 24, base: 'master', head: 'staging' },
    inventory_sha256: HASH_A,
    documentation_closure: { status: 'pass', target_sha: SHA, inventory_sha256: HASH_A, report_sha256: 'd'.repeat(64), non_bypassable: true },
    regression_risk_notice: { status: 'pass', target_sha: SHA, report_sha256: 'e'.repeat(64) },
    payment_sensitive: false,
    qa: { status: 'pass', target_sha: SHA, isolated: true },
    local_qualification: { status: 'pass', target_sha: SHA },
    master_audit: { status: 'pass', governed_promotion: true },
    required_checks: [{ name: 'exact-master', conclusion: 'failure', details_url: 'https://github.com/owner/repo/actions/runs/1' }],
  };
  const evidenceExpected = expected({ documentationClosureHash: 'd'.repeat(64), regressionRiskNoticeHash: 'e'.repeat(64) });
  assert.throws(() => validateEvidence(evidence, evidenceExpected, ['exact-master']), (error) => error.code === 'REQUIRED_CHECK_FAILED');
  evidence.required_checks[0].conclusion = 'success';
  evidence.qa.target_sha = 'f'.repeat(40);
  assert.throws(() => validateEvidence(evidence, evidenceExpected, ['exact-master']), (error) => error.code === 'QA_EVIDENCE_INVALID');
  evidence.qa.target_sha = SHA;
  evidence.local_qualification.status = 'fail';
  assert.throws(() => validateEvidence(evidence, evidenceExpected, ['exact-master']), (error) => error.code === 'LOCAL_QUALIFICATION_FAILED');
});

test('emergency QA bypass is explicit, configured, and limited to isolated QA unavailability', () => {
  const evidence = {
    schema: 'sku-release-evidence/v2', version: 2, repository: 'owner/repo', phase: 'production', target_sha: SHA,
    pr: { number: 24, base: 'master', head: 'staging' }, inventory_sha256: HASH_A, payment_sensitive: false,
    documentation_closure: { status: 'pass', target_sha: SHA, inventory_sha256: HASH_A, report_sha256: 'd'.repeat(64), non_bypassable: true },
    regression_risk_notice: { status: 'pass', target_sha: SHA, report_sha256: 'e'.repeat(64) },
    qa: { status: 'unavailable', target_sha: SHA, isolated: false },
    emergency_qa: { status: 'approved', reason_code: 'isolated_qa_unavailable', target_sha: SHA, actor: 'owner', report_sha256: 'f'.repeat(64) },
    local_qualification: { status: 'pass', target_sha: SHA },
    master_audit: { status: 'pass', governed_promotion: true }, required_checks: [],
  };
  const evidenceExpected = expected({ documentationClosureHash: 'd'.repeat(64), regressionRiskNoticeHash: 'e'.repeat(64) });
  assert.throws(() => validateEvidence(evidence, evidenceExpected), (error) => error.code === 'QA_EVIDENCE_INVALID');
  assert.doesNotThrow(() => validateEvidence(evidence, evidenceExpected, [], { allowEmergencyQaBypass: true }));
  evidence.local_qualification.status = 'fail';
  assert.throws(() => validateEvidence(evidence, evidenceExpected, [], { allowEmergencyQaBypass: true }), (error) => error.code === 'LOCAL_QUALIFICATION_FAILED');
});

test('billing fallback accepts only a hash-bound failed check when explicitly enabled', () => {
  const evidence = {
    schema: 'sku-release-evidence/v2',
    version: 2,
    repository: 'owner/repo',
    phase: 'production',
    target_sha: SHA,
    pr: { number: 24, base: 'master', head: 'staging' },
    inventory_sha256: HASH_A,
    documentation_closure: { status: 'pass', target_sha: SHA, inventory_sha256: HASH_A, report_sha256: 'd'.repeat(64), non_bypassable: true },
    regression_risk_notice: { status: 'pass', target_sha: SHA, report_sha256: 'e'.repeat(64) },
    payment_sensitive: false,
    qa: { status: 'pass', target_sha: SHA, isolated: true },
    local_qualification: { status: 'pass', target_sha: SHA },
    master_audit: { status: 'pass', governed_promotion: true },
    required_checks: [{ name: 'exact-master', conclusion: 'failure', details_url: 'https://github.com/owner/repo/actions/runs/1' }],
    github_actions_unavailability: {
      status: 'pass',
      reason: 'billing_allocation_failure',
      target_sha: SHA,
      required_checks: ['exact-master'],
      report_sha256: 'f'.repeat(64),
    },
  };
  const evidenceExpected = expected({ documentationClosureHash: 'd'.repeat(64), regressionRiskNoticeHash: 'e'.repeat(64) });
  assert.doesNotThrow(() => validateEvidence(evidence, evidenceExpected, ['exact-master'], { allowGithubBillingFallback: true }));
  assert.throws(() => validateEvidence(evidence, evidenceExpected, ['exact-master']), (error) => error.code === 'REQUIRED_CHECK_FAILED');
});

test('live billing fallback requires zero steps, no runner, and the exact allocation annotation', () => {
  const evidence = {
    target_sha: SHA,
    pr: { number: 24, base: 'master', head: 'staging' },
    required_checks: [{ name: 'exact-master', conclusion: 'failure' }],
    github_actions_unavailability: { status: 'pass', reason: 'billing_allocation_failure', target_sha: SHA, required_checks: ['exact-master'], report_sha256: 'f'.repeat(64) },
  };
  const live = {
    number: 24,
    state: 'MERGED',
    base: 'master',
    head: 'staging',
    mergeCommitSha: SHA,
    checks: [{
      name: 'exact-master',
      conclusion: 'failure',
      appSlug: 'github-actions',
      runnerId: 0,
      runnerName: '',
      steps: [],
      annotations: [{ message: 'The job was not started because recent account payments have failed or your spending limit needs to be increased.' }],
    }],
  };
  assert.doesNotThrow(() => validateLiveGithubEvidence(live, evidence, 'production', { allowGithubBillingFallback: true }));
  live.checks[0].steps = [{ name: 'checkout' }];
  assert.throws(() => validateLiveGithubEvidence(live, evidence, 'production', { allowGithubBillingFallback: true }), (error) => error.code === 'GITHUB_REQUIRED_CHECK_FAILED');
});

test('bound billing report rejects executed jobs and mismatched required checks', () => {
  const evidence = {
    github_actions_unavailability: {
      status: 'pass',
      reason: 'billing_allocation_failure',
      target_sha: SHA,
      required_checks: ['exact-master'],
      report_sha256: 'f'.repeat(64),
    },
  };
  const report = {
    schema: 'sku-github-actions-unavailability/v1',
    status: 'pass',
    reason: 'billing_allocation_failure',
    repository: 'owner/repo',
    target_sha: SHA,
    required_checks: [{
      name: 'exact-master',
      conclusion: 'failure',
      runner_id: 0,
      runner_name: '',
      steps: 0,
      annotation_message: 'The job was not started because recent account payments have failed or your spending limit needs to be increased.',
    }],
  };
  assert.doesNotThrow(() => validateGithubActionsUnavailabilityReport(report, evidence, { repository: 'owner/repo', targetSha: SHA }));
  report.required_checks[0].steps = 1;
  assert.throws(() => validateGithubActionsUnavailabilityReport(report, evidence, { repository: 'owner/repo', targetSha: SHA }), (error) => error.code === 'GITHUB_ACTIONS_UNAVAILABILITY_INVALID');
});

test('live GitHub evidence rejects moved master merge SHA', () => {
  const evidence = { target_sha: SHA, pr: { number: 24, base: 'master', head: 'staging' }, required_checks: [] };
  const live = { number: 24, state: 'MERGED', base: 'master', head: 'staging', mergeCommitSha: 'f'.repeat(40), checks: [] };
  assert.throws(() => validateLiveGithubEvidence(live, evidence, 'production'), (error) => error.code === 'GITHUB_MERGE_SHA_MISMATCH');
});

test('production operation refuses absent credentials', () => {
  assert.throws(() => buildRemoteDeployArgs({ production: {} }, SHA), (error) => error.code === 'PRODUCTION_CREDENTIALS_ABSENT');
});

test('payment-sensitive release requires separate payment tag in controller flow', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bin', 'skupervisor-release-controller.js'), 'utf8');
  assert.match(source, /PAYMENT_AUTH_REQUIRED/);
  assert.match(source, /phase: 'payment'/);
});

test('signature verification is ordered before candidate worktree creation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bin', 'skupervisor-release-controller.js'), 'utf8');
  assert.ok(source.indexOf('verifyAuthorization(options') < source.indexOf('createWorktree({'));
});

test('dry run returns before worktree creation and nonce reservation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bin', 'skupervisor-release-controller.js'), 'utf8');
  const dryRunReturn = source.indexOf('if (options.dryRun) return plan');
  assert.ok(dryRunReturn > source.indexOf('verifyAuthorization(options'));
  assert.ok(dryRunReturn < source.indexOf('createWorktree({'));
  assert.ok(dryRunReturn < source.indexOf('ledger.reserve('));
});

test('moved remote branch is a hard controller failure before checkout', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bin', 'skupervisor-release-controller.js'), 'utf8');
  assert.match(source, /REMOTE_MOVED/);
  assert.ok(source.indexOf("throw new ReleaseControllerError('REMOTE_MOVED'") < source.indexOf('createWorktree({'));
});

test('accuracy proof validation rejects missing slice proof', () => {
  const inventory = { release_slices: [{ id: 'one' }] };
  assert.throws(
    () => validateAccuracyProofBundle({ schema: 'sku-deployed-accuracy-proof/v1', target_sha: SHA, proofs: [] }, inventory, SHA),
    (error) => error.code === 'ACCURACY_PROOF_MISSING'
  );
});

test('external controller rejects missing documentation closure independently', () => {
  const inventory = { head_sha: SHA, expected_changed_files: ['scripts/change.js'], release_slices: [{ id: 'one', required_docs: [] }] };
  assert.throws(() => validateInventoryDocumentation(inventory), (error) => error.code === 'DOCUMENTATION_CLOSURE_INVALID');
  assert.throws(
    () => validateDocumentationClosureEvidence({ schema: 'sku-documentation-closure/v1', version: 1, status: 'fail' }, { targetSha: SHA, inventoryHash: HASH_A }),
    (error) => error.code === 'DOCUMENTATION_CLOSURE_INVALID'
  );
});

test('production deploy lifecycle cannot complete before accuracy proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-ledger-state-'));
  try {
    const auth = validateAuthorizationFields(parseAuthorizationMessage(authMessage()), expected());
    const ledger = new NonceLedger(root);
    ledger.reserve(auth, { signerFingerprint: FINGERPRINT, tag: 'tag' });
    assert.throws(() => ledger.finalize(auth), (error) => error.code === 'LEDGER_STATE_INVALID');
    ledger.markDeployedPendingAccuracy(auth, { production_proof: { status: 'pass' } });
    assert.equal(ledger.read(auth).status, 'deployed_pending_accuracy');
    const inventory = { release_slices: [{ id: 'one' }] };
    assert.throws(
      () => validateAccuracyProofBundle({ schema: 'sku-deployed-accuracy-proof/v1', target_sha: SHA, proofs: [] }, inventory, SHA),
      (error) => error.code === 'ACCURACY_PROOF_MISSING'
    );
    assert.equal(ledger.read(auth).status, 'deployed_pending_accuracy');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('passing post-deploy proof for every slice permits completed transition', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-ledger-finalize-'));
  const artifact = path.join(root, 'proof.json');
  try {
    fs.writeFileSync(artifact, '{"ok":true}\n');
    const artifactHash = require('crypto').createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
    const auth = validateAuthorizationFields(parseAuthorizationMessage(authMessage()), expected());
    const ledger = new NonceLedger(path.join(root, 'ledger'));
    ledger.reserve(auth, { signerFingerprint: FINGERPRINT, tag: 'tag' });
    const pending = ledger.markDeployedPendingAccuracy(auth, {});
    const proof = {
      schema: 'sku-deployed-accuracy-proof/v1',
      target_sha: SHA,
      proofs: [{ slice_id: 'one', type: 'api', status: 'pass', target_sha: SHA, subject: 'Read-only health contract verification', captured_at: new Date(Date.now() + 10).toISOString(), artifact_path: artifact, artifact_sha256: artifactHash }],
    };
    validateAccuracyProofBundle(proof, { release_slices: [{ id: 'one' }] }, SHA, { notBefore: pending.deployed_at, verifyArtifacts: true });
    ledger.finalize(auth, { accuracy: 'pass' });
    assert.equal(ledger.read(auth).status, 'completed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('stale or wrong-SHA production proof is rejected', () => {
  const baseline = {
    remote: { remote_head: 'f'.repeat(40), deploy_state: SHA },
    deploy_summary: { deployed_head: SHA, remote_head: SHA, expected_commit: SHA, frontend_asset_parity_status: 'pass' },
    production_contract: { ok: true, target_sha: SHA, git_head: SHA, deploy_state_sha: SHA, health: [{ ok: true, runtime_sha: SHA }] },
  };
  assert.throws(() => validateProductionBaselineProof(baseline, SHA), (error) => error.code === 'PRODUCTION_SHA_MISMATCH');

  const staleProof = {
    schema: 'sku-deployed-accuracy-proof/v1',
    target_sha: SHA,
    proofs: [{
      slice_id: 'one',
      type: 'api',
      status: 'pass',
      target_sha: SHA,
      subject: 'Read-only API proof',
      captured_at: '2026-01-01T00:00:00.000Z',
      artifact_sha256: HASH_A,
    }],
  };
  assert.throws(
    () => validateAccuracyProofBundle(staleProof, { release_slices: [{ id: 'one' }] }, SHA, { notBefore: '2026-06-30T00:00:00.000Z' }),
    (error) => error.code === 'ACCURACY_PROOF_STALE'
  );
});

test('external release records are write-once with restrictive permissions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-records-'));
  try {
    const store = new ReleaseRecordStore(root);
    const record = { target_sha: SHA, branch: 'master', ledger_state: 'deployed_pending_accuracy', release_slices: [] };
    const paths = store.writeDeploymentRecord(record);
    assert.equal(fs.existsSync(paths.json), true);
    assert.equal(fs.existsSync(paths.markdown), true);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(root).mode & 0o777, 0o700);
      assert.equal(fs.statSync(paths.json).mode & 0o777, 0o600);
    }
    assert.throws(() => store.writeDeploymentRecord(record), (error) => error.code === 'RELEASE_RECORD_EXISTS');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('controller source returns deployed_pending_accuracy after production deploy', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'bin', 'skupervisor-release-controller.js'), 'utf8');
  assert.match(source, /status: 'deployed_pending_accuracy'/);
  assert.ok(source.indexOf('markDeployedPendingAccuracy') > source.indexOf('PRODUCTION_DEPLOY_FAILED'));
});
