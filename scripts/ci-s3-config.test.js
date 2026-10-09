const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_CASES = [
  {
    name: 'uploader',
    script: path.join(ROOT, 'scripts', 'ci-s3-upload.sh'),
    args: ['/tmp/ci-s3-evidence-that-does-not-exist', 'test-artifact'],
  },
  {
    name: 'lifecycle manager',
    script: path.join(ROOT, 'scripts', 'ci-s3-set-artifact-lifecycle.sh'),
    args: [],
  },
];

function runScript(script, args, endpoint) {
  const env = { ...process.env };
  env.ARTIFACT_S3_ACCESS_KEY_ID = 'test-access-key-id';
  env.ARTIFACT_S3_BUCKET = 'artifacts';
  env.AWS_SECRET_ACCESS_KEY = 'test-secret-access-key';
  env.GITHUB_OUTPUT = '/dev/null';
  env.RUNNER_TEMP = os.tmpdir();
  delete env.ARTIFACT_S3_ENDPOINT;
  if (endpoint !== undefined) env.ARTIFACT_S3_ENDPOINT = endpoint;
  return spawnSync('bash', [script, ...args], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });
}

for (const scriptCase of SCRIPT_CASES) {
  test(`${scriptCase.name} rejects missing endpoint configuration`, () => {
    const result = runScript(scriptCase.script, scriptCase.args);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /S3 endpoint setting is unavailable/);
  });

  test(`${scriptCase.name} rejects malformed or credential-bearing endpoints without echoing them`, () => {
    const endpoint = 'https://user:secret@s3.patteruel.dev/?token=do-not-print';
    const result = runScript(scriptCase.script, scriptCase.args, endpoint);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /valid HTTPS URL without credentials, query tokens, or a fragment/);
    assert.ok(!output.includes('secret'));
    assert.ok(!output.includes('do-not-print'));
  });
}

test('endpoint validator accepts the configured HTTPS S3 endpoint', () => {
  const result = runScript(SCRIPT_CASES[0].script, SCRIPT_CASES[0].args, 'https://s3.patteruel.dev');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /evidence file is missing/i);
});

test('endpoint validator rejects a bare hostname and non-HTTPS URL', () => {
  for (const endpoint of ['s3.patteruel.dev', 'http://s3.patteruel.dev']) {
    const result = runScript(SCRIPT_CASES[0].script, SCRIPT_CASES[0].args, endpoint);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /valid HTTPS URL/);
    assert.ok(!result.stderr.includes(endpoint));
  }
});
