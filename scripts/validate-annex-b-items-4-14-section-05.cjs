#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONTRACT_PATH = path.resolve(__dirname, '..', 'docs/compliance/evidence/annex-b-items-4-14-section-05-evidence-contract-v1.json');
const DEFAULT_SAMPLES_PATH = path.resolve(__dirname, '..', 'docs/compliance/evidence/annex-b-items-4-14-section-05-report-sample-fixtures-v1.json');
const DEFAULT_CATALOG_PATH = path.resolve(__dirname, '..', 'docs/compliance/evidence/annex-b-items-4-14-section-05-report-catalog-v1.json');

const EXPECTED_PHASES = Object.freeze([357, 358]);
const EXPECTED_REQUIREMENTS = Object.freeze(['FR-404', 'FR-405', 'REP-401', 'REP-402', 'DATA-404', 'SEC-404', 'AUD-401']);
const EXPECTED_TESTS = Object.freeze(['TEST-450', 'TEST-451', 'TEST-452', 'TEST-453', 'TEST-454', 'TEST-455']);
const EXPECTED_ACCEPTANCE = Object.freeze(['AC-450', 'AC-451', 'AC-452', 'AC-453', 'AC-454']);
const EXPECTED_REGISTRY_KEYS = Object.freeze([
  'sales_trend', 'sales_by_terminal', 'sales_by_branch', 'sales_by_source', 'sales_by_employee', 'sales_by_item',
  'sales_and_stock_by_item', 'sales_by_category', 'sales_by_payment', 'discounts', 'fulfillment', 'shifts',
  'tax_and_fees', 'refunds_and_voids', 'customer_activity', 'inventory_valuation', 'inventory_movements', 'low_stock',
  'stock_aging', 'surplus_shortage', 'financial_summary', 'supplier_performance', 'expiry', 'stock_aging_enhanced',
  'production', 'po_analysis', 'executive_summary', 'compliance_package', 'saved_report_snapshots', 'terminal_daily',
  'terminal_monthly', 'terminal_yearly', 'terminal_comparison', 'terminal_profit_loss', 'terminal_attendance',
  'terminal_cashiers', 'terminal_registers', 'terminal_handoffs'
]);
const EXPECTED_CATEGORIES = Object.freeze([
  'sales_summary', 'statutory_and_commercial_discounts', 'refunds_voids_adjustments', 'tender', 'terminal_register',
  'x_z_readings', 'esales_and_books_boundary', 'inventory_when_relevant', 'audit_activity'
]);

const repoPath = (relativePath) => path.resolve(__dirname, '..', relativePath);
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const sha256File = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const arraysEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeRelativePath = (value) => typeof value === 'string'
  && value.trim()
  && !path.isAbsolute(value)
  && !value.includes('..')
  && !value.includes('\\');
const add = (errors, message) => errors.push(message);

