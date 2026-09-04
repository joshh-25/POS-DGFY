const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isNotFoundError,
  collectRevisionLabelInfo,
  resolveRevisionLabels,
  decideImmutability,
  parseArgs,
} = require('./check-tag-immutability');

// #1575 (epic #1548 Wave 3, Phase 277) -- ADR 0081 Decision 7's tag-immutability guard. Every case
// here mocks `docker buildx imagetools inspect` output directly (status/stdout/stderr fixtures);
// none of these tests shell out to `docker` or touch a real registry.

test('isNotFoundError: a 404/not-found style stderr is recognized', () => {
  assert.equal(isNotFoundError('unexpected status from HEAD request: 404 Not Found'), true);
  assert.equal(isNotFoundError('ghcr.io/sieitzz/dgfy-api:1.0.0-dev: not found'), true);
  assert.equal(isNotFoundError('manifest unknown'), true);
});

test('isNotFoundError: an auth failure is never treated as not-found, even if it also mentions 404-adjacent words', () => {
  assert.equal(isNotFoundError('unexpected status from HEAD request: 401 Unauthorized'), false);
  assert.equal(isNotFoundError('denied: requested access to the resource is forbidden'), false);
});

test('isNotFoundError: an unrelated error is not treated as not-found', () => {
  assert.equal(isNotFoundError('dial tcp: lookup ghcr.io: no such host'), false);
  assert.equal(isNotFoundError(''), false);
});

// PR #1577 review, RF-2 (blocker): the original findRevisionLabel() returned only the FIRST
// revision label it happened to encounter during traversal -- for a multi-platform inspect result
// where one platform carries the current revision and another carries a different one, iteration
// order could pick the matching platform and the guard would publish over a real conflict.
// collectRevisionLabelInfo/resolveRevisionLabels replace it: every Labels/labels object in the tree
// contributes, and disagreement or partial unreadability is its own refusal condition, independent
// of what currentRevision is.

test('resolveRevisionLabels: single-platform shape (.Image.Config.Labels) -> agree', () => {
  const parsed = {
    Name: 'ghcr.io/sieitzz/dgfy-api:1.0.0-staging',
    Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'abc123' } } },
  };
  assert.deepEqual(resolveRevisionLabels(parsed), { status: 'agree', revision: 'abc123' });
});

test('resolveRevisionLabels: multi-platform shape, all platforms agreeing (dgfy-migration-runner) -> agree', () => {
  const parsed = {
    Name: 'ghcr.io/sieitzz/dgfy-migration-runner:1.0.0-dev',
    Image: {
      'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'def456' } } },
      'linux/arm64': { config: { Labels: { 'org.opencontainers.image.revision': 'def456' } } },
    },
  };
  assert.deepEqual(resolveRevisionLabels(parsed), { status: 'agree', revision: 'def456' });
});

// The RF-2 fixture itself: one platform carries the revision a naive "first match wins" scan would
// have picked (even the current build's own revision, in decideImmutability's test below), the
// other carries something different. Must be caught as 'disagree', not silently resolved to either
// value.
test('resolveRevisionLabels: mixed platform revisions (RF-2 fixture) -> disagree, not the first-found value', () => {
  const parsed = {
    Name: 'ghcr.io/sieitzz/dgfy-migration-runner:1.0.0-staging',
    Image: {
      'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-current' } } },
      'linux/arm64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-stale' } } },
    },
  };
  const resolved = resolveRevisionLabels(parsed);
  assert.equal(resolved.status, 'disagree');
  assert.deepEqual([...resolved.revisions].sort(), ['sha-current', 'sha-stale']);
});

test('resolveRevisionLabels: lowercase "labels" key is also found -> agree', () => {
  const parsed = { image: { config: { labels: { 'org.opencontainers.image.revision': 'ghi789' } } } };
  assert.deepEqual(resolveRevisionLabels(parsed), { status: 'agree', revision: 'ghi789' });
});

