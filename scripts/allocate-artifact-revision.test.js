const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ArtifactRevisionError,
  nextRevisionFromTags,
  allocateRevision,
  probeExistingSightings,
  allocateArtifactRevision,
  parseArgs,
} = require('./allocate-artifact-revision');
const { ReleaseTagsError } = require('./resolve-release-tags');

// Promotion-time per-app GHCR-sourced revision allocation (#2071).

test('nextRevisionFromTags: empty listing starts the sequence at 1', () => {
  assert.equal(nextRevisionFromTags([], '1.13.0'), 1);
  assert.equal(nextRevisionFromTags(null, '1.13.0'), 1);
});

test('nextRevisionFromTags: DEV history does not advance promotion revisions', () => {
  assert.equal(
    nextRevisionFromTags(['1.13.0-r1-dev', '1.13.0-r2-staging', '1.13.0-r2', '1.13.0-r5-dev'], '1.13.0'),
    3,
  );
});

test('nextRevisionFromTags: ignores DEV and non-promotion tags', () => {
  assert.equal(
    nextRevisionFromTags(['1.12.9-r99', '1.13.0-dev', '1.13.0-pr482-dev', '1.13.0-feat-foo-dev', '1.13.0', 'latest', '1.13.0-r3-dev'], '1.13.0'),
    1,
  );
});

test('nextRevisionFromTags: a floor bump naturally resets the sequence', () => {
  assert.equal(nextRevisionFromTags(['1.13.0-r41-staging'], '1.13.1'), 1);
});

test('nextRevisionFromTags: rejects a non-floor', () => {
  // Floor validation belongs to the resolver -- the allocator surfaces its error, unwrapped.
  assert.throws(() => nextRevisionFromTags([], '1.13'), ReleaseTagsError);
});

test('allocateRevision: no sightings allocates r1, never reused', () => {
  assert.deepEqual(allocateRevision({ floor: '1.13.0', currentRevision: 'a'.repeat(40), sightings: [] }), { revision: 1, reused: false });
});

test('allocateRevision: unseen source allocates max-plus-one', () => {
  const sightings = [
    { tag: '1.13.0-r1-staging', revision: 'b'.repeat(40) },
    { tag: '1.13.0-r2-staging', revision: 'c'.repeat(40) },
  ];
  assert.deepEqual(allocateRevision({ floor: '1.13.0', currentRevision: 'd'.repeat(40), sightings }), { revision: 3, reused: false });
});

test('allocateRevision: same source reuses its own N (idempotent retry, not a new allocation)', () => {
  const sha = 'a'.repeat(40);
  const sightings = [
    { tag: '1.13.0-r1-staging', revision: 'b'.repeat(40) },
    { tag: '1.13.0-r2', revision: sha },
    { tag: '1.13.0-r3-staging', revision: 'c'.repeat(40) },
  ];
  // Reuses r2 even though r3 exists -- the retry must converge on its own tag, and the
  // Decision 7 guard treats pushing it again as an idempotent no-op.
  assert.deepEqual(allocateRevision({ floor: '1.13.0', currentRevision: sha, sightings }), { revision: 2, reused: true });
});

test('allocateRevision: unreadable labels count toward the max but never toward reuse', () => {
  const sha = 'a'.repeat(40);
  const sightings = [
    { tag: '1.13.0-r4-staging', revision: null },
    { tag: '1.13.0-r4-staging', revision: null },
  ];
  assert.deepEqual(allocateRevision({ floor: '1.13.0', currentRevision: sha, sightings }), { revision: 5, reused: false });
});

test('allocateRevision: other floors and non-revision tags are invisible to the verdict', () => {
  const sha = 'a'.repeat(40);
  const sightings = [
    { tag: '1.13.0-dev', revision: sha },
    { tag: '1.13.0-pr9-dev', revision: sha },
    { tag: '9.9.9-r99-dev', revision: sha },
  ];
  assert.deepEqual(allocateRevision({ floor: '1.13.0', currentRevision: sha, sightings }), { revision: 1, reused: false });
});

test('allocateRevision: missing currentRevision fails closed -- never allocate blind', () => {
  assert.throws(() => allocateRevision({ floor: '1.13.0', sightings: [] }), /required/);
});

function labelFixture(revision, digest = 'sha256:abc') {
  return JSON.stringify({ digest, Image: { Config: { Labels: { 'org.opencontainers.image.revision': revision } } } });
}

function stubInspect(mapping) {
  return (ref) => {
    if (Object.hasOwn(mapping, ref)) return mapping[ref];
    return { status: 1, stdout: '', stderr: 'Error: manifest unknown: not found' };
  };
}

