const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { AccuracyReviewError, review } = require('./review-deployed-change-accuracy');
const SHA = '0123456789abcdef0123456789abcdef01234567';

function fixture(includeProof = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'accuracy-proof-'));
  const writeJson = (name, value) => {
    const target = path.join(root, name);
    fs.writeFileSync(target, JSON.stringify(value, null, 2));
    return target;
  };
  const inventoryPath = writeJson('inventory.json', { head_sha: SHA, release_slices: [{ id: 'release', slice_name: 'Release' }] });
  const summaryPath = path.join(root, 'summary.txt');
  fs.writeFileSync(summaryPath, `deployed_head=${SHA}\nremote_head=${SHA}\nexpected_commit=${SHA}\nfrontend_asset_parity_status=pass\n`);
  const generatedAt = new Date(Date.now() - 5000).toISOString();
  const contractPath = writeJson('contract.json', { ok: true, generated_at: generatedAt, target_sha: SHA, git_head: SHA, deploy_state_sha: SHA, health: [{ ok: true, runtime_sha: SHA }] });
  const artifactPath = path.join(root, 'api-proof.json');
  fs.writeFileSync(artifactPath, '{"status":"ok"}\n');
  const artifactHash = crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
  const proofPath = writeJson('proof.json', {
    schema: 'sku-deployed-accuracy-proof/v1',
    target_sha: SHA,
    proofs: includeProof ? [{ slice_id: 'release', type: 'api', status: 'pass', target_sha: SHA, subject: 'GET /api/v1/health returned the target runtime SHA', captured_at: new Date().toISOString(), artifact_path: artifactPath, artifact_sha256: artifactHash }] : [],
  });
  return { root, options: { inventoryPath, deploySummaryPath: summaryPath, productionContractPath: contractPath, proofBundlePath: proofPath } };
}

test('passes only with hash-verified actual per-slice proof', () => {
  const { root, options } = fixture(true);
  try {
    const report = review(options);
    assert.equal(report.status, 'pass');
    assert.equal(report.release_slices[0].accuracy_state, 'accurately_reflected');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails closed when a slice has no accuracy proof', () => {
  const { root, options } = fixture(false);
  try {
    assert.throws(() => review(options), (error) => error instanceof AccuracyReviewError && error.code === 'ACCURACY_PROOF_FAILED');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
