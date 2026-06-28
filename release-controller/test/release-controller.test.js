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
  validateLiveGithubEvidence,
  validateAccuracyProofBundle,
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
    schema: 'sku-release-evidence/v1',
    version: 1,
    repository: 'owner/repo',
    phase: 'production',
    target_sha: SHA,
    pr: { number: 24, base: 'master', head: 'staging' },
    inventory_sha256: HASH_A,
    payment_sensitive: false,
    qa: { status: 'pass', target_sha: SHA, isolated: true },
    local_qualification: { status: 'pass', target_sha: SHA },
    master_audit: { status: 'pass', governed_promotion: true },
    required_checks: [{ name: 'exact-master', conclusion: 'failure', details_url: 'https://github.com/owner/repo/actions/runs/1' }],
  };
  assert.throws(() => validateEvidence(evidence, expected(), ['exact-master']), (error) => error.code === 'REQUIRED_CHECK_FAILED');
  evidence.required_checks[0].conclusion = 'success';
  evidence.qa.target_sha = 'f'.repeat(40);
  assert.throws(() => validateEvidence(evidence, expected(), ['exact-master']), (error) => error.code === 'QA_EVIDENCE_INVALID');
  evidence.qa.target_sha = SHA;
  evidence.local_qualification.status = 'fail';
  assert.throws(() => validateEvidence(evidence, expected(), ['exact-master']), (error) => error.code === 'LOCAL_QUALIFICATION_FAILED');
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
