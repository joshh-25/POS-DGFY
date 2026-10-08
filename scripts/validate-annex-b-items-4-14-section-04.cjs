#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_CONTRACT_PATH = path.resolve(
  __dirname,
  '..',
  'docs/compliance/evidence/annex-b-items-4-14-section-04-evidence-contract-v1.json'
);
const DEFAULT_FIXTURE_PATH = path.resolve(
  __dirname,
  '..',
  'docs/compliance/evidence/annex-b-items-4-14-section-04-fixture-manifest-v1.json'
);

const EXPECTED_FIXTURE_IDS = Object.freeze([
  'R4-REGULAR',
  'R4-SENIOR',
  'R4-PWD',
  'R4-ATHLETE',
  'R4-SOLO',
  'R4-CHARGES',
  'R4-NONFISCAL'
]);
const EXPECTED_REQUIREMENT_IDS = Object.freeze(['FR-401', 'FR-402', 'FR-403', 'BR-402', 'DATA-402', 'SEC-402', 'UI-401']);
const EXPECTED_TEST_IDS = Object.freeze(['TEST-440', 'TEST-441', 'TEST-442', 'TEST-443', 'TEST-444']);
const EXPECTED_ACCEPTANCE_IDS = Object.freeze(['AC-440', 'AC-441', 'AC-442', 'AC-443', 'AC-444']);
const EXPECTED_PHASES = Object.freeze([354, 355, 356]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arraysEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function repoPath(relativePath) {
  return path.resolve(__dirname, '..', relativePath);
}

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.trim()
    && !path.isAbsolute(value)
    && !value.includes('..')
    && !value.includes('\\');
}

function addError(errors, message) {
  errors.push(message);
}

