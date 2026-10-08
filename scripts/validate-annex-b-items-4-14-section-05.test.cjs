const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {
  DEFAULT_CATALOG_PATH,
  DEFAULT_CONTRACT_PATH,
  DEFAULT_SAMPLES_PATH,
  validateContract
} = require('./validate-annex-b-items-4-14-section-05.cjs');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

test('Section 05 evidence contract passes local readiness verification gates', () => {
  const result = validateContract(readJson(DEFAULT_CONTRACT_PATH), readJson(DEFAULT_SAMPLES_PATH), readJson(DEFAULT_CATALOG_PATH));
  assert.equal(result.status, 'PASS', JSON.stringify(result.errors));
  assert.equal(result.summary.phases, 2);
  assert.equal(result.summary.tests, 6);
  assert.equal(result.summary.external_review_required, true);
});

test('Section 05 validator rejects an external approval claim', () => {
  const contract = readJson(DEFAULT_CONTRACT_PATH);
  const samples = readJson(DEFAULT_SAMPLES_PATH);
  const catalog = readJson(DEFAULT_CATALOG_PATH);
  contract.scope.approval_claim = 'provider approved';
  const result = validateContract(contract, samples, catalog);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.errors.some((error) => error.includes('must not claim external approval')));
});

test('Section 05 validator rejects a changed source hash', () => {
  const contract = readJson(DEFAULT_CONTRACT_PATH);
  const samples = readJson(DEFAULT_SAMPLES_PATH);
  const catalog = readJson(DEFAULT_CATALOG_PATH);
  contract.source_register[0].sha256 = '0'.repeat(64);
  const result = validateContract(contract, samples, catalog);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.errors.some((error) => error.includes('REPORT-REGISTRY')));
});
