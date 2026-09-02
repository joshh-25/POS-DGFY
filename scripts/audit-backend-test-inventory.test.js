const test = require('node:test');
const assert = require('node:assert/strict');

const {
  listTestFiles,
  loadManifest,
  loadOverrides,
  buildInventory,
  parseArgs,
} = require('./audit-backend-test-inventory');

test('parseArgs recognizes --write, --check, --jest-json (repeatable), --heap-log, --measurement-label, --print-files', () => {
  const args = parseArgs([
    '--write',
    '--jest-json', 'a.json',
    '--jest-json', 'b.json',
    '--heap-log', 'heap.log',
    '--measurement-label', 'before@abc',
    '--print-files', 'fast',
  ]);
  assert.equal(args.write, true);
  assert.equal(args.check, false);
  assert.deepEqual(args.jestJson, ['a.json', 'b.json']);
  assert.equal(args.heapLog, 'heap.log');
  assert.equal(args.measurementLabel, 'before@abc');
  assert.equal(args.printFiles, 'fast');
});

test('listTestFiles excludes .legacy.test.js and only includes tests/*.test.js', () => {
  const files = listTestFiles();
  assert.ok(files.length > 0);
  files.forEach((f) => {
    assert.match(f, /^tests\/.+\.test\.js$/);
    assert.ok(!f.endsWith('.legacy.test.js'), `${f} should have been excluded`);
  });
});

test('the db manifest has no stale entries against the active file list', () => {
  const files = new Set(listTestFiles());
  const manifest = loadManifest();
  manifest.forEach((entry) => {
    assert.ok(files.has(entry), `manifest entry ${entry} no longer exists as an active test file`);
  });
});

test('overrides has no stale entries outside delete/consolidate against the active file list', () => {
  const files = new Set(listTestFiles());
  const overrides = loadOverrides();
  Object.entries(overrides).forEach(([entry, override]) => {
    if (override.classification === 'delete' || override.classification === 'consolidate') return;
    assert.ok(files.has(entry), `override entry ${entry} no longer exists as an active test file`);
  });
});

test('buildInventory produces one entry per active test file with a classification', () => {
  const inventory = buildInventory();
  const files = listTestFiles();
  assert.equal(inventory.totalFiles, files.length);
  assert.equal(inventory.files.length, files.length);
  inventory.files.forEach((entry) => {
    assert.ok(['keep', 'consolidate', 'trim', 'delete', 'demote'].includes(entry.classification), `unexpected classification ${entry.classification} for ${entry.path}`);
    assert.ok(entry.reason && entry.reason.length > 0, `${entry.path} has no reason`);
  });
});

test('every db-manifest member classifies as keep or an explicit override', () => {
  const inventory = buildInventory();
  const overrides = loadOverrides();
  inventory.files.filter((f) => f.onDbManifest).forEach((f) => {
    if (overrides[f.path]) return; // explicit override wins, e.g. a demotion
    assert.equal(f.classification, 'keep', `db-manifest member ${f.path} should classify as keep by default (R1 pin)`);
  });
});

test('a hardcoded-citation file is pinned to keep unless explicitly overridden', () => {
  const inventory = buildInventory();
  const overrides = loadOverrides();
  inventory.files.filter((f) => f.citations.hardcoded.length > 0).forEach((f) => {
    if (overrides[f.path]) return;
    assert.equal(f.classification, 'keep', `${f.path} is cited by a hardcoded reference and should be kept`);
  });
});

test('deletion-override files are either still classified delete, or already applied (removed)', () => {
  const inventory = buildInventory();
  const overrides = loadOverrides();
  const byPath = new Map(inventory.files.map((f) => [f.path, f]));
  Object.entries(overrides).forEach(([entryPath, override]) => {
    if (override.classification !== 'delete') return;
    const entry = byPath.get(entryPath);
    if (!entry) return; // already applied -- the file was removed for real
    assert.equal(entry.classification, 'delete');
    assert.equal(entry.reason, override.reason);
    assert.equal(entry.rule, 'R0-override');
  });
});

test('consolidate-override files are either still present with a mergeInto target, or already applied (removed)', () => {
  const inventory = buildInventory();
  const overrides = loadOverrides();
  const files = new Set(listTestFiles());
  const byPath = new Map(inventory.files.map((f) => [f.path, f]));
  Object.entries(overrides).forEach(([entryPath, override]) => {
    if (override.classification !== 'consolidate') return;
    assert.ok(override.mergeInto, `${entryPath} is a consolidate override with no mergeInto target`);
    assert.ok(files.has(override.mergeInto), `${entryPath}'s mergeInto target ${override.mergeInto} does not exist`);
    const entry = byPath.get(entryPath);
    if (!entry) return; // already applied -- the source file was folded in and removed
    assert.equal(entry.classification, 'consolidate');
  });
});

test('buildInventory is deterministic across two runs (ignoring generatedAt)', () => {
  const a = buildInventory();
  const b = buildInventory();
  const strip = (inv) => JSON.stringify({ ...inv, generatedAt: null });
  assert.equal(strip(a), strip(b));
});
