const assert = require('node:assert/strict');
const test = require('node:test');

const { parseArgs, resultForJob, buildComment, main } = require('./post-quality-suite-evidence');

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

  assert.match(comment, /Overall:\*\* 12 job\(s\) reported advisory failures/);
  assert.match(comment, /advisory failures: Run API lint,cancelled step/);
  assert.match(comment, /frontend-pos-quality \| advisory: unavailable/);
  assert.match(comment, /These results are informational and do not gate promotion/);
});

test('skipped jobs are not treated as clean', () => {
  assert.equal(resultForJob({ conclusion: 'skipped' }), 'advisory: skipped');
});

test('main posts advisory evidence from jobs envelopes and paginated pull request arrays', async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
  };
  const requests = [];
  const matchingPr = { number: 42, head: { ref: 'ci/example', sha: SHA } };
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPOSITORY = 'Sieitzz/dgfy-platform';
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const parsed = new URL(url);
    let body;
    if (parsed.pathname.endsWith('/actions/runs/123')) {
      body = { head_sha: SHA, head_branch: 'ci/example', html_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/123' };
    } else if (parsed.pathname.endsWith('/actions/runs/123/jobs')) {
      body = { total_count: 1, jobs: [{ name: 'dgfy-api-quality', conclusion: 'success' }] };
    } else if (parsed.pathname.endsWith('/pulls')) {
      if (parsed.searchParams.get('page') === '1') {
        body = Array.from({ length: 100 }, (_, index) => ({ number: index + 1, head: { ref: `other-${index}`, sha: SHA } }));
      } else {
        body = [matchingPr];
      }
    } else if (parsed.pathname.endsWith('/issues/42/comments')) {
      body = { id: 1 };
    } else {
      throw new Error(`Unexpected request: ${url}`);
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };

  try {
    await assert.doesNotReject(main(['--run-id', '123']));
    const commentRequest = requests.find(({ url }) => url.endsWith('/issues/42/comments'));
    assert.ok(commentRequest, 'posts a comment to the matching pull request');
    const comment = JSON.parse(commentRequest.options.body).body;
    assert.match(comment, /\| dgfy-api-quality \| pass \|/);
    assert.match(comment, /Current PR head/);
    assert.deepEqual(
      requests.filter(({ url }) => new URL(url).pathname.endsWith('/pulls')).map(({ url }) => new URL(url).searchParams.get('page')),
      ['1', '2'],
    );
    assert.ok(requests.every(({ url }) => new URL(url).searchParams.get('per_page') === '100' || !url.includes('/pulls')));
  } finally {
    global.fetch = originalFetch;
    if (originalEnv.GITHUB_TOKEN === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
    if (originalEnv.GITHUB_REPOSITORY === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = originalEnv.GITHUB_REPOSITORY;
  }
});