function validateContract(contract, samples, catalog, { contractPath = DEFAULT_CONTRACT_PATH } = {}) {
  const errors = [];
  if (!isObject(contract)) return { status: 'BLOCKED', errors: ['Section 05 contract must be a JSON object.'] };
  if (contract.schema_version !== 'annex-b-items-4-14-section-05-evidence-v1') add(errors, 'schema_version is invalid.');
  if (contract.section !== '05_EJournal_Reports_and_Evidence_Exports') add(errors, 'section must identify the approved Section 05 plan.');
  if (contract.overall_status !== 'LOCAL_RUNTIME_VERIFIED_EXTERNAL_REVIEW_REQUIRED') add(errors, 'overall_status must preserve the external-review boundary.');

  const scope = contract.scope;
  if (!isObject(scope) || scope.environment !== 'local') add(errors, 'scope.environment must be local.');
  if (scope?.source_timezone !== 'Asia/Manila') add(errors, 'scope.source_timezone must be Asia/Manila.');
  if (scope?.external_review_status !== 'required_before_external_submission') add(errors, 'external_review_status must remain required before external submission.');
  if (scope?.approval_claim !== 'none') add(errors, 'The contract must not claim external approval.');

  const phases = Array.isArray(contract.phase_sequence) ? contract.phase_sequence : [];
  if (!arraysEqual(phases.map((entry) => entry?.phase), EXPECTED_PHASES)) add(errors, 'phase_sequence must continue with phases 357 and 358.');
  phases.forEach((entry) => {
    if (entry?.status !== 'VERIFIED' || entry?.runtime_status !== 'VERIFIED') add(errors, `phase ${entry?.phase || '<missing>'} must be runtime VERIFIED.`);
    if (!Array.isArray(entry?.evidence) || entry.evidence.length === 0) add(errors, `phase ${entry?.phase || '<missing>'} must list evidence IDs.`);
    if (!Array.isArray(entry?.implementation_paths) || entry.implementation_paths.length === 0) add(errors, `phase ${entry?.phase || '<missing>'} must list implementation paths.`);
  });

  const requirements = Array.isArray(contract.requirement_registry) ? contract.requirement_registry : [];
  if (!arraysEqual(requirements.map((entry) => entry?.id), EXPECTED_REQUIREMENTS)) add(errors, 'requirement_registry must contain the exact Section 05 requirement IDs in order.');
  requirements.forEach((entry) => {
    if (entry?.status !== 'VERIFIED' || entry?.runtime_status !== 'VERIFIED') add(errors, `requirement ${entry?.id || '<missing>'} must be runtime VERIFIED.`);
    if (!Array.isArray(entry?.paths) || entry.paths.length === 0) add(errors, `requirement ${entry?.id || '<missing>'} must list implementation paths.`);
    (entry?.paths || []).forEach((sourcePath) => {
      if (!safeRelativePath(sourcePath) || !fs.existsSync(repoPath(sourcePath))) add(errors, `requirement ${entry?.id || '<missing>'} references missing source path ${sourcePath}.`);
    });
  });

  const tests = Array.isArray(contract.test_registry) ? contract.test_registry : [];
  if (!arraysEqual(tests.map((entry) => entry?.id), EXPECTED_TESTS)) add(errors, 'test_registry must contain TEST-450 through TEST-455 in order.');
  tests.forEach((entry) => {
    if (entry?.status !== 'PASS') add(errors, `test ${entry?.id || '<missing>'} must be PASS.`);
    if (typeof entry?.command !== 'string' || !entry.command.trim()) add(errors, `test ${entry?.id || '<missing>'} must list its command.`);
  });

  const acceptance = Array.isArray(contract.acceptance_registry) ? contract.acceptance_registry : [];
  if (!arraysEqual(acceptance.map((entry) => entry?.id), EXPECTED_ACCEPTANCE)) add(errors, 'acceptance_registry must contain AC-450 through AC-454 in order.');
  acceptance.forEach((entry) => {
    if (!['PASS', 'PASS_WITH_EXTERNAL_REVIEW_REQUIRED'].includes(entry?.status)) add(errors, `acceptance ${entry?.id || '<missing>'} has an invalid status.`);
  });

  if (!isObject(samples) || samples.environment !== 'local') add(errors, 'report sample fixtures must be local-only.');
  if (samples?.approval_claim !== 'none') add(errors, 'report samples must not claim external approval.');
  if (!arraysEqual(samples.report_registry_keys, EXPECTED_REGISTRY_KEYS)) add(errors, 'report sample registry keys must match the canonical registry snapshot.');
  const sampleCategories = new Set((samples.report_samples || []).map((entry) => entry?.category));
  EXPECTED_CATEGORIES.forEach((category) => {
    if (!sampleCategories.has(category)) add(errors, `report samples must include category ${category}.`);
  });
  (samples.report_samples || []).forEach((entry) => {
    if (!entry?.report_key || !Array.isArray(entry?.formats) || !isObject(entry?.filters) || !Array.isArray(entry?.rows)) add(errors, `sample ${entry?.report_key || '<missing>'} must declare filters, formats, and rows.`);
  });

  if (!isObject(catalog) || catalog.environment !== 'local') add(errors, 'report catalog snapshot must be local-only.');
  if (catalog?.registry_report_count !== EXPECTED_REGISTRY_KEYS.length) add(errors, 'report catalog registry_report_count is invalid.');
  if (catalog?.catalog_row_count !== EXPECTED_REGISTRY_KEYS.length + 1) add(errors, 'report catalog must include the supplemental audit_activity row.');
  if (!arraysEqual(catalog?.report_keys, [...EXPECTED_REGISTRY_KEYS, 'audit_activity'])) add(errors, 'report catalog keys must match registry plus audit_activity.');

  const eJournal = contract.e_journal_contract;
  if (eJournal?.serializer_version !== 'EJOURNAL-READINESS-0.1') add(errors, 'e_journal_contract serializer version is invalid.');
  if (!arraysEqual(eJournal?.record_types, ['FILE', 'DOCUMENT', 'LINE', 'PAYMENT', 'ADJUSTMENT', 'READING', 'TRAILER'])) add(errors, 'e_journal_contract record types are invalid.');
  if (eJournal?.bounds?.max_source_rows_per_category !== 5000 || eJournal?.bounds?.max_business_date_range_days !== 1) add(errors, 'e_journal_contract bounds are invalid.');

  const sources = Array.isArray(contract.source_register) ? contract.source_register : [];
  if (sources.length < 10) add(errors, 'source_register must include the implementation and test surfaces.');
  sources.forEach((entry) => {
    if (!safeRelativePath(entry?.path) || !fs.existsSync(repoPath(entry.path))) {
      add(errors, `${entry?.id || '<missing source>'} references a missing or unsafe file.`);
      return;
    }
    if (!/^[0-9a-f]{64}$/.test(String(entry?.sha256 || ''))) add(errors, `${entry?.id || entry.path} must contain a lowercase SHA-256.`);
    else if (sha256File(repoPath(entry.path)) !== entry.sha256) add(errors, `${entry?.id || entry.path} SHA-256 does not match.`);
  });

  for (const documentRef of [scope?.plan_document, scope?.internal_grammar_contract]) {
    if (!safeRelativePath(documentRef?.path) || !fs.existsSync(repoPath(documentRef.path)) || sha256File(repoPath(documentRef.path)) !== documentRef.sha256) {
      add(errors, `document hash does not match for ${documentRef?.path || '<missing document>'}.`);
    }
  }

  const outputPaths = Array.isArray(contract.evidence_outputs) ? contract.evidence_outputs : [];
  outputPaths.forEach((outputPath) => {
    if (!safeRelativePath(outputPath) || !fs.existsSync(repoPath(outputPath))) add(errors, `evidence output is missing: ${outputPath}.`);
  });

  const serializedContract = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8').toLowerCase() : '';
  ['bir approved', 'bir-approved', 'approved by bir', 'provider approved'].forEach((claim) => {
    if (serializedContract.includes(claim)) add(errors, `contract contains a forbidden external approval claim: ${claim}.`);
  });

  return {
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    errors,
    summary: {
      phases: phases.length,
      requirements: requirements.length,
      report_samples: samples?.report_samples?.length || 0,
      catalog_rows: catalog?.catalog_row_count || 0,
      tests: tests.length,
      acceptance_gates: acceptance.length,
      external_review_required: true
    }
  };
}

function main() {
  const result = validateContract(readJson(DEFAULT_CONTRACT_PATH), readJson(DEFAULT_SAMPLES_PATH), readJson(DEFAULT_CATALOG_PATH));
  console.log(JSON.stringify({ file: DEFAULT_CONTRACT_PATH, ...result }, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  DEFAULT_CONTRACT_PATH,
  DEFAULT_SAMPLES_PATH,
  DEFAULT_CATALOG_PATH,
  validateContract
};
