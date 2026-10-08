const assert = require('node:assert/strict');
const test = require('node:test');

const {
  computeSummary,
  loadArchitecture,
  validateArchitecture,
} = require('./validate-annex-b-items-4-14-architecture.cjs');

function cloneContract() {
  return JSON.parse(JSON.stringify(loadArchitecture()));
}

test('the Section 03 architecture contract is locally valid', () => {
  const contract = loadArchitecture();
  const result = validateArchitecture(contract);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(result.summary, {
    total_requirements: 6,
    implemented_count: 6,
    deferred_runtime_count: 6,
    failed_or_blocked_count: 0,
    contract_complete: true,
    runtime_complete: false,
  });
  assert.equal(contract.plan.execution_mode, 'LOCAL_ONLY');
  assert.equal(contract.plan.external_approval_claim, 'NOT_CLAIMED');
});

test('the contract preserves the required layer order and Section 03 controls', () => {
  const contract = loadArchitecture();
  const result = validateArchitecture(contract);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(contract.architecture_boundaries.layer_order, [
    'routes',
    'controllers',
    'usecases',
    'repositories',
    'models',
  ]);
  assert.deepEqual(Object.keys(contract.requirement_catalog), [
    'BR-401',
    'BR-402',
    'DATA-401',
    'SEC-401',
    'NFR-401',
    'ADR-401',
  ]);
});

test('rejects a boundary that bypasses the use-case layer', () => {
  const contract = cloneContract();
  contract.architecture_boundaries.layer_order = ['routes', 'controllers', 'repositories', 'usecases', 'models'];

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /layer_order must preserve/);
});

test('rejects mutable fiscal source truth for evidence', () => {
  const contract = cloneContract();
  contract.source_of_truth_contract[0].immutable = false;
  contract.source_of_truth_contract[0].read_only_for_evidence = false;

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /issued_fiscal_document must be immutable and read-only/);
});

test('rejects a duplicate-readiness-store design without final-review reuse', () => {
  const contract = cloneContract();
  contract.guardrails.no_duplicate_readiness_store.reuse_existing_final_review_store = false;

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /no_duplicate_readiness_store must require reuse/);
});

test('rejects a backend receipt-renderer import guardrail that is removed', () => {
  const contract = cloneContract();
  contract.guardrails.backend_forbidden_imports = contract.guardrails.backend_forbidden_imports.filter((entry) => entry !== '@sieitzz/pos-receipt');

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /must forbid backend import @sieitzz\/pos-receipt/);
});

test('rejects a planned surface without permission metadata', () => {
  const contract = cloneContract();
  contract.module_placement[0].permission_contract = '';

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /pos_fiscal_runtime\.permission_contract must be non-empty/);
});

test('rejects a determinism contract that omits serializer version', () => {
  const contract = cloneContract();
  contract.guardrails.determinism.inputs = ['source_snapshot', 'policy_version'];

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /determinism must define source, policy, serializer/);
});

test('rejects a missing ADR impact gate', () => {
  const contract = cloneContract();
  contract.guardrails.adr_impact.current_decision = 'UNDECLARED';

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /adr_impact must define the Section 03 decision/);
});

test('rejects an execution manifest entry that claims runtime completion', () => {
  const contract = cloneContract();
  contract.execution_manifest[0].runtime_status = 'VERIFIED';

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /runtime_status must be DEFERRED BY PLAN/);
});

test('rejects a stale source-register path and external execution mode', () => {
  const contract = cloneContract();
  contract.plan.execution_mode = 'STAGING';
  contract.source_register[0].path = 'backend/stale-plan.docx';

  const result = validateArchitecture(contract);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /execution_mode must be LOCAL_ONLY/);
  assert.match(result.errors.join('\n'), /unsafe or obsolete repository path/);
});

test('summary remains separate from later runtime completion', () => {
  const contract = cloneContract();
  contract.execution_manifest.forEach((entry) => {
    entry.status = 'VERIFIED';
    entry.runtime_status = 'VERIFIED';
  });

  const summary = computeSummary(contract);

  assert.equal(summary.contract_complete, false);
  assert.equal(summary.runtime_complete, true);
});
