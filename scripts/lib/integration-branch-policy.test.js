'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RESERVED_PREFIXES,
  RESERVED_NAME_PATTERN,
  RESERVED_HEAD_PREFIX_PATTERN,
  RESERVATION_CHECK_BLOCKING,
  FIRST_INTEGRATION_MERGE_RECORDED,
  STALENESS_WARNING_DAYS,
  SYNC_CADENCE_DAYS,
  isReservedName,
  parseReservedName,
} = require('./integration-branch-policy');

test('reserved prefixes and registered-name parser share the documented contract', () => {
  assert.deepEqual(RESERVED_PREFIXES, ['epic', 'feature']);
  assert.equal(RESERVED_NAME_PATTERN.test('epic/2634-delivery-flow'), true);
  assert.equal(RESERVED_NAME_PATTERN.test('feature/2737-policy'), true);
  assert.equal(RESERVED_NAME_PATTERN.test('feature/2737'), false);
  assert.equal(RESERVED_HEAD_PREFIX_PATTERN.test('feature/2737-policy'), true);
  assert.equal(RESERVED_HEAD_PREFIX_PATTERN.test('feature/x'), false);
  assert.equal(isReservedName('epic/not-registered-yet'), true);
  assert.equal(isReservedName('feature/2737-policy'), true);
  assert.equal(isReservedName('feat/2737-policy'), false);
  assert.deepEqual(parseReservedName('feature/2737-policy'), {
    prefix: 'feature', issueNumber: 2737, slug: 'policy',
  });
  assert.equal(parseReservedName('feature/x'), null);
});

test('reservation rollout starts advisory, first merge remains unrecorded, and sync thresholds are explicit', () => {
  assert.equal(RESERVATION_CHECK_BLOCKING, false);
  assert.equal(FIRST_INTEGRATION_MERGE_RECORDED, false);
  assert.equal(STALENESS_WARNING_DAYS, 14);
  assert.equal(SYNC_CADENCE_DAYS, 7);
});
