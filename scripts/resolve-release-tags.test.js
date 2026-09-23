const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ReleaseTagsError,
  isFrontendApp,
  isBackendApp,
  parseFloorVersion,
  parseReleaseRevision,
  sanitizePrRef,
  parseRevisionTag,
  resolveReleaseTags,
  parseArgs,
} = require('./resolve-release-tags');

// Issue #1977 (Phase 342) -- the release floor stays X.Y.Z while candidate revisions (rN)
// identify the exact artifact. Frontends keep environment-qualified tags (baked VITE_*);
// dgfy-api and dgfy-migration-runner use environment-neutral candidate tags.

test('app-type classification: three frontends, two backends', () => {
  assert.equal(isFrontendApp('dgfy-ims'), true);
  assert.equal(isFrontendApp('dgfy-pos'), true);
  assert.equal(isFrontendApp('dgfy-storefront'), true);
  assert.equal(isFrontendApp('dgfy-api'), false);
  assert.equal(isBackendApp('dgfy-api'), true);
  assert.equal(isBackendApp('dgfy-migration-runner'), true);
  assert.equal(isBackendApp('dgfy-pos'), false);
});

test('parseFloorVersion: bare X.Y.Z passes, everything else fails', () => {
  assert.equal(parseFloorVersion('1.13.0'), '1.13.0');
  assert.throws(() => parseFloorVersion('1.13.0-staging'), ReleaseTagsError);
  assert.throws(() => parseFloorVersion('1.13.0-r16'), ReleaseTagsError);
  assert.throws(() => parseFloorVersion('1.13'), ReleaseTagsError);
  assert.throws(() => parseFloorVersion(''), ReleaseTagsError);
});

test('parseFloorVersion: "+" build metadata is rejected (Docker tags forbid "+")', () => {
  assert.throws(() => parseFloorVersion('1.13.0+r16'), ReleaseTagsError);
});

test('parseReleaseRevision: accepts rN, N, and integer; rejects missing/invalid', () => {
  assert.equal(parseReleaseRevision('r16'), 16);
  assert.equal(parseReleaseRevision('16'), 16);
  assert.equal(parseReleaseRevision(16), 16);
  assert.equal(parseReleaseRevision('r1'), 1);
  assert.throws(() => parseReleaseRevision(undefined), ReleaseTagsError);
  assert.throws(() => parseReleaseRevision(''), ReleaseTagsError);
  assert.throws(() => parseReleaseRevision('r0'), ReleaseTagsError);
  assert.throws(() => parseReleaseRevision('abc'), ReleaseTagsError);
  assert.throws(() => parseReleaseRevision('1.5'), ReleaseTagsError);
});

test('DEV without identity: legacy behavior preserved -- X.Y.Z-dev, never promotion-eligible', () => {
  for (const app of ['dgfy-api', 'dgfy-migration-runner', 'dgfy-ims', 'dgfy-pos', 'dgfy-storefront']) {
    const resolved = resolveReleaseTags({ app, version: '1.13.0', environment: 'DEV' });
    assert.equal(resolved.tag, '1.13.0-dev');
    assert.equal(resolved.floor, '1.13.0');
    assert.equal(resolved.revision, null);
    assert.equal(resolved.revisionTag, null);
    assert.equal(resolved.canonicalAlias, null);
    assert.equal(resolved.prRef, null);
    assert.equal(resolved.promotionEligible, false);
  }
});

// Issue #2055 (Phase 346) -- DEV builds carry their own per-app allocated revision.
test('DEV with revision: promotion-eligible X.Y.Z-rN-dev for every app', () => {
  for (const app of ['dgfy-api', 'dgfy-migration-runner', 'dgfy-ims', 'dgfy-pos', 'dgfy-storefront']) {
    const resolved = resolveReleaseTags({ app, version: '1.13.0', environment: 'DEV', revision: 'r16' });
    assert.equal(resolved.tag, '1.13.0-r16-dev');
    assert.equal(resolved.floor, '1.13.0');
    assert.equal(resolved.revision, 16);
    assert.equal(resolved.revisionTag, '1.13.0-r16');
    assert.equal(resolved.stagingTag, null);
    assert.equal(resolved.productionTag, null);
    assert.equal(resolved.canonicalAlias, null);
    assert.equal(resolved.prRef, null);
    assert.equal(resolved.promotionEligible, true);
  }
});

