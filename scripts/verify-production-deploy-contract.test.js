const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractRuntimeSha,
  parseArgs,
  parseSummary,
  shaMatches,
} = require('./verify-production-deploy-contract');

test('parses deployment summary key-value content', () => {
  const summary = parseSummary([
    'deployed_head=abc123',
    'remote_head=abc123',
    'expected_commit=abc123',
  ].join('\n'));

  assert.equal(summary.deployed_head, 'abc123');
  assert.equal(summary.remote_head, 'abc123');
  assert.equal(summary.expected_commit, 'abc123');
});

test('extracts runtime sha from health payload observability contract', () => {
  assert.equal(
    extractRuntimeSha({
      services: {
        observability: {
          runtime_sha: '79732410086e5d095abf62c20dca5f0cc5b4f905',
        },
      },
    }),
    '79732410086e5d095abf62c20dca5f0cc5b4f905'
  );
});

test('matches full or abbreviated sha values', () => {
  assert.equal(shaMatches('79732410086e5d095abf62c20dca5f0cc5b4f905', '79732410086e'), true);
  assert.equal(shaMatches('79732410086e', '79732410086e5d095abf62c20dca5f0cc5b4f905'), true);
  assert.equal(shaMatches('aaaaaaaaaaaa', 'bbbbbbbbbbbb'), false);
});

test('parses health urls and report options', () => {
  const options = parseArgs([
    '--target-sha',
    'abc123',
    '--health-url',
    'http://127.0.0.1:5000/health',
    '--report',
    '.tmp/production.json',
  ]);

  assert.equal(options.targetSha, 'abc123');
  assert.deepEqual(options.healthUrls, ['http://127.0.0.1:5000/health']);
  assert.equal(options.reportPath, '.tmp/production.json');
});
