const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, COMPONENTS } = require('./integrate-prs.js');

test('parseArgs collects PR numbers and options', () => {
    const { prNumbers, opts } = parseArgs(['401', '405', '407', '--build', '--test']);
    assert.deepEqual(prNumbers, [401, 405, 407]);
    assert.equal(opts.build, true);
    assert.equal(opts.test, true);
    assert.equal(opts.base, 'develop');
    assert.equal(opts.keep, false);
});

test('parseArgs respects --base override', () => {
    const { opts } = parseArgs(['1', '2', '--base', 'staging']);
    assert.equal(opts.base, 'staging');
});

test('parseArgs rejects a single PR number', () => {
    assert.throws(() => parseArgs(['401']), /at least 2/);
});

test('parseArgs rejects an unrecognized argument', () => {
    assert.throws(() => parseArgs(['401', '405', '--bogus']), /Unrecognized argument/);
});

test('component path regexes match the same directories shared-changed-paths.yml gates on', () => {
    const ims = COMPONENTS.find((c) => c.name === 'dgfy-ims');
    const pos = COMPONENTS.find((c) => c.name === 'dgfy-pos');
    const storefront = COMPONENTS.find((c) => c.name === 'dgfy-storefront');
    const api = COMPONENTS.find((c) => c.name === 'dgfy-api');
    const migrationRunner = COMPONENTS.find((c) => c.name === 'migration-runner');

    assert.equal(ims.pathRegex.test('apps/dgfy-ims/src/App.jsx'), true);
    assert.equal(ims.pathRegex.test('packages/pos-receipt/src/index.js'), true);
    assert.equal(ims.pathRegex.test('packages/web-core/src/index.js'), true);
    assert.equal(ims.pathRegex.test('apps/dgfy-api/src/index.js'), false);

    assert.equal(pos.pathRegex.test('apps/dgfy-pos/src/App.jsx'), true);
    assert.equal(pos.pathRegex.test('packages/pos-receipt/src/index.js'), true);
    assert.equal(pos.pathRegex.test('apps/dgfy-ims/src/App.jsx'), false);

    assert.equal(storefront.pathRegex.test('apps/dgfy-storefront/src/App.jsx'), true);
    assert.equal(storefront.pathRegex.test('packages/pos-receipt/src/index.js'), false);
    assert.equal(storefront.pathRegex.test('packages/web-core/src/index.js'), true);

    assert.equal(api.pathRegex.test('apps/dgfy-api/src/index.js'), true);
    assert.equal(api.pathRegex.test('packages/shared-constants/index.js'), true);
    assert.equal(api.pathRegex.test('apps/dgfy-ims/src/App.jsx'), false);

    assert.equal(migrationRunner.pathRegex.test('apps/dgfy-migration-runner/index.js'), true);
    assert.equal(migrationRunner.pathRegex.test('apps/dgfy-api/src/index.js'), false);
});
