const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { MasterPromotionAuditError, auditMasterPromotion } = require('./audit-master-promotion');
const silentLogger = { log() {} };

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

test('detects a direct single-parent push to master', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'master-audit-'));
  try {
    git(root, ['init']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(root, 'README.md'), '# direct\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'direct push']);
    const sha = git(root, ['rev-parse', 'HEAD']);
    const evidencePath = path.join(root, 'evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify({ number: 25, merged: true, base: 'master', head: 'staging', merge_commit_sha: sha, promotion_authorization: { status: 'present', tag: 'tag' }, inventory: { review_status: 'reviewed', sha256: 'a'.repeat(64) } }));
    assert.throws(
      () => auditMasterPromotion({ projectRoot: root, targetSha: sha, prEvidencePath: evidencePath }, silentLogger),
      (error) => error instanceof MasterPromotionAuditError && error.code === 'UNGOVERNED_MASTER_UPDATE'
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts a governed staging promotion that contains feature-branch work', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'master-audit-'));
  try {
    git(root, ['init']);
    git(root, ['config', 'user.email', 'test@example.com']);
    git(root, ['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(root, 'README.md'), '# base\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'base']);
    git(root, ['checkout', '-b', 'staging']);
    git(root, ['checkout', '-b', 'feature/inventory-fix']);
    fs.writeFileSync(path.join(root, 'feature.txt'), 'developer branch work\n');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'feature work']);
    git(root, ['checkout', 'staging']);
    git(root, ['merge', '--no-ff', 'feature/inventory-fix', '-m', 'merge feature into staging']);
    const stagingSha = git(root, ['rev-parse', 'HEAD']);
    git(root, ['checkout', 'master']);
    git(root, ['merge', '--no-ff', 'staging', '-m', 'promote staging']);
    const masterSha = git(root, ['rev-parse', 'HEAD']);
    const evidencePath = path.join(root, 'evidence.json');
    fs.writeFileSync(evidencePath, JSON.stringify({
      number: 25,
      merged: true,
      base: 'master',
      head: 'staging',
      head_sha: stagingSha,
      merge_commit_sha: masterSha,
      promotion_authorization: { status: 'present', tag: `release-authorization/promotion/${stagingSha}/nonce` },
      inventory: { review_status: 'reviewed', sha256: 'a'.repeat(64) },
    }));
    const report = auditMasterPromotion({ projectRoot: root, targetSha: masterSha, prEvidencePath: evidencePath }, silentLogger);
    assert.equal(report.status, 'pass');
    assert.equal(report.governed_promotion, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
