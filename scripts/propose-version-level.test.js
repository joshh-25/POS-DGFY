const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { classifyCommitMessage, classifyVersionDelta, higherLevel, proposeVersionLevels } = require('./propose-version-level');

// --- git fixture harness, same shape as scripts/check-app-version-bump.test.js's -------

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return (result.stdout || '').trim();
}

function makeGitRepo() {
    const root = makeTempDir('propose-version-level-git-');
    runGit(root, ['init', '-q']);
    runGit(root, ['config', 'user.email', 'test@example.com']);
    runGit(root, ['config', 'user.name', 'Propose Version Level Test']);
    return root;
}

function writeFiles(root, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
}

// Commits a partial file map with the given Conventional-Commits-shaped message
// (subject + optional body/footer, passed verbatim via `-m`) and returns the SHA --
// distinct from check-app-version-bump.test.js's commitAll() in that message shape
// (and the ability to make several of these in sequence) is the point here: this
// script cares about *which* commits touch *which* app, not just the aggregate diff.
function commitFiles(root, message, files) {
    writeFiles(root, files);
    runGit(root, ['add', '-A']);
    runGit(root, ['commit', '-q', '-m', message]);
    return runGit(root, ['rev-parse', 'HEAD']);
}

function pkgJson(version, deps = {}) {
    return `${JSON.stringify({ name: 'fixture', version, dependencies: deps }, null, 2)}\n`;
}

