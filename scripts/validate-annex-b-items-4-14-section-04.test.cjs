const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const {
  DEFAULT_CONTRACT_PATH,
  DEFAULT_FIXTURE_PATH,
  validateContract
} = require('./validate-annex-b-items-4-14-section-04.cjs');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

test('Section 04 evidence contract passes its local-only verification gates', () => {
  const result = validateContract(readJson(DEFAULT_CONTRACT_PATH), readJson(DEFAULT_FIXTURE_PATH));
  assert.equal(result.status, 'PASS', JSON.stringify(result.errors));
  assert.equal(result.summary.phases, 3);
  assert.equal(result.summary.tests, 5);
  assert.equal(result.summary.external_review_required, true);
});

test('Section 04 validator rejects an unsupported athlete fixture claim', () => {
  const contract = readJson(DEFAULT_CONTRACT_PATH);
  const fixtureManifest = readJson(DEFAULT_FIXTURE_PATH);
  const athlete = contract.receipt_fixture_registry.find((entry) => entry.id === 'R4-ATHLETE');
  athlete.runtime_status = 'VERIFIED';
  const result = validateContract(contract, fixtureManifest);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.errors.some((error) => error.includes('R4-ATHLETE')));
});

test('Section 04 validator rejects a changed implementation hash', () => {
  const contract = readJson(DEFAULT_CONTRACT_PATH);
  const fixtureManifest = readJson(DEFAULT_FIXTURE_PATH);
  contract.source_register[0].sha256 = '0'.repeat(64);
  const result = validateContract(contract, fixtureManifest);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.errors.some((error) => error.includes('FISCAL-EVIDENCE-CONTRACT')));
});
