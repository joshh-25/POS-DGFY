const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { decideStorage, inspectSource, record } = require('./ci-evidence-storage-decision');

test('GitHub artifact success is primary and marks S3 as unused', () => {
  assert.deepEqual(decideStorage({
    sourceStatus: 'ready',
    githubOutcome: 'success',
    githubArtifactId: '123',
    githubArtifactDigest: 'sha256:abc',
    s3Outcome: 'skipped',
    s3Status: '',
  }), { storage_status: 'github', backend: 'github' });
});

test('GitHub failure plus verified S3 success selects the fallback', () => {
  assert.deepEqual(decideStorage({
    sourceStatus: 'ready',
    githubOutcome: 'failure',
    githubArtifactId: '',
    githubArtifactDigest: '',
    s3Outcome: 'success',
    s3Status: 'verified',
  }), { storage_status: 's3-fallback', backend: 's3' });
});

test('failure of both backends produces a failed storage result', () => {
  assert.deepEqual(decideStorage({
    sourceStatus: 'ready',
    githubOutcome: 'failure',
    githubArtifactId: '',
    githubArtifactDigest: '',
    s3Outcome: 'failure',
    s3Status: '',
  }), { storage_status: 'failed', backend: 'none' });
});

test('missing or empty source remains a warning state and is not classified as storage failure', async () => {
  assert.deepEqual(await inspectSource(path.join(os.tmpdir(), `no-evidence-${process.pid}-${Date.now()}`)), {
    source_status: 'missing',
    size_bytes: '',
    source_sha256: '',
  });
  assert.deepEqual(decideStorage({ sourceStatus: 'missing', githubOutcome: '', s3Outcome: '' }), {
    storage_status: 'missing', backend: 'missing',
  });
  const emptyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-evidence-'));
  try {
    assert.deepEqual(await inspectSource(emptyDirectory), {
      source_status: 'missing', size_bytes: '', source_sha256: '',
    });
  } finally {
    fs.rmSync(emptyDirectory, { recursive: true, force: true });
  }
});

