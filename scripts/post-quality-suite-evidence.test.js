const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseArgs, resultForJob, buildComment, main } = require('./post-quality-suite-evidence');

const SHA = 'a'.repeat(40);
const RUN = {
  head_sha: SHA,
  head_branch: 'ci/example',
  html_url: 'https://github.com/Sieitzz/dgfy-platform/actions/runs/123',
  created_at: '2026-10-25T12:00:00Z',
};

async function withEnvironment(values, callback) {
  const previous = new Map(Object.keys(values).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function apiResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, text: async () => JSON.stringify(body) };
}

function installGitHubMock({ jobs = [{ name: 'dgfy-api-quality', conclusion: 'failure' }], pulls = [], commentFailure = false } = {}) {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/actions/runs/123')) return apiResponse(RUN);
    if (parsed.pathname.endsWith('/actions/runs/123/jobs')) return apiResponse({ total_count: jobs.length, jobs });
    if (parsed.pathname.endsWith('/pulls')) return apiResponse(pulls);
    if (parsed.pathname.endsWith('/issues/42/comments')) {
      if (commentFailure) return apiResponse({ message: 'comment failed' }, { ok: false, status: 500 });
      return apiResponse({ id: 1 });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { requests, restore: () => { global.fetch = originalFetch; } };
}

function stagingCandidate(candidateId) {
  const candidateSha = 'c'.repeat(40);
  return {
    schema: 'sku-release-candidate/v3',
    candidate_id: candidateId,
    status: 'staging_soak',
    source_develop_sha: candidateSha,
    current_staging_sha: candidateSha,
    staging_head_sha: candidateSha,
    revisions: [{
      kind: 'initial',
      sha: candidateSha,
      parent_sha: null,
      branch: `to-staging/${candidateId}`,
      pr: 100,
      apps_touched: ['dgfy-pos'],
    }],
    release_revision: null,
  };
}

function availableCandidateId(candidatesDirectory) {
  const date = new Date().toISOString().slice(0, 10);
  for (let sequence = 1; sequence <= 99; sequence += 1) {
    const candidateId = `${date}-${String(sequence).padStart(2, '0')}`;
    if (!fs.existsSync(path.join(candidatesDirectory, `${candidateId}.json`))) return candidateId;
  }
  throw new Error(`No available candidate ID for test date ${date}`);
}

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
    jobs: [
      { name: 'dgfy-api-quality', conclusion: 'success' },
      { name: 'frontend-pos-quality', conclusion: 'skipped' },
    ],
    pr: { head: { sha: SHA } },
    failuresByJob: { 'dgfy-api-quality': 'Run API lint,cancelled step' },
  });

  assert.match(comment, /Overall:\*\* 12 job\(s\) reported advisory failures/);
  assert.match(comment, /advisory failures: Run API lint,cancelled step/);
  assert.match(comment, /frontend-pos-quality \| advisory: skipped/);
  assert.match(comment, /frontend-admin-quality \| advisory: unavailable/);
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
    GITHUB_STEP_SUMMARY: process.env.GITHUB_STEP_SUMMARY,
    DGFY_API_FAILURES: process.env.DGFY_API_FAILURES,
  };
  const requests = [];
  const matchingPr = { number: 42, head: { ref: 'ci/example', sha: SHA } };
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPOSITORY = 'Sieitzz/dgfy-platform';
  delete process.env.GITHUB_STEP_SUMMARY;
  delete process.env.DGFY_API_FAILURES;
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
    if (originalEnv.GITHUB_STEP_SUMMARY === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = originalEnv.GITHUB_STEP_SUMMARY;
    if (originalEnv.DGFY_API_FAILURES === undefined) delete process.env.DGFY_API_FAILURES;
    else process.env.DGFY_API_FAILURES = originalEnv.DGFY_API_FAILURES;
  }
});