test('DEV with revision: accepts bare N and integer, same as STAGING/PROD', () => {
  assert.equal(resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'DEV', revision: 3 }).tag, '1.13.0-r3-dev');
  assert.equal(resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'DEV', revision: '3' }).tag, '1.13.0-r3-dev');
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'DEV', revision: 'bogus' }), ReleaseTagsError);
});

test('DEV with pr-ref: non-eligible X.Y.Z-<slug>-dev, PR number and branch slug forms', () => {
  const fromPr = resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'DEV', prRef: 'pr482' });
  assert.equal(fromPr.tag, '1.13.0-pr482-dev');
  assert.equal(fromPr.prRef, 'pr482');
  assert.equal(fromPr.promotionEligible, false);
  assert.equal(fromPr.revision, null);

  assert.equal(resolveReleaseTags({ app: 'dgfy-api', version: '2.0.1', environment: 'DEV', prRef: '482' }).tag, '2.0.1-pr482-dev');
  assert.equal(resolveReleaseTags({ app: 'dgfy-ims', version: '1.13.0', environment: 'DEV', prRef: 'feat/release-trace' }).tag, '1.13.0-feat-release-trace-dev');
});

test('DEV with both revision and pr-ref is rejected -- one identity per build', () => {
  assert.throws(
    () => resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'DEV', revision: 'r16', prRef: 'pr1' }),
    /mutually exclusive/,
  );
});

test('pr-ref is DEV-only -- STAGING/PROD reject it instead of silently ignoring it', () => {
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'STAGING', revision: 'r16', prRef: 'pr1' }), /DEV-only/);
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-api', version: '1.13.0', environment: 'PROD', revision: 'r16', prRef: 'pr1' }), /DEV-only/);
});

test('sanitizePrRef: PR numbers normalize, branch names slugify, garbage fails closed', () => {
  assert.equal(sanitizePrRef('pr482'), 'pr482');
  assert.equal(sanitizePrRef('482'), 'pr482');
  assert.equal(sanitizePrRef('#482'), 'pr482');
  assert.equal(sanitizePrRef('PR-482'), 'pr482');
  assert.equal(sanitizePrRef('feat/release-trace'), 'feat-release-trace');
  assert.equal(sanitizePrRef('Feature_Branch.NAME'), 'feature-branch-name');
  assert.throws(() => sanitizePrRef(''), ReleaseTagsError);
  assert.throws(() => sanitizePrRef('---'), ReleaseTagsError);
  const long = sanitizePrRef(`${'a'.repeat(60)}/branch`);
  assert.ok(long.length <= 48);
});

test('parseRevisionTag: revision tags parse, everything else returns null', () => {
  assert.deepEqual(parseRevisionTag('1.13.0-r16'), { floor: '1.13.0', revision: 16 });
  assert.deepEqual(parseRevisionTag('1.13.0-r16-dev'), { floor: '1.13.0', revision: 16 });
  assert.deepEqual(parseRevisionTag('1.13.0-r16-staging'), { floor: '1.13.0', revision: 16 });
  assert.equal(parseRevisionTag('1.13.0-dev'), null);
  assert.equal(parseRevisionTag('1.13.0-pr482-dev'), null);
  assert.equal(parseRevisionTag('1.13.0-feat-foo-dev'), null);
  assert.equal(parseRevisionTag('1.13.0'), null);
  assert.equal(parseRevisionTag('not-a-tag'), null);
});

test('STAGING frontend: X.Y.Z-rN-staging (candidate revision from release_revision.revision)', () => {
  const resolved = resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'STAGING', revision: 'r16' });
  assert.equal(resolved.floor, '1.13.0');
  assert.equal(resolved.revision, 16);
  assert.equal(resolved.revisionTag, '1.13.0-r16');
  assert.equal(resolved.stagingTag, '1.13.0-r16-staging');
  assert.equal(resolved.productionTag, '1.13.0-r16');
  assert.equal(resolved.canonicalAlias, '1.13.0');
  assert.equal(resolved.tag, '1.13.0-r16-staging');
});

