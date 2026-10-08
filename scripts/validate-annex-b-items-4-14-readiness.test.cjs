const assert = require('assert/strict');
const test = require('node:test');

const {
  loadBaseline,
  validateAnnexBReadiness,
} = require('./validate-annex-b-items-4-14-readiness.cjs');

test('the approved baseline covers Items 4 through 14 and remains local-only', () => {
  const result = validateAnnexBReadiness(loadBaseline());

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
});

test('rejects missing or duplicated Annex B rows', () => {
  const baseline = loadBaseline();
  baseline.items = baseline.items.slice(0, -1);

  const result = validateAnnexBReadiness(baseline);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /exactly Annex B Items 4 through 14/);
});

test('rejects an internal pass without generated and reviewed evidence', () => {
  const baseline = loadBaseline();
  baseline.items[0].internal_status = 'INTERNAL_PASS';
  baseline.readiness_summary.internal_pass_count = 1;
  baseline.readiness_summary.internal_complete_count = 1;
  baseline.readiness_summary.blocked_count = 10;
  baseline.readiness_summary.score_percent = 9.090909090909092;

  const result = validateAnnexBReadiness(baseline);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Item 4 cannot be INTERNAL_PASS/);
});

test('keeps Item 5 blocked while Return semantics are open', () => {
  const baseline = loadBaseline();
  baseline.items[1].internal_status = 'INTERNAL_PASS';
  baseline.items[1].evidence.generated = true;
  baseline.items[1].evidence.reviewed = true;
  baseline.items[1].evidence.review_state = 'REVIEWED';
  baseline.items[1].decision.state = 'OPEN';

  const result = validateAnnexBReadiness(baseline);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /Item 5 decision\.state must be INTERNAL_READINESS_LOCKED or APPROVED/);
});

test('requires the versioned internal readiness contracts', () => {
  const baseline = loadBaseline();
  baseline.source_lock.ejournal_contract.path = 'docs/compliance/evidence/missing-ejournal-contract.md';

  const result = validateAnnexBReadiness(baseline);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /source_lock\.ejournal_contract references missing contract path/);
});

test('rejects a false 100 percent score while blockers remain', () => {
  const baseline = loadBaseline();
  baseline.readiness_summary.score_percent = 100;

  const result = validateAnnexBReadiness(baseline);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /must not report score_percent 100/);
});

test('rejects a baseline that references a missing repository path', () => {
  const baseline = loadBaseline();
  baseline.items[0].source_paths[0] = 'apps/dgfy-api/src/missing-annex-b-source.js';

  const result = validateAnnexBReadiness(baseline);

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /references missing source path/);
});