test('probeExistingSightings: stops at the first fully-absent N across promotion channels', () => {
  const shaA = 'a'.repeat(40);
  const image = 'ghcr.io/sieitzz/dgfy-pos';
  const { sightings, maxSeen } = probeExistingSightings({
    image,
    floor: '1.13.0',
    currentRevision: shaA,
    inspectFn: stubInspect({
      [`${image}:1.13.0-r1-staging`]: { status: 0, stdout: labelFixture(shaA), stderr: '' },
      [`${image}:1.13.0-r2-staging`]: { status: 0, stdout: labelFixture('b'.repeat(40)), stderr: '' },
    }),
  });
  assert.equal(maxSeen, 2);
  assert.deepEqual(sightings, [
    { tag: '1.13.0-r1-staging', revision: shaA },
    { tag: '1.13.0-r2-staging', revision: 'b'.repeat(40) },
  ]);
});

test('probeExistingSightings: an unclassified inspect failure throws fail-closed', () => {
  const image = 'ghcr.io/sieitzz/dgfy-pos';
  assert.throws(
    () => probeExistingSightings({
      image,
      floor: '1.13.0',
      currentRevision: 'a'.repeat(40),
      inspectFn: () => ({ status: 1, stdout: '', stderr: 'Error: 500 internal server error' }),
    }),
    /refusing to allocate blind/,
  );
});

test('probeExistingSightings: unreadable labels are kept with null revision, not dropped', () => {
  const image = 'ghcr.io/sieitzz/dgfy-api';
  const { sightings } = probeExistingSightings({
    image,
    floor: '1.13.0',
    currentRevision: 'a'.repeat(40),
    inspectFn: stubInspect({
      [`${image}:1.13.0-r1`]: { status: 0, stdout: JSON.stringify({ Image: { Config: { Labels: {} } } }), stderr: '' },
    }),
  });
  assert.deepEqual(sightings, [{ tag: '1.13.0-r1', revision: null }]);
});

test('allocateArtifactRevision: end-to-end probe plus allocation with an injected registry', () => {
  const shaA = 'a'.repeat(40);
  const image = 'ghcr.io/sieitzz/dgfy-ims';
  const fresh = allocateArtifactRevision({
    image,
    floor: '1.13.0',
    currentRevision: 'f'.repeat(40),
    inspectFn: stubInspect({
      [`${image}:1.13.0-r1-staging`]: { status: 0, stdout: labelFixture(shaA), stderr: '' },
    }),
  });
  assert.deepEqual(fresh, { revision: 2, reused: false, maxSeen: 1 });

  const retry = allocateArtifactRevision({
    image,
    floor: '1.13.0',
    currentRevision: shaA,
    inspectFn: stubInspect({
      [`${image}:1.13.0-r1-staging`]: { status: 0, stdout: labelFixture(shaA), stderr: '' },
    }),
  });
  assert.deepEqual(retry, { revision: 1, reused: true, maxSeen: 1 });
});

test('backend allocation: API reuses r1 while migration runner advances independently past foreign r1-r4 and reuses r5 on retry', () => {
  const candidateSha = 'a'.repeat(40);
  const api = allocateRevision({
    floor: '1.32.0', currentRevision: candidateSha,
    sightings: [{ tag: '1.32.0-r1', revision: candidateSha }],
  });
  const migrationSightings = [1, 2, 3, 4].map((revision) => ({
    tag: `1.21.0-r${revision}`,
    revision: `${revision}`.repeat(40),
  }));
  const migration = allocateRevision({ floor: '1.21.0', currentRevision: candidateSha, sightings: migrationSightings });
  const migrationRetry = allocateRevision({
    floor: '1.21.0', currentRevision: candidateSha,
    sightings: [...migrationSightings, { tag: '1.21.0-r5', revision: candidateSha }],
  });
  assert.deepEqual(api, { revision: 1, reused: true });
  assert.deepEqual(migration, { revision: 5, reused: false });
  assert.deepEqual(migrationRetry, { revision: 5, reused: true });
});

test('parseArgs: requires floor and revision; --tags-json is optional', () => {
  const options = parseArgs(['--image', 'ghcr.io/sieitzz/dgfy-pos', '--floor', '1.13.0', '--revision', 'a'.repeat(40)]);
  assert.equal(options.floor, '1.13.0');
  assert.equal(options.tagsJson, '');
  assert.throws(() => parseArgs(['--floor', '1.13.0']), /--revision is required/);
  assert.throws(() => parseArgs(['--revision', 'abc']), /--floor is required/);
  assert.throws(() => parseArgs(['--floor', '1.13.0', '--revision', 'abc', '--bogus']), /Unknown argument/);
});

test('probeExistingSightings: legacy DEV revisions are ignored', () => {
  const image = 'ghcr.io/sieitzz/dgfy-api';
  const { sightings } = probeExistingSightings({
    image,
    floor: '1.13.0',
    currentRevision: 'a'.repeat(40),
    inspectFn: stubInspect({
      [`${image}:1.13.0-r1-dev`]: { status: 0, stdout: labelFixture('b'.repeat(40)), stderr: '' },
      [`${image}:1.13.0-r2-staging`]: { status: 0, stdout: labelFixture('c'.repeat(40)), stderr: '' },
    }),
  });
  assert.deepEqual(sightings, []);
});