test('resolveRevisionLabels: single Labels object present without the revision key -> unreadable', () => {
  const parsed = { Image: { Config: { Labels: { 'org.opencontainers.image.source': 'https://github.com/x' } } } };
  assert.deepEqual(resolveRevisionLabels(parsed), { status: 'unreadable', found: [] });
});

// One platform readable, the other's Labels object is missing the key entirely -- "unreadable" must
// still fire even though *a* value was found, per RF-2's "refuse if any label is unreadable".
test('resolveRevisionLabels: one platform readable, the other missing the revision key entirely -> unreadable', () => {
  const parsed = {
    Image: {
      'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-current' } } },
      'linux/arm64': { config: { Labels: { 'org.opencontainers.image.source': 'https://github.com/x' } } },
    },
  };
  assert.deepEqual(resolveRevisionLabels(parsed), { status: 'unreadable', found: ['sha-current'] });
});

test('resolveRevisionLabels: no Labels object anywhere -> none, not a throw', () => {
  assert.deepEqual(resolveRevisionLabels({ Name: 'x', Manifest: { mediaType: 'application/vnd.oci.image.index.v1+json' } }), { status: 'none' });
  assert.deepEqual(resolveRevisionLabels(null), { status: 'none' });
  assert.deepEqual(resolveRevisionLabels('not an object'), { status: 'none' });
  assert.deepEqual(resolveRevisionLabels(42), { status: 'none' });
});

test('collectRevisionLabelInfo: accumulates across a deeper, irregular nesting without losing entries', () => {
  const parsed = {
    Manifest: { manifests: [{ digest: 'sha256:aaa', platform: { architecture: 'amd64' } }] },
    Image: {
      'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'r1' } } },
      'linux/arm64': { config: { Labels: { 'org.opencontainers.image.revision': 'r1' } } },
      'linux/arm/v7': { config: { Labels: { 'org.opencontainers.image.revision': 'r2' } } },
    },
  };
  const info = collectRevisionLabelInfo(parsed);
  assert.deepEqual([...info.found].sort(), ['r1', 'r1', 'r2']);
  assert.equal(info.unreadableCount, 0);
});

test('decideImmutability: tag not found -> push (first publish)', () => {
  const verdict = decideImmutability({
    inspectStatus: 1,
    inspectStdout: '',
    inspectStderr: 'ghcr.io/sieitzz/dgfy-api:1.0.0-dev: not found',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'push');
  assert.match(verdict.reason, /does not exist yet/);
});

test('decideImmutability: tag exists, same revision -> push (idempotent re-dispatch)', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: JSON.stringify({ Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'sha-current' } } } }),
    inspectStderr: '',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'push');
  assert.match(verdict.reason, /idempotent re-dispatch/);
  assert.equal(verdict.existingRevision, 'sha-current');
});

test('decideImmutability: tag exists, different revision -> refuse (the ADR 0081 Decision 7 invariant)', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: JSON.stringify({ Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'sha-old' } } } }),
    inspectStderr: '',
    currentRevision: 'sha-new',
  });
  assert.equal(verdict.action, 'refuse');
  assert.match(verdict.reason, /already published for revision sha-old/);
  assert.equal(verdict.existingRevision, 'sha-old');
});

test('decideImmutability: tag exists but revision label unreadable -> refuse, not push', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: JSON.stringify({ Image: { Config: { Labels: { 'org.opencontainers.image.source': 'x' } } } }),
    inspectStderr: '',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'refuse');
  assert.match(verdict.reason, /missing\/empty on at least one platform/);
});

test('decideImmutability: tag exists but has no Labels object anywhere -> refuse (status "none")', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: JSON.stringify({ Manifest: { mediaType: 'application/vnd.oci.image.index.v1+json' } }),
    inspectStderr: '',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'refuse');
  assert.match(verdict.reason, /could not be read/);
});

