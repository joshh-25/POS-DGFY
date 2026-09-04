const test = require('node:test');
const assert = require('node:assert/strict');

const { parseVerdict } = require('./parse-preflight-response');

// The actual response envelope runCompliancePreflight's successPayloadResolver produces
// (apps/dgfy-api/src/modules/compliance/controllers/complianceHandlers.js) -- result/can_proceed/
// reason_code live under `data`, not the top level. This is the exact shape pr-reviewer RF-5
// asked to be covered.
const envelope = (data) => JSON.stringify({
  success: true,
  data,
  message: data.can_proceed ? 'Compliance preflight passed' : 'Compliance preflight failed',
  timestamp: '2026-08-29T00:00:00Z'
});

test('a real no_breach/can_proceed:true envelope passes', () => {
  const verdict = parseVerdict(envelope({
    result: 'no_breach',
    can_proceed: true,
    reason_code: 'ALLOWED',
    decisions: [],
    required_actions: []
  }));

  assert.deepEqual(verdict, {
    pass: true,
    result: 'no_breach',
    can_proceed: true,
    reason_code: 'ALLOWED'
  });
});

test('a real breach/can_proceed:false envelope fails, even at HTTP 200', () => {
  const verdict = parseVerdict(envelope({
    result: 'breach',
    can_proceed: false,
    reason_code: 'IMPACT_DECLARATION_REQUIRED',
    decisions: [{ decision: 'DENY', reason_code: 'IMPACT_DECLARATION_REQUIRED' }],
    required_actions: ['Submit compliance impact declaration before implementation.']
  }));

  assert.equal(verdict.pass, false);
  assert.equal(verdict.result, 'breach');
  assert.equal(verdict.can_proceed, false);
  assert.equal(verdict.reason_code, 'IMPACT_DECLARATION_REQUIRED');
});

test('a real review_required/can_proceed:false envelope fails', () => {
  const verdict = parseVerdict(envelope({
    result: 'review_required',
    can_proceed: false,
    reason_code: 'REQUIRES_SETUP',
    decisions: [],
    required_actions: []
  }));

  assert.equal(verdict.pass, false);
  assert.equal(verdict.result, 'review_required');
});

test('an unwrapped { result, can_proceed, reason_code } body still parses (fallback)', () => {
  const verdict = parseVerdict(JSON.stringify({
    result: 'no_breach',
    can_proceed: true,
    reason_code: 'ALLOWED'
  }));

  assert.equal(verdict.pass, true);
});

test('malformed JSON fails loudly rather than throwing', () => {
  const verdict = parseVerdict('not json at all');

  assert.deepEqual(verdict, {
    pass: false,
    result: null,
    can_proceed: null,
    reason_code: null
  });
});

test('an empty body fails loudly rather than throwing', () => {
  const verdict = parseVerdict('');

  assert.equal(verdict.pass, false);
});

test('can_proceed as a truthy non-boolean (e.g. 1 or "true") does not pass -- must be === true', () => {
  const verdict = parseVerdict(envelope({ result: 'no_breach', can_proceed: 1, reason_code: 'ALLOWED' }));

  assert.equal(verdict.pass, false);
});
