const test = require('node:test');
const assert = require('node:assert/strict');

const { BLOCKING, resolveBlocking } = require('./version-bump-gate-toggle');

// #1774: direct unit coverage for the base-aware `resolveBlocking(base, head)` this module added
// to replace the flat `BLOCKING` constant #1592 flipped globally -- see that module's own header
// for the full rationale. `BLOCKING` itself stays a global kill switch, so every case below assumes
// it is currently `true`; if a future emergency flip sets it `false`, every case here should read
// advisory instead (the module-level assertion below documents that assumption rather than leaving
// it implicit).

test('BLOCKING is currently the global kill switch, on', () => {
  assert.equal(BLOCKING, true);
});

test('resolveBlocking: develop base is advisory regardless of head', () => {
  assert.equal(resolveBlocking('develop', undefined), false);
  assert.equal(resolveBlocking('develop', 'feature/anything'), false);
  assert.equal(resolveBlocking('develop', 'release/2026-09-10-01'), false);
});

test('resolveBlocking: staging base is blocking for every real head shape', () => {
  assert.equal(resolveBlocking('staging', 'to-staging/2026-09-10-01'), true);
  assert.equal(resolveBlocking('staging', 'fix/staging/2026-09-10-01-r2'), true);
  // An unexpected head into staging still blocks -- there is no legitimate staging-base PR that
  // should fall back to advisory just because its head doesn't match a known promotion pattern.
  assert.equal(resolveBlocking('staging', 'some-unexpected-head'), true);
});

test('resolveBlocking: main base is blocking for every real head shape', () => {
  assert.equal(resolveBlocking('main', 'release/2026-09-10-01'), true);
  // A plain hotfix branch (not release/*, not hotfix/* -- #1701's finding that real hotfixes in
  // this repo use fix/* prefixes) still blocks on a main base.
  assert.equal(resolveBlocking('main', 'fix/some-hotfix'), true);
});

test('resolveBlocking: an unrecognized base defaults to advisory, least-restrictive', () => {
  assert.equal(resolveBlocking('some-other-branch', 'anything'), false);
  assert.equal(resolveBlocking('', 'anything'), false);
  assert.equal(resolveBlocking(undefined, undefined), false);
});

// Cross-check against check-app-version-bump.js's resolveMode(base, head) -- the one place this
// file is deliberately allowed to cross-import (a test file, run after root deps/`madge` are
// already installed), to document in-test why the two must not be conflated. resolveMode() and
// resolveBlocking() answer different questions (required bump *level* vs. whether the check
// *blocks* at all) and must not be assumed to move together -- a release/* head into main resolves
// to resolveMode's 'any-increase', the SAME value develop gets, so a naive
// `resolveMode(...) !== 'any-increase'` proxy for blocking would read false (advisory) for exactly
// the case #1774 requires to stay blocking. This test asserts the real resolveBlocking() gets it
// right regardless of what resolveMode() reports for the same inputs.
test('resolveBlocking is not derived from (and disagrees in shape with) resolveMode', () => {
  // eslint-disable-next-line global-require
  const { resolveMode } = require('../check-app-version-bump');

  const blockingCases = [
    ['staging', 'to-staging/2026-09-10-01'],
    ['staging', 'fix/staging/2026-09-10-01-r2'],
    ['main', 'release/2026-09-10-01'],
    ['main', 'fix/some-hotfix'],
  ];

  for (const [base, head] of blockingCases) {
    assert.equal(
      resolveBlocking(base, head),
      true,
      `resolveBlocking(${base}, ${head}) must be true regardless of resolveMode`,
    );
  }

  // The specific case that makes the naive `resolveMode(...) !== 'any-increase'` proxy wrong:
  // release/* into main resolves to the same mode as develop, yet must still block.
  assert.equal(resolveMode('main', 'release/2026-09-10-01'), 'any-increase');
  assert.equal(resolveMode('develop', 'anything'), 'any-increase');
  assert.equal(resolveBlocking('main', 'release/2026-09-10-01'), true);
  assert.equal(resolveBlocking('develop', 'anything'), false);
});
