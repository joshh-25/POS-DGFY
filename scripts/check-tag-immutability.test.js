const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isNotFoundError,
  findRevisionLabel,
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

test('findRevisionLabel: single-platform shape (.Image.Config.Labels)', () => {
  const parsed = {
    Name: 'ghcr.io/sieitzz/dgfy-api:1.0.0-staging',
    Image: { Config: { Labels: { 'org.opencontainers.image.revision': 'abc123' } } },
  };
  assert.equal(findRevisionLabel(parsed), 'abc123');
});

test('findRevisionLabel: multi-platform shape keyed by platform (dgfy-migration-runner)', () => {
  const parsed = {
    Name: 'ghcr.io/sieitzz/dgfy-migration-runner:1.0.0-dev',
    Image: {
      'linux/amd64': { config: { Labels: { 'org.opencontainers.image.revision': 'def456' } } },
      'linux/arm64': { config: { Labels: { 'org.opencontainers.image.revision': 'def456' } } },
    },
  };
  assert.equal(findRevisionLabel(parsed), 'def456');
});

test('findRevisionLabel: lowercase "labels" key is also found', () => {
  const parsed = { image: { config: { labels: { 'org.opencontainers.image.revision': 'ghi789' } } } };
  assert.equal(findRevisionLabel(parsed), 'ghi789');
});

test('findRevisionLabel: label object present without the revision key returns null', () => {
  const parsed = { Image: { Config: { Labels: { 'org.opencontainers.image.source': 'https://github.com/x' } } } };
  assert.equal(findRevisionLabel(parsed), null);
});

test('findRevisionLabel: no Labels object anywhere returns null, not a throw', () => {
  assert.equal(findRevisionLabel({ Name: 'x', Manifest: { mediaType: 'application/vnd.oci.image.index.v1+json' } }), null);
  assert.equal(findRevisionLabel(null), null);
  assert.equal(findRevisionLabel('not an object'), null);
  assert.equal(findRevisionLabel(42), null);
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
  assert.match(verdict.reason, /could not be read/);
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
