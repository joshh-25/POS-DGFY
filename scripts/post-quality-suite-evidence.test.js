const assert = require('node:assert/strict');
const test = require('node:test');

const { parseArgs, resultForJob, buildComment } = require('./post-quality-suite-evidence');

const SHA = 'a'.repeat(40);

test('requires a positive workflow run ID and validates optional identifiers', () => {
  assert.deepEqual(parseArgs(['--run-id', '123', '--candidate', '2026-10-03-01', '--pr', '42']), {
    runId: '123', candidateId: '2026-10-03-01', pr: '42',
  });
  assert.throws(() => parseArgs([]), /--run-id must be a positive run ID/);
  assert.throws(() => parseArgs(['--run-id', '1', '--candidate', 'bad']), /--candidate must use YYYY-MM-DD-NN/);
});

test('renders step failures and missing jobs as advisory evidence', () => {
  const comment = buildComment({
    run: { head_sha: SHA, head_branch: 'ci/example', html_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/123' },
    jobs: [{ name: 'dgfy-api-quality', conclusion: 'success' }],
    pr: { head: { sha: SHA } },
    failuresByJob: { 'dgfy-api-quality': 'Run API lint,cancelled step' },
  });

  assert.match(comment, /Overall:\*\* 11 job\(s\) reported advisory failures/);
  assert.match(comment, /advisory failures: Run API lint,cancelled step/);
  assert.match(comment, /frontend-pos-quality \| advisory: unavailable/);
  assert.match(comment, /These results are informational and do not gate promotion/);
});

test('skipped jobs are not treated as clean', () => {
  assert.equal(resultForJob({ conclusion: 'skipped' }), 'advisory: skipped');
});