function validateContract(contract, fixtureManifest, { contractPath = DEFAULT_CONTRACT_PATH } = {}) {
  const errors = [];
  if (!isObject(contract)) return { status: 'BLOCKED', errors: ['Section 04 contract must be a JSON object.'] };
  if (contract.schema_version !== 'annex-b-items-4-14-section-04-evidence-v1') {
    addError(errors, 'schema_version must be annex-b-items-4-14-section-04-evidence-v1.');
  }
  if (contract.section !== '04_Fiscal_Documents_Adjustments_and_Readings') addError(errors, 'section must identify the approved Section 04 plan.');

  const scope = contract.scope;
  if (!isObject(scope) || scope.environment !== 'local') addError(errors, 'scope.environment must be local.');
  if (scope?.source_timezone !== 'Asia/Manila') addError(errors, 'scope.source_timezone must be Asia/Manila.');
  if (scope?.external_review_status !== 'required_before_external_submission') addError(errors, 'external_review_status must remain required before external submission.');
  if (scope?.approval_claim !== 'none') addError(errors, 'The contract must not claim external approval.');
  if (contract.overall_status !== 'LOCAL_RUNTIME_VERIFIED_EXTERNAL_REVIEW_REQUIRED') addError(errors, 'overall_status must preserve the external-review boundary.');

  const phases = Array.isArray(contract.phase_sequence) ? contract.phase_sequence : [];
  if (!arraysEqual(phases.map((entry) => entry?.phase), EXPECTED_PHASES)) addError(errors, 'phase_sequence must continue with phases 354, 355, and 356.');
  phases.forEach((entry) => {
    if (entry?.status !== 'VERIFIED' || entry?.runtime_status !== 'VERIFIED') addError(errors, `phase ${entry?.phase || '<missing>'} must be runtime VERIFIED.`);
    if (!Array.isArray(entry?.evidence) || entry.evidence.length === 0) addError(errors, `phase ${entry?.phase || '<missing>'} must list evidence IDs.`);
  });

  const requirements = Array.isArray(contract.requirement_registry) ? contract.requirement_registry : [];
  if (!arraysEqual(requirements.map((entry) => entry?.id), EXPECTED_REQUIREMENT_IDS)) addError(errors, 'requirement_registry must contain the exact Section 04 requirement IDs in order.');
  requirements.forEach((entry) => {
    if (entry?.status !== 'VERIFIED' || entry?.runtime_status !== 'VERIFIED') addError(errors, `requirement ${entry?.id || '<missing>'} must be runtime VERIFIED.`);
    if (!Array.isArray(entry?.paths) || entry.paths.length === 0) addError(errors, `requirement ${entry?.id || '<missing>'} must list implementation paths.`);
    (entry?.paths || []).forEach((sourcePath) => {
      if (!safeRelativePath(sourcePath) || !fs.existsSync(repoPath(sourcePath))) addError(errors, `requirement ${entry?.id || '<missing>'} references a missing source path ${sourcePath}.`);
    });
  });

  const fixtures = Array.isArray(contract.receipt_fixture_registry) ? contract.receipt_fixture_registry : [];
  if (!arraysEqual(fixtures.map((entry) => entry?.id), EXPECTED_FIXTURE_IDS)) addError(errors, 'receipt_fixture_registry must contain the exact R4 fixture IDs in order.');
  const fixtureStatuses = new Map(fixtures.map((entry) => [entry?.id, entry?.runtime_status]));
  if (fixtureStatuses.get('R4-ATHLETE') !== 'REVIEW_REQUIRED') addError(errors, 'R4-ATHLETE must remain REVIEW_REQUIRED without an authoritative policy fixture.');
  if (fixtureStatuses.get('R4-SOLO') !== 'REVIEW_REQUIRED') addError(errors, 'R4-SOLO must remain REVIEW_REQUIRED without an authoritative policy fixture.');
  if (fixtureStatuses.get('R4-REGULAR') !== 'VERIFIED' || fixtureStatuses.get('R4-NONFISCAL') !== 'VERIFIED') addError(errors, 'Regular and non-fiscal fixtures must be runtime VERIFIED.');

  const tests = Array.isArray(contract.test_registry) ? contract.test_registry : [];
  if (!arraysEqual(tests.map((entry) => entry?.id), EXPECTED_TEST_IDS)) addError(errors, 'test_registry must contain TEST-440 through TEST-444 in order.');
  tests.forEach((entry) => {
    if (entry?.status !== 'PASS') addError(errors, `test ${entry?.id || '<missing>'} must be PASS.`);
    if (typeof entry?.command !== 'string' || !entry.command.trim()) addError(errors, `test ${entry?.id || '<missing>'} must list its command.`);
  });

  const acceptance = Array.isArray(contract.acceptance_registry) ? contract.acceptance_registry : [];
  if (!arraysEqual(acceptance.map((entry) => entry?.id), EXPECTED_ACCEPTANCE_IDS)) addError(errors, 'acceptance_registry must contain AC-440 through AC-444 in order.');
  acceptance.forEach((entry) => {
    if (!['PASS', 'PASS_WITH_EXTERNAL_REVIEW_REQUIRED'].includes(entry?.status)) addError(errors, `acceptance ${entry?.id || '<missing>'} has an invalid status.`);
  });

  if (!isObject(fixtureManifest) || fixtureManifest.environment !== 'local') addError(errors, 'fixture manifest must be local-only.');
  const manifestFixtures = Array.isArray(fixtureManifest?.receipt_fixtures) ? fixtureManifest.receipt_fixtures : [];
  if (!arraysEqual(manifestFixtures.map((entry) => entry?.id), EXPECTED_FIXTURE_IDS)) addError(errors, 'fixture manifest must contain the exact R4 fixture IDs in order.');
  if (fixtureManifest?.renderer?.source_projection !== 'server_owned_snapshot') addError(errors, 'fixture manifest must use the server-owned snapshot projection.');

  const sources = Array.isArray(contract.source_register) ? contract.source_register : [];
  if (sources.length < 10) addError(errors, 'source_register must include the Section 04 implementation surfaces.');
  sources.forEach((entry) => {
    const label = entry?.id || '<missing source>';
    if (!safeRelativePath(entry?.path)) {
      addError(errors, `${label} has an unsafe source path.`);
      return;
    }
    const absolutePath = repoPath(entry.path);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      addError(errors, `${label} references missing file ${entry.path}.`);
      return;
    }
    if (!/^[0-9a-f]{64}$/.test(String(entry?.sha256 || ''))) addError(errors, `${label} must contain a lowercase SHA-256.`);
    else if (sha256File(absolutePath) !== entry.sha256) addError(errors, `${label} SHA-256 does not match ${entry.path}.`);
  });

  const planPath = repoPath(scope?.plan_document?.path || '');
  if (!fs.existsSync(planPath) || sha256File(planPath) !== scope?.plan_document?.sha256) addError(errors, 'The approved Section 04 plan hash does not match.');
  const returnContractPath = repoPath(scope?.return_semantics_contract?.path || '');
  if (!fs.existsSync(returnContractPath) || sha256File(returnContractPath) !== scope?.return_semantics_contract?.sha256) addError(errors, 'The return semantics contract hash does not match.');

  const outputs = Array.isArray(contract.evidence_outputs) ? contract.evidence_outputs : [];
  outputs.forEach((outputPath) => {
    if (!safeRelativePath(outputPath) || !fs.existsSync(repoPath(outputPath))) addError(errors, `evidence output is missing: ${outputPath}.`);
  });

  const serializedContract = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8').toLowerCase() : '';
  const forbiddenClaims = ['bir approved', 'bir-approved', 'approved by bir', 'provider approved'];
  forbiddenClaims.forEach((claim) => {
    if (serializedContract.includes(claim)) addError(errors, `contract contains a forbidden external approval claim: ${claim}.`);
  });

  return {
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    errors,
    summary: {
      phases: phases.length,
      requirements: requirements.length,
      receipt_fixtures: fixtures.length,
      tests: tests.length,
      acceptance_gates: acceptance.length,
      external_review_required: true
    }
  };
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const contract = loadJson(DEFAULT_CONTRACT_PATH);
  const fixtureManifest = loadJson(DEFAULT_FIXTURE_PATH);
  const result = validateContract(contract, fixtureManifest);
  console.log(JSON.stringify({ file: DEFAULT_CONTRACT_PATH, ...result }, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  DEFAULT_CONTRACT_PATH,
  DEFAULT_FIXTURE_PATH,
  validateContract
};
