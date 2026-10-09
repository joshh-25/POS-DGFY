const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SUMMARIZER = path.join(__dirname, 'summarize-backend-test-matrix.js');

test('matrix summary reads Jest 30 suite timing fields for fast and db suites', () => {
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-summary-evidence-'));
  const targetSha = 'testsha';
  const artifactDir = path.join(evidenceRoot, targetSha, 'backend-test-matrix');
  fs.mkdirSync(artifactDir, { recursive: true });

  const fastResultsPath = path.join(evidenceRoot, 'fast.results.json');
  const dbResultsPath = path.join(evidenceRoot, 'db.results.json');
  fs.writeFileSync(fastResultsPath, JSON.stringify({
    testResults: [{
      name: path.join(ROOT, 'apps/dgfy-api/tests/slowFast.test.js'),
      startTime: 1000,
      endTime: 9200,
      status: 'passed',
    }],
  }));
  fs.writeFileSync(dbResultsPath, JSON.stringify({
    testResults: [{
      name: path.join(ROOT, 'apps/dgfy-api/tests/slowDb.integration.test.js'),
      startTime: 5000,
      endTime: 21750,
      status: 'failed',
    }],
  }));
  fs.writeFileSync(path.join(artifactDir, 'backend_test_matrix.json'), JSON.stringify({
    target_sha: targetSha,
    verdict: 'fail',
    chunks: [
      { tier: 'fast', jest_results_files: [fastResultsPath] },
      { tier: 'db', group: 'db_group', jest_results_file: dbResultsPath },
    ],
  }));

  try {
    const result = spawnSync(process.execPath, [SUMMARIZER], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        RELEASE_TARGET_SHA: targetSha,
        RELEASE_GATES_EVIDENCE_ROOT: evidenceRoot,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /slowFast\.test\.js/);
    assert.match(result.stdout, /8\.2s/);
    assert.match(result.stdout, /slowDb\.integration\.test\.js/);
    assert.match(result.stdout, /16\.8s/);
    assert.doesNotMatch(result.stdout, /No Jest timing data found/);
  } finally {
    fs.rmSync(evidenceRoot, { recursive: true, force: true });
  }
});