// The direct regression test for RF-2's own scenario: a multi-platform result where one platform's
// label matches currentRevision and the other's does not. A "first match wins" implementation could
// resolve this to a push (if traversal happened to visit the matching platform first) -- this must
// refuse unconditionally, regardless of traversal/object-key order.
test('decideImmutability: RF-2 regression -- mixed platform revisions refuse even when one platform matches currentRevision', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: JSON.stringify({
      Image: {
        'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-current' } } },
        'linux/arm64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-stale' } } },
      },
    }),
    inspectStderr: '',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'refuse');
  assert.match(verdict.reason, /disagrees across platforms/);
  assert.match(verdict.reason, /sha-current/);
  assert.match(verdict.reason, /sha-stale/);
});

test('decideImmutability: one platform unreadable (label missing there) -> refuse, even though the other platform matches currentRevision', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: JSON.stringify({
      Image: {
        'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-current' } } },
        'linux/arm64': { config: { Labels: { 'org.opencontainers.image.source': 'https://github.com/x' } } },
      },
    }),
    inspectStderr: '',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'refuse');
  assert.match(verdict.reason, /missing\/empty on at least one platform/);
});

test('decideImmutability: multi-platform, all platforms agree and match currentRevision -> push (idempotent)', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: JSON.stringify({
      Image: {
        'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-current' } } },
        'linux/arm64': { config: { Labels: { 'org.opencontainers.image.revision': 'sha-current' } } },
      },
    }),
    inspectStderr: '',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'push');
  assert.equal(verdict.existingRevision, 'sha-current');
});

test('decideImmutability: inspect fails for an unrelated/unclassified reason -> error, not push', () => {
  const verdict = decideImmutability({
    inspectStatus: 1,
    inspectStdout: '',
    inspectStderr: 'dial tcp: lookup ghcr.io: no such host',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'error');
  assert.match(verdict.reason, /not "tag not found"/);
});

test('decideImmutability: inspect fails on an auth error -> error, not push (never assume absence on 401/403)', () => {
  const verdict = decideImmutability({
    inspectStatus: 1,
    inspectStdout: '',
    inspectStderr: 'unexpected status from HEAD request: 401 Unauthorized',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'error');
});

test('decideImmutability: unparseable JSON on a successful inspect -> error, not push', () => {
  const verdict = decideImmutability({
    inspectStatus: 0,
    inspectStdout: 'not json{{{',
    inspectStderr: '',
    currentRevision: 'sha-current',
  });
  assert.equal(verdict.action, 'error');
  assert.match(verdict.reason, /could not parse/);
});

test('decideImmutability: no current revision supplied -> error, refuses to guess', () => {
  const verdict = decideImmutability({ inspectStatus: 1, inspectStdout: '', inspectStderr: 'not found', currentRevision: '' });
  assert.equal(verdict.action, 'error');
  assert.match(verdict.reason, /refusing to guess/);
});

test('parseArgs: parses image/tag/revision/digest and the skip-create flag', () => {
  const options = parseArgs(['--image', 'ghcr.io/sieitzz/dgfy-api', '--tag', '1.0.0-staging', '--revision', 'sha1', '--digest', 'sha256:abc', '--skip-create']);
  assert.deepEqual(options, {
    image: 'ghcr.io/sieitzz/dgfy-api',
    tag: '1.0.0-staging',
    revision: 'sha1',
    digest: 'sha256:abc',
    skipCreate: true,
  });
});

test('parseArgs: missing a required argument throws', () => {
  assert.throws(() => parseArgs(['--image', 'ghcr.io/sieitzz/dgfy-api', '--tag', '1.0.0']), /--revision is required/);
});

test('parseArgs: an unknown argument throws rather than being silently ignored', () => {
  assert.throws(() => parseArgs(['--bogus', 'x']), /Unknown argument: --bogus/);
});
