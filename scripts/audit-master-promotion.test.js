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
