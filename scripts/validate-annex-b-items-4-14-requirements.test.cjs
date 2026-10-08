const assert = require('node:assert/strict');
const test = require('node:test');

const {
  computeSummary,
  loadRequirements,
  validateRequirements,
} = require('./validate-annex-b-items-4-14-requirements.cjs');

function cloneRegistry() {
  return JSON.parse(JSON.stringify(loadRequirements()));
}

test('the Section 02 registry covers Items 4 through 14 and is locally passable', () => {
  const registry = loadRequirements();
  const result = validateRequirements(registry);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(result.summary, {
    total_items: 11,
    internal_pass_count: 0,
    internal_complete_count: 0,
    blocked_count: 11,
    external_review_required_count: 11,
    not_applicable_count: 0,
    score_percent: 0,
    eligible_for_100_percent: false,
  });
  assert.equal(registry.plan.execution_mode, 'LOCAL_ONLY');
  assert.equal(registry.plan.external_approval_claim, 'NOT_CLAIMED');
  assert.equal(registry.items[0].annex_item, 4);
  assert.equal(registry.items.at(-1).annex_item, 14);
});

test('the registry preserves the exact Section 02 control and evidence assignments', () => {
  const registry = loadRequirements();
  const result = validateRequirements(registry);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(registry.items.length, 11);
  assert.equal(registry.fixture_catalog.length, 49);
  assert.deepEqual(registry.items[0].test_ids, ['TEST-420', 'TEST-421', 'TEST-423']);
  assert.deepEqual(registry.items[1].acceptance_criteria, ['AC-420', 'AC-422', 'AC-423']);
  assert.equal(registry.items[4].decision.contract_version, 'EJOURNAL-READINESS-0.1');
});

test('the execution manifest accounts for every Section 02 requirement', () => {
  const registry = loadRequirements();
  const result = validateRequirements(registry);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(
    registry.execution_manifest.map((entry) => entry.requirement_id),
    ['FR-401', 'FR-402', 'FR-403', 'FR-404', 'FR-405', 'FR-406', 'BR-401', 'BR-402', 'BR-403', 'REP-401'],
  );
  assert.equal(registry.execution_manifest[0].status, 'DEFERRED BY PLAN');
  assert.equal(registry.execution_manifest[0].section_02_status, 'IMPLEMENTED');
});

test('rejects a missing Annex B row', () => {
  const registry = cloneRegistry();
  registry.items = registry.items.slice(0, -1);

  const result = validateRequirements(registry);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /exactly Annex B Items 4 through 14/);
});

test('rejects an N/A decision without reviewer rationale', () => {
  const registry = cloneRegistry();
  registry.items[9].applicability.decision = 'NOT_APPLICABLE_WITH_RATIONALE';
  registry.items[9].internal_status = 'NOT_APPLICABLE';

  const result = validateRequirements(registry);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /NOT_APPLICABLE_WITH_RATIONALE requires rationale, reviewer, and review_date/);
});

test('rejects INTERNAL_PASS without generated, reviewed, and checksum-verified evidence', () => {
  const registry = cloneRegistry();
  registry.items[0].internal_status = 'INTERNAL_PASS';

  const result = validateRequirements(registry);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Item 4 cannot be INTERNAL_PASS/);
});

test('rejects an evidence obligation that omits a required REP-401 field', () => {
  const registry = cloneRegistry();
  registry.items[0].evidence_obligations[0].required_metadata = registry.items[0].evidence_obligations[0].required_metadata.filter((key) => key !== 'terminal_id');

  const result = validateRequirements(registry);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Item 4 obligation EVID-04-SAMPLE-PACK must include terminal_id/);
});

test('rejects a false 100 percent score while the later runtime gates remain blocked', () => {
  const registry = cloneRegistry();
  registry.readiness_summary.score_percent = 100;

  const result = validateRequirements(registry);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /must not report score_percent 100/);
});

test('rejects obsolete repository paths and stale source files', () => {
  const registry = cloneRegistry();
  registry.items[0].source_paths[0] = 'backend/src/obsolete.js';

  const result = validateRequirements(registry);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /obsolete backend\/ or frontend\//);
  assert.match(result.errors.join('\n'), /references missing source path backend\/src\/obsolete\.js/);
});

test('summary computation remains independent from external acceptance status', () => {
  const registry = cloneRegistry();
  registry.items.forEach((item) => {
    item.external_status = 'ACCEPTED';
  });
  registry.readiness_summary.external_review_required_count = 0;

  const result = validateRequirements(registry);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(computeSummary(registry.items), {
    total_items: 11,
    internal_pass_count: 0,
    internal_complete_count: 0,
    blocked_count: 11,
    external_review_required_count: 0,
    not_applicable_count: 0,
    score_percent: 0,
    eligible_for_100_percent: false,
  });
});