// Mirrors the real repo's five apps and their file: fan-out, same fixture shape as
// check-app-version-bump.test.js's baseFixture().
function baseFixture(overrides = {}) {
    const versions = {
        'dgfy-api': '1.0.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
        ...overrides,
    };

    return {
        'apps/dgfy-api/package.json': pkgJson(versions['dgfy-api'], {
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
        }),
        'apps/dgfy-api/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-migration-runner/package.json': pkgJson(versions['dgfy-migration-runner'], {
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
        }),
        'apps/dgfy-migration-runner/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-ims/package.json': pkgJson(versions['dgfy-ims'], {
            '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        'apps/dgfy-ims/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-pos/package.json': pkgJson(versions['dgfy-pos'], {
            '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        'apps/dgfy-pos/src/index.js': 'module.exports = {};\n',
        'apps/dgfy-storefront/package.json': pkgJson(versions['dgfy-storefront'], {
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        'apps/dgfy-storefront/src/index.js': 'module.exports = {};\n',
        'packages/shared-constants/package.json': pkgJson('1.0.0'),
        'packages/shared-constants/index.js': 'module.exports = {};\n',
        'packages/pos-receipt/package.json': pkgJson('1.0.0'),
        'packages/pos-receipt/index.js': 'module.exports = {};\n',
        'packages/web-core/package.json': pkgJson('1.0.0'),
        'packages/web-core/index.js': 'module.exports = {};\n',
    };
}

// Builds a {root, baseGitRef} fixture from a base commit, letting each test append
// its own sequence of head commits via commitFiles(root, message, files).
function setupRepo(baseVersions = {}) {
    const root = makeGitRepo();
    writeFiles(root, baseFixture(baseVersions));
    runGit(root, ['add', '-A']);
    runGit(root, ['commit', '-q', '-m', 'chore: base fixture']);
    const baseGitRef = runGit(root, ['rev-parse', 'HEAD']);
    return { root, baseGitRef };
}

function findRow(result, app) {
    return result.rows.find((entry) => entry.app === app);
}

function cleanup(root) {
    fs.rmSync(root, { recursive: true, force: true });
}

// --- classifyCommitMessage / classifyVersionDelta / higherLevel (pure) ----------

test('classifyCommitMessage: a bare feat commit proposes minor', () => {
    const result = classifyCommitMessage('feat(pos): add split-tender checkout');
    assert.equal(result.type, 'feat');
    assert.equal(result.breaking, false);
    assert.equal(result.level, 'minor');
});

test('classifyCommitMessage: fix! proposes major via the bang', () => {
    const result = classifyCommitMessage('fix(api)!: drop the legacy /v1 auth header');
    assert.equal(result.type, 'fix');
    assert.equal(result.bang, true);
    assert.equal(result.level, 'major');
});

test('classifyCommitMessage: a BREAKING CHANGE footer proposes major regardless of type', () => {
    const message = 'fix(api): tighten tenant validation\n\nBREAKING CHANGE: rejects tenants missing a schema\n';
    const result = classifyCommitMessage(message);
    assert.equal(result.type, 'fix');
    assert.equal(result.bang, false);
    assert.equal(result.breakingFooter, true);
    assert.equal(result.level, 'major');
});

test('classifyCommitMessage: chore/docs/test types propose patch', () => {
    assert.equal(classifyCommitMessage('chore(deps): bump eslint').level, 'patch');
    assert.equal(classifyCommitMessage('docs(readme): fix typo').level, 'patch');
    assert.equal(classifyCommitMessage('test(pos): add checkout regression test').level, 'patch');
});

test('classifyCommitMessage: an unparseable subject defaults to patch, not a skip', () => {
    const result = classifyCommitMessage('quick fix for the thing');
    assert.equal(result.type, null);
    assert.equal(result.level, 'patch');
});

test('higherLevel: picks the higher rank, either side may be absent', () => {
    assert.equal(higherLevel('patch', 'minor'), 'minor');
    assert.equal(higherLevel('major', 'minor'), 'major');
    assert.equal(higherLevel(null, 'minor'), 'minor');
    assert.equal(higherLevel('patch', null), 'patch');
});

test('classifyVersionDelta: reports the highest differing component, or null when unparseable', () => {
    assert.equal(classifyVersionDelta('1.0.0', '2.0.0'), 'major');
    assert.equal(classifyVersionDelta('1.0.0', '1.1.0'), 'minor');
    assert.equal(classifyVersionDelta('1.0.0', '1.0.1'), 'patch');
    assert.equal(classifyVersionDelta('1.0.0', '1.0.0'), 'none');
    assert.equal(classifyVersionDelta('not-a-version', '1.0.0'), null);
    assert.equal(classifyVersionDelta(null, '1.0.0'), null);
});

// --- proposeVersionLevels: end-to-end against real git fixtures -----------------

test('a lone feat commit proposes minor for the app it touches', async () => {
    const { root, baseGitRef } = setupRepo();
    try {
        const headGitRef = commitFiles(root, 'feat(pos): add split-tender checkout', {
            'apps/dgfy-pos/src/index.js': 'module.exports = { splitTender: true };\n',
            'apps/dgfy-pos/package.json': pkgJson('1.1.0', {
                '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
                '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
                '@sieitzz/web-core': 'file:../../packages/web-core',
            }),
        });

        const result = await proposeVersionLevels({ repoRoot: root, baseGitRef, headGitRef });
        assert.equal(result.rows.length, 1);
        const pos = findRow(result, 'dgfy-pos');
        assert.equal(pos.proposedLevel, 'minor');
        assert.equal(pos.attributedCommits, 1);
        assert.equal(pos.actualBumpLevel, 'minor');
    } finally {
        cleanup(root);
    }
});

test('fix! proposes major', async () => {
    const { root, baseGitRef } = setupRepo();
    try {
        const headGitRef = commitFiles(root, 'fix(api)!: drop the legacy /v1 auth header', {
            'apps/dgfy-api/src/index.js': 'module.exports = { legacyAuth: false };\n',
            'apps/dgfy-api/package.json': pkgJson('2.0.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        });

        const result = await proposeVersionLevels({ repoRoot: root, baseGitRef, headGitRef });
        const api = findRow(result, 'dgfy-api');
        assert.equal(api.proposedLevel, 'major');
    } finally {
        cleanup(root);
    }
});

test('a BREAKING CHANGE footer proposes major even without a bang', async () => {
    const { root, baseGitRef } = setupRepo();
    try {
        const message = 'fix(api): tighten tenant validation\n\nBREAKING CHANGE: rejects tenants missing a schema\n';
        const headGitRef = commitFiles(root, message, {
            'apps/dgfy-api/src/index.js': 'module.exports = { strict: true };\n',
            'apps/dgfy-api/package.json': pkgJson('2.0.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        });

        const result = await proposeVersionLevels({ repoRoot: root, baseGitRef, headGitRef });
        const api = findRow(result, 'dgfy-api');
        assert.equal(api.proposedLevel, 'major');
    } finally {
        cleanup(root);
    }
});

test('only chore/docs/test commits propose patch', async () => {
    const { root, baseGitRef } = setupRepo();
    try {
        commitFiles(root, 'chore(ims): bump a dev dependency', {
            'apps/dgfy-ims/src/index.js': 'module.exports = { touched: 1 };\n',
        });
        const headGitRef = commitFiles(root, 'test(ims): add a regression test', {
            'apps/dgfy-ims/src/index.js': 'module.exports = { touched: 2 };\n',
            'apps/dgfy-ims/package.json': pkgJson('1.0.1', {
                '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
                '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
                '@sieitzz/web-core': 'file:../../packages/web-core',
            }),
        });

        const result = await proposeVersionLevels({ repoRoot: root, baseGitRef, headGitRef });
        const ims = findRow(result, 'dgfy-ims');
        assert.equal(ims.proposedLevel, 'patch');
        assert.equal(ims.attributedCommits, 2);
    } finally {
        cleanup(root);
    }
});

test('multiple commits touching one app take the highest proposed level', async () => {
    const { root, baseGitRef } = setupRepo();
    try {
        commitFiles(root, 'chore(storefront): tidy up imports', {
            'apps/dgfy-storefront/src/index.js': 'module.exports = { tidy: true };\n',
        });
        commitFiles(root, 'feat(storefront): add guest checkout', {
            'apps/dgfy-storefront/src/index.js': 'module.exports = { guestCheckout: true };\n',
        });
        const headGitRef = commitFiles(root, 'fix(storefront): correct the totals rounding', {
            'apps/dgfy-storefront/src/index.js': 'module.exports = { guestCheckout: true, rounding: "fixed" };\n',
            'apps/dgfy-storefront/package.json': pkgJson('1.1.0', {
                '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
                '@sieitzz/web-core': 'file:../../packages/web-core',
            }),
        });

        const result = await proposeVersionLevels({ repoRoot: root, baseGitRef, headGitRef });
        const storefront = findRow(result, 'dgfy-storefront');
        // chore -> patch, feat -> minor, fix -> patch: highest of the three is minor.
        assert.equal(storefront.proposedLevel, 'minor');
        assert.equal(storefront.attributedCommits, 3);
    } finally {
        cleanup(root);
    }
});

test('an app touched only via file: fan-out still gets a proposed level from the fan-out-triggering commit', async () => {
    const { root, baseGitRef } = setupRepo();
    try {
        // Only packages/web-core changes -- no commit touches apps/dgfy-ims/, apps/dgfy-pos/,
        // or apps/dgfy-storefront/ directly, but all three depend on web-core via `file:`.
        const headGitRef = commitFiles(root, 'feat(web-core): add a shared date-range picker', {
            'packages/web-core/index.js': 'module.exports = { DateRangePicker: true };\n',
        });

        const result = await proposeVersionLevels({ repoRoot: root, baseGitRef, headGitRef });
        const appNames = result.rows.map((row) => row.app).sort();
        assert.deepEqual(appNames, ['dgfy-ims', 'dgfy-pos', 'dgfy-storefront']);
        for (const row of result.rows) {
            assert.equal(row.reason, 'fan-out:packages/web-core');
            assert.equal(row.proposedLevel, 'minor');
            assert.equal(row.attributedCommits, 1);
        }
    } finally {
        cleanup(root);
    }
});

test('no apps changed: empty table, and the CLI exits 0', async () => {
    const { root, baseGitRef } = setupRepo();
    try {
        const headGitRef = commitFiles(root, 'docs: update the README', {
            'README.md': 'unrelated change\n',
        });

        const result = await proposeVersionLevels({ repoRoot: root, baseGitRef, headGitRef });
        assert.deepEqual(result.rows, []);

        const cliPath = path.join(__dirname, 'propose-version-level.js');
        const cli = spawnSync('node', [cliPath, '--base', baseGitRef, '--head', headGitRef], { cwd: root, encoding: 'utf8' });
        assert.equal(cli.status, 0, cli.stderr || cli.stdout);
        assert.match(cli.stdout, /No changed apps in this range/);
    } finally {
        cleanup(root);
    }
});

test('proposeVersionLevels requires --base', async () => {
    // #1809 (Phase 324): proposeVersionLevels() is now async -- its early `throw` (before any
    // `await`) surfaces as a rejected Promise, not a synchronous throw, so this needs
    // assert.rejects rather than assert.throws. Same assertion, mechanical migration only.
    await assert.rejects(
        () => proposeVersionLevels({ repoRoot: process.cwd() }),
        /requires options\.baseGitRef/,
    );
});
