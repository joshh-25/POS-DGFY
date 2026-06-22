const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPlaceholderQaToken,
  runPreflight,
} = require('./check-no-staging-prereqs');

function baseEnv(overrides = {}) {
  return {
    DEPLOY_ENFORCE_NO_STAGING_GATE: '1',
    RELEASE_TARGET_SHA: '9c03af78bfe2847031cfa383896b9b92e08ef6f7',
    QA_BASE_URL: 'https://skupervisor.dgfy.ph',
    QA_COMPANY_TOKEN: 'real-company-token',
    QA_SSH_HOST: '192.0.2.10',
    QA_SSH_PORT: '64428',
    ...overrides,
  };
}

test('detects placeholder QA company tokens', () => {
  assert.equal(isPlaceholderQaToken('token-original'), true);
  assert.equal(isPlaceholderQaToken('<qa-company-token>'), true);
  assert.equal(isPlaceholderQaToken('changeme'), true);
  assert.equal(isPlaceholderQaToken('real-company-token'), false);
});

test('preflight fails when QA company token is missing or placeholder', () => {
  const result = runPreflight(baseEnv({ QA_COMPANY_TOKEN: 'token-original' }), {
    skipRuntimeCommands: true,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.failed.some((check) => check.name === 'qa.company_token.configured'),
    true
  );
});

test('preflight validates non-default QA SSH port format', () => {
  const result = runPreflight(baseEnv({ QA_SSH_PORT: '64428x' }), {
    skipRuntimeCommands: true,
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.failed.some((check) => check.name === 'qa.ssh_port.valid'),
    true
  );
});

test('preflight passes configured QA inputs without runtime command probing', () => {
  const result = runPreflight(baseEnv(), {
    skipRuntimeCommands: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.failed.length, 0);
});
