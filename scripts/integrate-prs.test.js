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
    const frontend = COMPONENTS.find((c) => c.name === 'frontend');
    const api = COMPONENTS.find((c) => c.name === 'dgfy-api');
    const migrationRunner = COMPONENTS.find((c) => c.name === 'migration-runner');

    assert.equal(frontend.pathRegex.test('apps/dgfy-web/src/App.jsx'), true);
    assert.equal(frontend.pathRegex.test('packages/pos-receipt/src/index.js'), true);
    assert.equal(frontend.pathRegex.test('apps/dgfy-api/src/index.js'), false);

    assert.equal(api.pathRegex.test('apps/dgfy-api/src/index.js'), true);
    assert.equal(api.pathRegex.test('packages/shared-constants/index.js'), true);
    assert.equal(api.pathRegex.test('apps/dgfy-web/src/App.jsx'), false);

    assert.equal(migrationRunner.pathRegex.test('apps/dgfy-migration-runner/index.js'), true);
    assert.equal(migrationRunner.pathRegex.test('apps/dgfy-api/src/index.js'), false);
});
