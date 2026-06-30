const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { CandidateEvidenceError, buildCandidateEvidence } = require('./build-release-candidate-evidence');

const SHA = '0123456789abcdef0123456789abcdef01234567';

function write(root, name, value) {
  const target = path.join(root, name);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return name;
}

function hash(root, name) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-evidence-'));
  const inventory = write(root, 'inventory.json', {
    version: 2,
    head_sha: SHA,
    status: 'pass',
    promotion_eligibility: 'eligible',
    review_status: 'reviewed',
    payment_sensitive: false,
    release_slices: [{ id: 'release' }],
  });
  const documentationClosure = write(root, 'documentation.json', {
    schema: 'sku-documentation-closure/v1',
    status: 'pass',
    non_bypassable: true,
    target_sha: SHA,
    inventory_sha256: hash(root, inventory),
    release_slices: [{ slice_id: 'release', status: 'pass' }],
  });
  const regressionRiskNotice = write(root, 'risk.json', { status: 'pass', target_sha: SHA });
  const prEvidence = write(root, 'pr.json', { repository: 'owner/repo', number: 24, base: 'master', head: 'staging', head_sha: SHA, checks: [] });
  const qaProof = write(root, 'qa.json', { status: 'pass', target_sha: SHA, isolated: true });
  const localQualification = write(root, 'local.json', { status: 'pass', target_sha: SHA });
  return {
    root,
    options: { projectRoot: root, phase: 'promotion', targetSha: SHA, inventory, documentationClosure, regressionRiskNotice, prEvidence, qaProof, localQualification },
  };
}

test('candidate evidence binds passing documentation closure and regression risk', () => {
  const { root, options } = fixture();
  try {
    const evidence = buildCandidateEvidence(options);
    assert.equal(evidence.schema, 'sku-release-evidence/v2');
    assert.equal(evidence.documentation_closure.status, 'pass');
    assert.match(evidence.documentation_closure.report_sha256, /^[0-9a-f]{64}$/);
    assert.match(evidence.regression_risk_notice.report_sha256, /^[0-9a-f]{64}$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('candidate evidence rejects missing or failed documentation closure', () => {
  const { root, options } = fixture();
  try {
    const closurePath = path.join(root, options.documentationClosure);
    const closure = JSON.parse(fs.readFileSync(closurePath, 'utf8'));
    closure.status = 'fail';
    fs.writeFileSync(closurePath, `${JSON.stringify(closure)}\n`);
    assert.throws(() => buildCandidateEvidence(options), (error) => error instanceof CandidateEvidenceError && error.code === 'DOCUMENTATION_CLOSURE_INVALID');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