test('GitHub-path summary omits S3 credentials and presigned retrieval URLs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-evidence-decision-'));
  const previous = {};
  const keys = {
    GITHUB_OUTPUT: path.join(directory, 'output.txt'),
    GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'),
    SOURCE_STATUS: 'ready',
    SOURCE_SIZE_BYTES: '5',
    SOURCE_SHA256: 'source-sha',
    SOURCE_COMMIT_SHA: 'commit-sha',
    GITHUB_RUN_ID: '42',
    GITHUB_RUN_ATTEMPT: '2',
    ARTIFACT_NAME: 'evidence',
    GITHUB_ARTIFACT_NAME: 'evidence-attempt-2',
    RETENTION_DAYS: '30',
    GITHUB_OUTCOME: 'success',
    GITHUB_ARTIFACT_ID: '123',
    GITHUB_ARTIFACT_URL: 'https://example.invalid/artifact/123',
    GITHUB_ARTIFACT_DIGEST: 'sha256:artifact-digest',
    S3_OUTCOME: 'skipped',
    S3_PRESIGNED_URL: 'https://s3.invalid/?secret=presigned-token',
    AWS_SECRET_ACCESS_KEY: 'must-not-appear',
  };

  for (const [key, value] of Object.entries(keys)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    const result = record();
    const summary = fs.readFileSync(keys.GITHUB_STEP_SUMMARY, 'utf8');
    assert.equal(result.storage_status, 'github');
    assert.match(summary, /gh run download 42 -n evidence-attempt-2/);
    assert.doesNotMatch(summary, /presigned-token|must-not-appear/);
  } finally {
    for (const key of Object.keys(keys)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('S3 fallback summary records both outcomes and a verified retrieval location', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-evidence-fallback-'));
  const previous = {};
  const values = {
    GITHUB_OUTPUT: path.join(directory, 'output.txt'),
    GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'),
    SOURCE_STATUS: 'ready', SOURCE_SIZE_BYTES: '10', SOURCE_SHA256: 'source-sha',
    SOURCE_COMMIT_SHA: 'commit-sha', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '3',
    ARTIFACT_NAME: 'evidence', GITHUB_ARTIFACT_NAME: 'evidence-attempt-3', RETENTION_DAYS: '30',
    GITHUB_OUTCOME: 'failure', GITHUB_ARTIFACT_ID: '', GITHUB_ARTIFACT_DIGEST: '',
    S3_OUTCOME: 'success', S3_STATUS: 'verified', S3_URI: 's3://private/evidence.json',
    S3_SIZE_BYTES: '18', S3_SOURCE_SHA256: 's3-sha', S3_DIRECT_SHA256: 's3-sha',
    S3_PRESIGNED_SHA256: 's3-sha', S3_PRESIGNED_HTTP_STATUS: '200',
    S3_PRESIGNED_URL: 'https://s3.invalid/?token=verified-bearer',
  };
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    assert.equal(record().storage_status, 's3-fallback');
    const summary = fs.readFileSync(values.GITHUB_STEP_SUMMARY, 'utf8');
    assert.match(summary, /GitHub Artifacts .*failure/);
    assert.match(summary, /S3 fallback: success \(verified\)/);
    assert.match(summary, /s3:\/\/private\/evidence\.json/);
    assert.match(summary, /verified-bearer/);
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('double failure summary names both backend outcomes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-evidence-double-failure-'));
  const previous = {};
  const values = {
    GITHUB_OUTPUT: path.join(directory, 'output.txt'),
    GITHUB_STEP_SUMMARY: path.join(directory, 'summary.md'),
    SOURCE_STATUS: 'ready', SOURCE_SIZE_BYTES: '10', SOURCE_SHA256: 'source-sha',
    SOURCE_COMMIT_SHA: 'commit-sha', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '3',
    ARTIFACT_NAME: 'evidence', GITHUB_ARTIFACT_NAME: 'evidence-attempt-3', RETENTION_DAYS: '30',
    GITHUB_OUTCOME: 'failure', S3_OUTCOME: 'failure', S3_STATUS: '',
    S3_FAILURE_REASON: 'S3 service error SignatureDoesNotMatch',
    S3_PRESIGNED_URL: 'https://s3.invalid/?secret=presigned-token',
    AWS_SECRET_ACCESS_KEY: 'must-not-appear',
  };
  const annotations = [];
  const originalConsoleLog = console.log;
  console.log = (...args) => annotations.push(args.join(' '));
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    assert.equal(record().storage_status, 'failed');
    const summary = fs.readFileSync(values.GITHUB_STEP_SUMMARY, 'utf8');
    assert.match(summary, /S3 fallback: failure \(SignatureDoesNotMatch\)/);
    assert.match(summary, /GitHub=failure; S3=failure \(SignatureDoesNotMatch\)/);
    assert.match(summary, /No retrieval location is available/);
    assert.match(annotations[0], /S3 fallback failure reason: SignatureDoesNotMatch/);
    assert.doesNotMatch(`${summary}\n${annotations.join('\n')}`, /must-not-appear|presigned-token|https:\/\/s3\.invalid/);

    fs.writeFileSync(values.GITHUB_STEP_SUMMARY, '');
    values.S3_FAILURE_REASON = '';
    process.env.S3_FAILURE_REASON = '';
    annotations.length = 0;
    record();
    const summaryWithoutReason = fs.readFileSync(values.GITHUB_STEP_SUMMARY, 'utf8');
    assert.match(summaryWithoutReason, /S3 fallback: failure\./);
    assert.match(summaryWithoutReason, /GitHub=failure; S3=failure \(no verified result\)/);
    assert.equal(annotations[0], '::error::Evidence storage failed: GitHub Artifacts and S3 fallback did not store the evidence.');
  } finally {
    console.log = originalConsoleLog;
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
