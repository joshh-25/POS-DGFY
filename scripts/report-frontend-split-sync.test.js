const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mapPrefix,
  classifyPath,
  classifyDiff,
  formatReport,
  formatPostMergeReport,
  formatFixReport,
  hasActionRequired,
  parseArgs,
  RETIRED_ROOT_PREFIXES,
} = require('./report-frontend-split-sync');

function makeManifest(overrides = {}) {
  return {
    prefixMap: [
      { old: 'apps/dgfy-web/src/', new: 'packages/web-core/src/' },
      { old: 'apps/dgfy-web/Components/', new: 'packages/web-core/Components/' },
    ],
    specialCases: [{ old: 'apps/dgfy-web/src/main.jsx', new: 'apps/dgfy-ims/src/main.jsx' }],
    retired: ['apps/dgfy-web/vite.config.js'],
    consumerPathPatterns: [/^\.github\/workflows\/deploy-frontend\.yml$/, /^scripts\/deploy\.sh$/],
    ...overrides,
  };
}

test('mapPrefix prefers a special case over a prefix match', () => {
  const manifest = makeManifest();
  assert.equal(mapPrefix('apps/dgfy-web/src/main.jsx', manifest), 'apps/dgfy-ims/src/main.jsx');
});

test('mapPrefix applies the longest matching prefix', () => {
  const manifest = makeManifest();
  assert.equal(
    mapPrefix('apps/dgfy-web/src/features/pos/pages/TerminalPage.jsx', manifest),
    'packages/web-core/src/features/pos/pages/TerminalPage.jsx'
  );
});

test('mapPrefix returns null for unmapped paths', () => {
  const manifest = makeManifest();
  assert.equal(mapPrefix('apps/dgfy-api/src/index.js', manifest), null);
});

test('classifyPath flags a new file under an unmapped legacy path as unmapped-new', () => {
  const manifest = makeManifest({ prefixMap: [], specialCases: [] });
  const result = classifyPath('apps/dgfy-web/src/features/new-thing.js', manifest, 'A');
  assert.equal(result.category, 'unmapped-new');
});

test('classifyPath flags a modified file under an unmapped legacy path as unmapped', () => {
  const manifest = makeManifest({ prefixMap: [], specialCases: [] });
  const result = classifyPath('apps/dgfy-web/src/features/existing-thing.js', manifest, 'M');
  assert.equal(result.category, 'unmapped');
});

test('classifyPath resolves mapped paths with their destination', () => {
  const manifest = makeManifest();
  const result = classifyPath('apps/dgfy-web/Components/ui/button.jsx', manifest, 'M');
  assert.equal(result.category, 'mapped');
  assert.equal(result.mappedTo, 'packages/web-core/Components/ui/button.jsx');
});

test('classifyPath flags consumer files by pattern', () => {
  const manifest = makeManifest();
  const result = classifyPath('scripts/deploy.sh', manifest, 'M');
  assert.equal(result.category, 'consumer');
});

test('classifyPath flags retired files', () => {
  const manifest = makeManifest();
  const result = classifyPath('apps/dgfy-web/vite.config.js', manifest, 'M');
  assert.equal(result.category, 'retired');
});

test('classifyPath treats unrelated paths as unrelated', () => {
  const manifest = makeManifest();
  const result = classifyPath('apps/dgfy-api/src/routes/items.js', manifest, 'M');
  assert.equal(result.category, 'unrelated');
});

test('classifyDiff groups mixed entries and hasActionRequired reflects unmapped items', () => {
  const manifest = makeManifest({ prefixMap: [], specialCases: [] });
  const entries = [
    { status: 'A', path: 'apps/dgfy-web/src/features/new-thing.js' },
    { status: 'M', path: 'apps/dgfy-api/src/index.js' },
    { status: 'M', path: 'scripts/deploy.sh' },
  ];
  const grouped = classifyDiff(entries, manifest);
  assert.equal(grouped['unmapped-new'].length, 1);
  assert.equal(grouped.unrelated.length, 1);
  assert.equal(grouped.consumer.length, 1);
  assert.equal(hasActionRequired(grouped), true);
});

test('hasActionRequired is false when only mapped/consumer/unrelated changes exist', () => {
  const manifest = makeManifest();
  const entries = [
    { status: 'M', path: 'apps/dgfy-web/src/services/api.js' },
    { status: 'M', path: 'scripts/deploy.sh' },
  ];
  const grouped = classifyDiff(entries, manifest);
  assert.equal(hasActionRequired(grouped), false);
});

test('formatReport includes a summary line with all counts', () => {
  const manifest = makeManifest();
  const grouped = classifyDiff(
    [
      { status: 'M', path: 'apps/dgfy-web/src/services/api.js' },
      { status: 'M', path: 'apps/dgfy-api/src/index.js' },
    ],
    manifest
  );
  const report = formatReport(grouped);
  assert.match(report, /Summary: 1 mapped/);
});

test('formatPostMergeReport reports clean when nothing resurrected', () => {
  assert.match(formatPostMergeReport([]), /clean/);
});

test('formatPostMergeReport lists resurrected files with their mapped destination', () => {
  const report = formatPostMergeReport([
    { path: 'apps/dgfy-web/src/services/api.js', mappedTo: 'packages/web-core/src/services/api.js' },
  ]);
  assert.match(report, /apps\/dgfy-web\/src\/services\/api\.js/);
  assert.match(report, /packages\/web-core\/src\/services\/api\.js/);
});

test('parseArgs reads flags and defaults', () => {
  const options = parseArgs(['--base', 'HEAD~5', '--strict', '--post-merge']);
  assert.equal(options.base, 'HEAD~5');
  assert.equal(options.strict, true);
  assert.equal(options.postMerge, true);
  assert.equal(options.head, 'origin/develop');
  assert.equal(options.fix, false);
});

test('parseArgs reads --fix', () => {
  const options = parseArgs(['--post-merge', '--fix']);
  assert.equal(options.postMerge, true);
  assert.equal(options.fix, true);
});

test('RETIRED_ROOT_PREFIXES covers all three retired frontend/backend roots (issue #914)', () => {
  assert.deepEqual(RETIRED_ROOT_PREFIXES, ['apps/dgfy-web/', 'frontend/', 'backend/']);
});

test('formatFixReport reports nothing-to-fix when both lists are empty', () => {
  assert.match(formatFixReport({ moved: [], skipped: [] }), /nothing to fix/);
});

test('formatFixReport lists moved files with their destination and skipped files with a manual-placement note', () => {
  const report = formatFixReport({
    moved: [{ path: 'apps/dgfy-web/src/services/api.js', mappedTo: 'packages/web-core/src/services/api.js' }],
    skipped: [{ path: 'frontend/src/weird/Thing.js', mappedTo: null }],
  });
  assert.match(report, /moved {2}apps\/dgfy-web\/src\/services\/api\.js/);
  assert.match(report, /packages\/web-core\/src\/services\/api\.js/);
  assert.match(report, /SKIP {3}frontend\/src\/weird\/Thing\.js \(no mapping - place by hand\)/);
  assert.match(report, /1 moved, 1 needs manual placement/);
});