test('main appends SHA-bound advisory evidence when no open PR matches and does not post a comment', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-evidence-no-pr-'));
  const summaryPath = path.join(tempDirectory, 'summary.md');
  const existingSummary = '# Existing workflow summary\n';
  fs.writeFileSync(summaryPath, existingSummary);
  const github = installGitHubMock();

  try {
    await withEnvironment({
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'Sieitzz/dgfy-platform',
      GITHUB_STEP_SUMMARY: summaryPath,
      DGFY_API_FAILURES: 'run_backend_matrix',
    }, () => main(['--run-id', '123']));

    const summary = fs.readFileSync(summaryPath, 'utf8');
    assert.ok(summary.startsWith(existingSummary));
    assert.match(summary, new RegExp(`Commit: ${SHA}`));
    assert.match(summary, /Branch: ci\/example/);
    assert.match(summary, /Freshness: No open PR matched the dispatched branch/);
    assert.match(summary, /https:\/\/github\.com\/Sieitzz\/dgfy-platform\/actions\/runs\/123/);
    assert.match(summary, /advisory failures: run_backend_matrix/);
    assert.equal(github.requests.filter(({ url, options }) => url.endsWith('/issues/42/comments') && options.method === 'POST').length, 0);
  } finally {
    github.restore();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('main appends the same report to summary and comment with resolved stale-PR freshness', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-evidence-pr-'));
  const summaryPath = path.join(tempDirectory, 'summary.md');
  const existingSummary = 'Previous step evidence\n';
  fs.writeFileSync(summaryPath, existingSummary);
  const newerPrHead = 'b'.repeat(40);
  const matchingPr = { number: 42, head: { ref: RUN.head_branch, sha: newerPrHead } };
  const github = installGitHubMock({ pulls: [matchingPr], jobs: [{ name: 'dgfy-api-quality', conclusion: 'success' }] });

  try {
    await withEnvironment({
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'Sieitzz/dgfy-platform',
      GITHUB_STEP_SUMMARY: summaryPath,
      DGFY_API_FAILURES: 'Run API lint,cancelled step',
    }, () => main(['--run-id', '123']));

    const summary = fs.readFileSync(summaryPath, 'utf8');
    const commentRequest = github.requests.find(({ url, options }) => url.endsWith('/issues/42/comments') && options.method === 'POST');
    assert.ok(commentRequest, 'posts evidence to the matching PR');
    const comment = JSON.parse(commentRequest.options.body).body;
    assert.ok(summary.startsWith(existingSummary));
    assert.equal(summary.slice(existingSummary.length), `${comment}\n`);
    assert.match(summary, new RegExp(`Freshness: Stale: PR head is ${newerPrHead}`));
    assert.match(summary, /advisory failures: Run API lint,cancelled step/);
  } finally {
    github.restore();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test('main keeps local behavior when GITHUB_STEP_SUMMARY is unset', async () => {
  const github = installGitHubMock({ pulls: [] });
  try {
    await withEnvironment({
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'Sieitzz/dgfy-platform',
      GITHUB_STEP_SUMMARY: undefined,
    }, () => main(['--run-id', '123']));
    assert.equal(github.requests.filter(({ url }) => url.endsWith('/issues/42/comments')).length, 0);
  } finally {
    github.restore();
  }
});

test('summary append failure is diagnosed while PR posting and candidate recording continue', async () => {
  const summaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-evidence-summary-error-'));
  const candidatesDirectory = path.join(__dirname, '../.tmp/release-candidates');
  const candidateId = availableCandidateId(candidatesDirectory);
  const candidatePath = path.join(candidatesDirectory, `${candidateId}.json`);
  fs.mkdirSync(candidatesDirectory, { recursive: true });
  fs.writeFileSync(candidatePath, `${JSON.stringify(stagingCandidate(candidateId), null, 2)}\n`);
  const github = installGitHubMock({ pulls: [{ number: 42, head: { ref: RUN.head_branch, sha: SHA } }] });
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));

  try {
    await withEnvironment({
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'Sieitzz/dgfy-platform',
      GITHUB_STEP_SUMMARY: summaryDirectory,
      DGFY_API_FAILURES: 'run_backend_matrix',
    }, () => main(['--run-id', '123', '--candidate', candidateId]));

    assert.match(errors.join('\n'), /could not append evidence to GITHUB_STEP_SUMMARY/);
    assert.ok(github.requests.some(({ url, options }) => url.endsWith('/issues/42/comments') && options.method === 'POST'));
    const manifest = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    assert.equal(manifest.quality_check.run_id, 123);
    assert.equal(manifest.quality_check.result, 'had-advisory-failures');
  } finally {
    console.error = originalError;
    github.restore();
    fs.rmSync(candidatePath, { force: true });
    fs.rmSync(summaryDirectory, { recursive: true, force: true });
  }
});

test('comment posting failure propagates after the run summary has been appended', async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-evidence-comment-error-'));
  const summaryPath = path.join(tempDirectory, 'summary.md');
  const github = installGitHubMock({
    pulls: [{ number: 42, head: { ref: RUN.head_branch, sha: SHA } }],
    commentFailure: true,
  });

  try {
    await withEnvironment({
      GITHUB_TOKEN: 'test-token',
      GITHUB_REPOSITORY: 'Sieitzz/dgfy-platform',
      GITHUB_STEP_SUMMARY: summaryPath,
    }, async () => {
      await assert.rejects(main(['--run-id', '123']), /GitHub API 500 for \/issues\/42\/comments:.*comment failed/);
    });

    const summary = fs.readFileSync(summaryPath, 'utf8');
    assert.match(summary, new RegExp(`Commit: ${SHA}`));
    assert.match(summary, /Freshness: Current PR head/);
  } finally {
    github.restore();
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
