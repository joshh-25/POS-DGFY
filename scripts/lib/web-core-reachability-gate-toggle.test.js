const test = require('node:test');
const assert = require('node:assert/strict');

const { NARROWING_ENABLED, resolveNarrowingEnabled } = require('./web-core-reachability-gate-toggle');

// #1809: minimal coverage for the one-line rollback lever -- mirrors
// scripts/lib/version-bump-gate-toggle.test.js's own shape/spirit for its sibling toggle. This
// module has exactly one consumer (check-app-version-bump.js's detectChangedAppsNarrowed()) and one
// exported behavior (a flat on/off read), so the test surface is intentionally small.

test('NARROWING_ENABLED is currently on (the #1809 flip is live)', () => {
    assert.equal(NARROWING_ENABLED, true);
});

test('resolveNarrowingEnabled() reflects the current NARROWING_ENABLED value', () => {
    assert.equal(resolveNarrowingEnabled(), NARROWING_ENABLED);
});
