const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ImageAliasError,
  readAgreedLabel,
  resolveAliasTargetState,
  decideImageAlias,
  inspectAliasSource,
  inspectAliasTarget,
  parseArgs,
  RELEASE_FLOOR_LABEL,
  RELEASE_REVISION_LABEL,
} = require('./promote-image-alias');

// Issue #1977 (Phase 342) -- digest-based alias promotion. Every case here injects canned
// `docker buildx imagetools inspect` fixtures; none of these tests shell out to `docker`
// or touch a real registry.

const labelsFixture = (labels) => ({
  status: 0,
  stdout: JSON.stringify({ digest: 'sha256:abc123', Image: { Config: { Labels: labels } } }),
  stderr: '',
});

const sourceLabels = {
  'org.opencontainers.image.version': '1.13.0-r16',
  [RELEASE_FLOOR_LABEL]: '1.13.0',
  [RELEASE_REVISION_LABEL]: 'r16',
};

test('resolveAliasTargetState: absent target -> create path', () => {
  assert.deepEqual(
    resolveAliasTargetState({ sourceDigest: 'sha256:a', sourceRevision: 'r16', targetDigest: null, targetRevision: null }),
    { state: 'absent' },
  );
});

test('resolveAliasTargetState: identical digest+revision -> identical', () => {
  assert.deepEqual(
    resolveAliasTargetState({ sourceDigest: 'sha256:a', sourceRevision: 'r16', targetDigest: 'sha256:a', targetRevision: 'r16' }),
    { state: 'identical' },
  );
});

test('resolveAliasTargetState: existing target with a different digest -> digest-mismatch (refuse)', () => {
  assert.deepEqual(
    resolveAliasTargetState({ sourceDigest: 'sha256:a', sourceRevision: 'r16', targetDigest: 'sha256:b', targetRevision: 'r16' }),
    { state: 'digest-mismatch' },
  );
});

test('resolveAliasTargetState: same digest but different revision -> revision-mismatch (refuse)', () => {
  assert.deepEqual(
    resolveAliasTargetState({ sourceDigest: 'sha256:a', sourceRevision: 'r16', targetDigest: 'sha256:a', targetRevision: 'r15' }),
    { state: 'revision-mismatch' },
  );
  assert.deepEqual(
    resolveAliasTargetState({ sourceDigest: 'sha256:a', sourceRevision: 'r16', targetDigest: 'sha256:a', targetRevision: null }),
    { state: 'revision-mismatch' },
  );
});

test('decideImageAlias: absent target -> create', () => {
  const decision = decideImageAlias({
    source: { ref: 'img:1.13.0-r16', state: 'ok', digest: 'sha256:a', floor: '1.13.0', revision: 'r16' },
    target: { ref: 'img:1.13.0', state: 'absent' },
  });
  assert.equal(decision.verdict, 'create');
});

test('decideImageAlias: already-identical target -> skip (idempotent re-dispatch)', () => {
  const decision = decideImageAlias({
    source: { ref: 'img:1.13.0-r16', state: 'ok', digest: 'sha256:a', floor: '1.13.0', revision: 'r16' },
    target: { ref: 'img:1.13.0', state: 'ok', digest: 'sha256:a', revision: 'r16' },
  });
  assert.equal(decision.verdict, 'skip');
});

test('decideImageAlias: existing alias with a different digest -> refuse (fail closed)', () => {
  const decision = decideImageAlias({
    source: { ref: 'img:1.13.0-r16', state: 'ok', digest: 'sha256:a', floor: '1.13.0', revision: 'r16' },
    target: { ref: 'img:1.13.0', state: 'ok', digest: 'sha256:b', revision: 'r16' },
  });
  assert.equal(decision.verdict, 'refuse');
  assert.equal(decision.code, 'target-digest-mismatch');
});

test('decideImageAlias: same digest but conflicting revision label -> refuse', () => {
  const decision = decideImageAlias({
    source: { ref: 'img:1.13.0-r16', state: 'ok', digest: 'sha256:a', floor: '1.13.0', revision: 'r16' },
    target: { ref: 'img:1.13.0', state: 'ok', digest: 'sha256:a', revision: 'r15' },
  });
  assert.equal(decision.verdict, 'refuse');
  assert.equal(decision.code, 'target-revision-mismatch');
});

test('decideImageAlias: missing source or inspect errors never alias', () => {
  assert.equal(decideImageAlias({ source: { ref: 's', state: 'not-found', reason: 'x' }, target: { ref: 't', state: 'absent' } }).verdict, 'error');
  assert.equal(decideImageAlias({ source: { ref: 's', state: 'error', reason: 'x' }, target: { ref: 't', state: 'absent' } }).verdict, 'error');
  assert.equal(decideImageAlias({
    source: { ref: 's', state: 'ok', digest: 'sha256:a', floor: '1.13.0', revision: 'r16' },
    target: { ref: 't', state: 'error', reason: 'registry hiccup' },
  }).verdict, 'error');
});

test('readAgreedLabel: agree / none / unreadable split', () => {
  assert.deepEqual(readAgreedLabel({ Image: { Config: { Labels: { [RELEASE_REVISION_LABEL]: 'r16' } } } }, RELEASE_REVISION_LABEL), { status: 'agree', value: 'r16' });
  assert.deepEqual(readAgreedLabel({ Image: { Config: { Labels: {} } } }, RELEASE_REVISION_LABEL), { status: 'none', found: [] });
});

test('inspectAliasSource: labeled source extracts digest+floor+revision', () => {
  const source = inspectAliasSource({ ref: 'img:1.13.0-r16', inspectFn: () => labelsFixture(sourceLabels) });
  assert.equal(source.state, 'ok');
  assert.equal(source.digest, 'sha256:abc123');
  assert.equal(source.floor, '1.13.0');
  assert.equal(source.revision, 'r16');
});

test('inspectAliasSource: unlabeled source refuses (no floor/revision proof)', () => {
  const source = inspectAliasSource({ ref: 'img:1.13.0-r16', inspectFn: () => labelsFixture({}) });
  assert.equal(source.state, 'error');
});

test('inspectAliasSource: historical tag without the new labels refuses rather than guessing', () => {
  const source = inspectAliasSource({
    ref: 'img:1.12.0',
    inspectFn: () => labelsFixture({ 'org.opencontainers.image.version': '1.12.0' }),
  });
  assert.equal(source.state, 'error');
});

test('inspectAliasSource: missing source tag is not-found (nothing to alias)', () => {
  const source = inspectAliasSource({
    ref: 'img:1.13.0-r16',
    inspectFn: () => ({ status: 1, stdout: '', stderr: 'ERROR: manifest unknown' }),
  });
  assert.equal(source.state, 'not-found');
});

test('inspectAliasTarget: absent vs identical', () => {
  const absent = inspectAliasTarget({
    ref: 'img:1.13.0',
    inspectFn: () => ({ status: 1, stdout: '', stderr: 'not found' }),
  });
  assert.equal(absent.state, 'absent');
  const present = inspectAliasTarget({ ref: 'img:1.13.0', inspectFn: () => labelsFixture(sourceLabels) });
  assert.equal(present.state, 'ok');
  assert.equal(present.digest, 'sha256:abc123');
  assert.equal(present.revision, 'r16');
});

test('parseArgs: source and target required', () => {
  assert.equal(parseArgs(['--source', 'img:1.13.0-r16', '--target', 'img:1.13.0']).source, 'img:1.13.0-r16');
  assert.throws(() => parseArgs(['--source', 'img:x']), ImageAliasError);
  assert.throws(() => parseArgs(['--bogus']), ImageAliasError);
});
