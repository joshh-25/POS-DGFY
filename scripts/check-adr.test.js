const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readAdrs, validate, buildIndex, countTiers } = require('./check-adr');

const makeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'adr-lint-'));

const FULL_FM = {
  status: 'accepted',
  authority_level: 'authoritative',
  owner: 'architecture',
  date: '2026-05-01',
  last_reviewed: '2026-05-01',
  review_by: '2026-11-01',
  applies_to: 'architecture_decision',
  topic: 'example_topic'
};

const writeAdr = (dir, file, overrides = {}, body = '## Decision\n\n1. Do the thing.\n') => {
  const fm = { ...FULL_FM, ...overrides };
  const keys = Object.keys(fm).filter((k) => fm[k] !== undefined);
  const block = keys.map((k) => `${k}: ${fm[k]}`).join('\n');
  const title = `# ADR ${file.slice(0, 4)}: Example\n\n`;
  fs.writeFileSync(path.join(dir, file), `---\n${block}\n---\n\n${title}${body}`);
};

const check = (dir) => validate(readAdrs(dir), dir);

test('a conforming corpus produces no errors', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md');
  writeAdr(dir, '0002-beta.md', { topic: 'other_topic' });
  assert.deepEqual(check(dir), []);
});

test('duplicate ADR numbers are reported', () => {
  const dir = makeDir();
  writeAdr(dir, '0010-alpha.md', { topic: 'a' });
  writeAdr(dir, '0010-beta.md', { topic: 'b' });
  const errors = check(dir);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ADR number 0010 is used by 2 live ADRs/);
});

test('a collision stub does not count as a live ADR', () => {
  const dir = makeDir();
  writeAdr(dir, '0010-alpha.md', { topic: 'a' });
  writeAdr(dir, '0010-beta.md', { status: 'moved', moved_to: '0040-beta.md' });
  writeAdr(dir, '0040-beta.md', { topic: 'b' });
  assert.deepEqual(check(dir), []);
});

test('a stub pointing at a missing target is reported', () => {
  const dir = makeDir();
  writeAdr(dir, '0010-beta.md', { status: 'moved', moved_to: '0099-gone.md' });
  assert.match(check(dir).join('\n'), /moved_to target "0099-gone\.md" does not exist/);
});

test('missing front matter is reported', () => {
  const dir = makeDir();
  fs.writeFileSync(path.join(dir, '0001-alpha.md'), '# ADR 0001: No front matter\n');
  assert.match(check(dir).join('\n'), /0001-alpha\.md: missing front matter/);
});

test('each required front matter key is reported when absent', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md', { owner: undefined, review_by: undefined });
  const errors = check(dir).join('\n');
  assert.match(errors, /missing front matter key "owner"/);
  assert.match(errors, /missing front matter key "review_by"/);
});

test('an unknown lifecycle status is reported', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md', { status: 'authoritative' });
  assert.match(check(dir).join('\n'), /status "authoritative" is not one of/);
});

test('superseded requires a resolvable superseded_by', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md', { status: 'superseded' });
  assert.match(check(dir).join('\n'), /status "superseded" requires superseded_by/);

  const dir2 = makeDir();
  writeAdr(dir2, '0001-alpha.md', { status: 'superseded', superseded_by: '0002-nope.md' });
  assert.match(check(dir2).join('\n'), /superseded_by target "0002-nope\.md" does not exist/);

  const dir3 = makeDir();
  writeAdr(dir3, '0001-alpha.md', { status: 'superseded', superseded_by: '0002-beta.md' });
  writeAdr(dir3, '0002-beta.md', { topic: 'other' });
  assert.deepEqual(check(dir3), []);
});

test('retired requires a retired_reason', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md', { status: 'retired' });
  assert.match(check(dir).join('\n'), /status "retired" requires retired_reason/);
});

test('malformed dates are reported', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md', { review_by: 'Nov 2026' });
  assert.match(check(dir).join('\n'), /review_by must be YYYY-MM-DD, got "Nov 2026"/);
});

test('an unknown strictness tier is reported', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md', {}, '## Decision\n\n1. Do the thing. `[mandatory]`\n');
  assert.match(check(dir).join('\n'), /unknown strictness tier "\[mandatory]"/);
});

test('two in-force ADRs cannot both hold binding clauses on one topic', () => {
  const dir = makeDir();
  const binding = '## Decision\n\n1. Own the thing. `[binding]`\n';
  writeAdr(dir, '0001-alpha.md', { topic: 'stock_truth' }, binding);
  writeAdr(dir, '0002-beta.md', { topic: 'stock_truth' }, binding);
  assert.match(check(dir).join('\n'), /Topic "stock_truth" has binding clauses in multiple in-force ADRs/);
});

test('a superseded ADR does not contend for topic ownership', () => {
  const dir = makeDir();
  const binding = '## Decision\n\n1. Own the thing. `[binding]`\n';
  writeAdr(dir, '0001-alpha.md', { topic: 'stock_truth' }, binding);
  writeAdr(dir, '0002-beta.md', {
    topic: 'stock_truth', status: 'superseded', superseded_by: '0001-alpha.md'
  }, binding);
  assert.deepEqual(check(dir), []);
});

test('proposed ADRs bind nothing, so they do not contend either', () => {
  const dir = makeDir();
  const binding = '## Decision\n\n1. Own the thing. `[binding]`\n';
  writeAdr(dir, '0001-alpha.md', { topic: 'stock_truth' }, binding);
  writeAdr(dir, '0002-beta.md', { topic: 'stock_truth', status: 'proposed' }, binding);
  assert.deepEqual(check(dir), []);
});

test('countTiers counts each tier independently', () => {
  const counts = countTiers('a `[binding]` b `[binding]` c `[default]` d `[snapshot]`');
  assert.deepEqual(counts, { binding: 2, default: 1, snapshot: 1 });
});

test('the index flags a passed review_by only when binding clauses exist', () => {
  const dir = makeDir();
  writeAdr(dir, '0001-alpha.md', { review_by: '2026-01-01', topic: 'a' },
    '## Decision\n\n1. Own it. `[binding]`\n');
  writeAdr(dir, '0002-beta.md', { review_by: '2026-01-01', topic: 'b' },
    '## Decision\n\n1. Prefer it. `[default]`\n');
  const index = buildIndex(readAdrs(dir), '2026-07-29');
  const alpha = index.split('\n').find((l) => l.includes('0001-alpha.md'));
  const beta = index.split('\n').find((l) => l.includes('0002-beta.md'));
  assert.match(alpha, /:warning:/);
  assert.doesNotMatch(beta, /:warning:/);
});

test('the index lists renumbered stubs separately from live ADRs', () => {
  const dir = makeDir();
  writeAdr(dir, '0040-beta.md', { topic: 'b' });
  writeAdr(dir, '0010-beta.md', { status: 'moved', moved_to: '0040-beta.md' });
  const index = buildIndex(readAdrs(dir), '2026-07-29');
  const [live, stubs] = index.split('## Renumbered (collision stubs)');
  assert.doesNotMatch(live, /0010-beta\.md/);
  assert.match(stubs, /0010-beta\.md/);
});