test('STAGING backend: environment-neutral X.Y.Z-rN (same digest promotes to PROD)', () => {
  for (const app of ['dgfy-api', 'dgfy-migration-runner']) {
    const resolved = resolveReleaseTags({ app, version: '1.13.0', environment: 'STAGING', revision: 16 });
    assert.equal(resolved.revisionTag, '1.13.0-r16');
    assert.equal(resolved.stagingTag, '1.13.0-r16');
    assert.equal(resolved.tag, '1.13.0-r16');
  }
});

test('PROD: revision tag plus immutable bare alias, same digest (alias created digest-side)', () => {
  for (const app of ['dgfy-api', 'dgfy-ims', 'dgfy-pos', 'dgfy-storefront', 'dgfy-migration-runner']) {
    const resolved = resolveReleaseTags({ app, version: '1.13.0', environment: 'PROD', revision: 'r16' });
    assert.equal(resolved.tag, '1.13.0-r16');
    assert.equal(resolved.productionTag, '1.13.0-r16');
    assert.equal(resolved.canonicalAlias, '1.13.0');
  }
});

test('STAGING/PROD without a revision fail closed (candidate dispatch must thread one)', () => {
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'STAGING' }), ReleaseTagsError);
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-api', version: '1.13.0', environment: 'PROD' }), ReleaseTagsError);
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'STAGING', revision: 'bogus' }), ReleaseTagsError);
});

test('direct production hotfix: patch increment uses the same paired revision/canonical tags', () => {
  const resolved = resolveReleaseTags({ app: 'dgfy-api', version: '1.13.1', environment: 'PROD', revision: 'r3' });
  assert.equal(resolved.tag, '1.13.1-r3');
  assert.equal(resolved.canonicalAlias, '1.13.1');
  assert.equal(resolved.floor, '1.13.1');
});

test('no resolved tag ever contains "+"', () => {
  const cases = [
    { app: 'dgfy-pos', version: '1.13.0', environment: 'STAGING', revision: 'r16' },
    { app: 'dgfy-api', version: '1.13.0', environment: 'STAGING', revision: 'r16' },
    { app: 'dgfy-pos', version: '1.13.0', environment: 'PROD', revision: 'r16' },
    { app: 'dgfy-api', version: '1.13.0', environment: 'PROD', revision: 'r16' },
    { app: 'dgfy-pos', version: '1.13.0', environment: 'DEV', revision: 'r16' },
    { app: 'dgfy-pos', version: '1.13.0', environment: 'DEV', prRef: 'feat/foo' },
    { app: 'dgfy-pos', version: '1.13.0', environment: 'DEV' },
  ];
  for (const options of cases) {
    const resolved = resolveReleaseTags(options);
    for (const tag of [resolved.tag, resolved.stagingTag, resolved.productionTag, resolved.canonicalAlias, resolved.revisionTag]) {
      if (tag !== null) assert.doesNotMatch(tag, /\+/);
    }
  }
});

test('unknown app/environment fail closed', () => {
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-unknown', version: '1.13.0', environment: 'PROD', revision: 'r1' }), ReleaseTagsError);
  assert.throws(() => resolveReleaseTags({ app: 'dgfy-pos', version: '1.13.0', environment: 'QA', revision: 'r1' }), ReleaseTagsError);
});

test('parseArgs: revision is optional at parse time (resolveReleaseTags enforces per-env)', () => {
  const options = parseArgs(['--app', 'dgfy-pos', '--version', '1.13.0', '--environment', 'STAGING', '--revision', 'r16']);
  assert.equal(options.revision, 'r16');
  assert.throws(() => parseArgs(['--bogus']), ReleaseTagsError);
});

test('parseArgs: --pr-ref parses for ad-hoc DEV dispatches', () => {
  const options = parseArgs(['--app', 'dgfy-pos', '--version', '1.13.0', '--environment', 'DEV', '--pr-ref', 'pr482']);
  assert.equal(options.prRef, 'pr482');
});
