const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { runCheck, runFloor } = require('./check-app-version-bump');

// --- git fixture harness, same shape as scripts/check-compat-seams.test.js's ------

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return (result.stdout || '').trim();
}

function makeGitRepo() {
    const root = makeTempDir('app-version-bump-git-');
    runGit(root, ['init', '-q']);
    runGit(root, ['config', 'user.email', 'test@example.com']);
    runGit(root, ['config', 'user.name', 'App Version Bump Test']);
    return root;
}

function writeFiles(root, files) {
    for (const [relativePath, content] of Object.entries(files)) {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }
}

function commitAll(root, message) {
    runGit(root, ['add', '-A']);
    runGit(root, ['commit', '-q', '-m', message]);
    return runGit(root, ['rev-parse', 'HEAD']);
}

function pkgJson(version, deps = {}) {
    return `${JSON.stringify({ name: 'fixture', version, dependencies: deps }, null, 2)}\n`;
}

// Mirrors the real repo's five apps and their file: fan-out (apps/*/package.json,
// confirmed live): shared-constants -> all five, web-core -> ims/pos/storefront,
// pos-receipt -> ims/pos.
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

// Builds a {root, baseGitRef, headGitRef} fixture: an initial commit from
// baseFixture() (optionally version-overridden), then a second commit applying
// `headFiles` (a partial file map -- only entries that change need listing).
function setupScenario({ baseVersions = {}, headFiles = {} } = {}) {
    const root = makeGitRepo();
    writeFiles(root, baseFixture(baseVersions));
    const baseGitRef = commitAll(root, 'base');
    writeFiles(root, headFiles);
    const headGitRef = commitAll(root, 'head');
    return { root, baseGitRef, headGitRef };
}

function findApp(result, app) {
    return result.appResults.find((entry) => entry.app === app);
}

// --- no apps changed --------------------------------------------------------

test('no apps changed: skips cleanly', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: { 'README.md': 'unrelated change\n' },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, true);
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'no-app-changed');
        assert.deepEqual(result.appResults, []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- develop mode (any-increase) --------------------------------------------

test('develop: one app changed with a correct bump passes', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.0.1', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, true);
        assert.equal(result.mode, 'any-increase');
        assert.equal(result.appResults.length, 1);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.reason, 'direct');
        assert.equal(api.ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: one app changed with no bump fails', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: { 'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n' },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.ok, false);
        assert.equal(api.code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: packages/shared-constants change fans out to all five apps', () => {
    // Only the shared package changes -- no app bumps its own version here -- so this
    // isolates fan-out *detection* (all 5 apps flagged as changed via the dependency
    // map read from their own package.json, not a hardcoded list) from the separate
    // question of whether any given app's bump then satisfies the mode. Every app
    // correctly fails here, since none actually bumped -- matching the issue's own
    // rule that a file: dependency change obligates every dependent app to bump too.
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: { 'packages/shared-constants/index.js': 'module.exports = { changed: true };\n' },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        assert.equal(result.appResults.length, 5);
        const appNames = result.appResults.map((entry) => entry.app).sort();
        assert.deepEqual(appNames, ['dgfy-api', 'dgfy-ims', 'dgfy-migration-runner', 'dgfy-pos', 'dgfy-storefront']);
        for (const entry of result.appResults) {
            assert.equal(entry.reason, 'fan-out:packages/shared-constants');
            assert.equal(entry.ok, false);
            assert.equal(entry.code, 'insufficient-bump');
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: unparseable head version fails with a clear message', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('not-a-version', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.code, 'unparseable-head');
        assert.match(api.detail, /not a parseable X\.Y\.Z semver/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop: a version that changed but decreased fails', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.1.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'develop', headBranchName: 'feature/x',
        });
        assert.equal(result.ok, false);
        const api = findApp(result, 'dgfy-api');
        assert.equal(api.code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- staging mode: to-staging/* -> minor-floor ------------------------------

test('staging <- to-staging/*: a patch-only bump fails the minor floor', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.2.1', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'to-staging/2026-09-04-01',
        });
        assert.equal(result.mode, 'minor-floor');
        assert.equal(result.ok, false);
        assert.equal(findApp(result, 'dgfy-api').code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('staging <- to-staging/*: a minor bump already present from develop passes', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'to-staging/2026-09-04-01',
        });
        assert.equal(result.mode, 'minor-floor');
        assert.equal(result.ok, true);
        assert.equal(findApp(result, 'dgfy-api').ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('staging <- to-staging/*: an unchanged app is left untouched (pass, not evaluated)', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0', 'dgfy-pos': '1.4.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'to-staging/2026-09-04-01',
        });
        assert.equal(result.ok, true);
        assert.equal(result.appResults.length, 1);
        assert.equal(findApp(result, 'dgfy-pos'), undefined);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- staging mode: any other head -> patch-only -----------------------------

test('staging <- fix/staging/*: a minor bump fails patch-only', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'fix/staging/2026-09-04-01-r2',
        });
        assert.equal(result.mode, 'patch-only');
        assert.equal(result.ok, false);
        assert.equal(findApp(result, 'dgfy-api').code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('staging <- fix/staging/*: a patch bump passes patch-only', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.2.1', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'staging', headBranchName: 'fix/staging/2026-09-04-01-r2',
        });
        assert.equal(result.mode, 'patch-only');
        assert.equal(result.ok, true);
        assert.equal(findApp(result, 'dgfy-api').ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- main mode: release/* -> any-increase; anything else -> patch-only ------

test('main <- release/*: any increase passes', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.5', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'main', headBranchName: 'release/2026-09-04-01-r1',
        });
        assert.equal(result.mode, 'any-increase');
        assert.equal(result.ok, true);
        assert.equal(findApp(result, 'dgfy-api').ok, true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('main <- ad-hoc hotfix head: a minor bump fails patch-only', () => {
    const { root, baseGitRef, headGitRef } = setupScenario({
        baseVersions: { 'dgfy-api': '1.2.0' },
        headFiles: {
            'apps/dgfy-api/src/index.js': 'module.exports = { changed: true };\n',
            'apps/dgfy-api/package.json': pkgJson('1.3.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        },
    });
    try {
        const result = runCheck({
            repoRoot: root, baseGitRef, headGitRef, baseBranchName: 'main', headBranchName: 'hotfix/urgent-fix',
        });
        assert.equal(result.mode, 'patch-only');
        assert.equal(result.ok, false);
        assert.equal(findApp(result, 'dgfy-api').code, 'insufficient-bump');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

// --- --floor mode ------------------------------------------------------------

test('--floor lists exactly the apps below floor with the right X.(Y+1).0 target', () => {
    const root = makeGitRepo();
    writeFiles(root, baseFixture({
        'dgfy-api': '1.2.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '2.0.0',
        'dgfy-pos': '1.4.0',
        'dgfy-storefront': '1.3.0',
    }));
    const baseGitRef = commitAll(root, 'staging snapshot');

    writeFiles(root, {
        // patch-only bump -- below floor, target 1.3.0
        'apps/dgfy-api/package.json': pkgJson('1.2.5', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        // minor bump -- meets floor
        'apps/dgfy-migration-runner/package.json': pkgJson('1.1.0', { '@sieitzz/shared-constants': 'file:../../packages/shared-constants' }),
        // unchanged -- below floor, target 2.1.0
        // (dgfy-ims package.json intentionally left untouched)
        // minor + extra patch bump -- meets floor
        'apps/dgfy-pos/package.json': pkgJson('1.5.2', {
            '@sieitzz/pos-receipt': 'file:../../packages/pos-receipt',
            '@sieitzz/shared-constants': 'file:../../packages/shared-constants',
            '@sieitzz/web-core': 'file:../../packages/web-core',
        }),
        // unchanged -- below floor, target 1.4.0
        // (dgfy-storefront package.json intentionally left untouched)
    });
    const headGitRef = commitAll(root, 'develop snapshot');

    try {
        const result = runFloor({ repoRoot: root, baseGitRef, headGitRef });
        const belowFloorApps = result.belowFloor.map((entry) => entry.app).sort();
        assert.deepEqual(belowFloorApps, ['dgfy-api', 'dgfy-ims', 'dgfy-storefront']);

        const targets = Object.fromEntries(result.belowFloor.map((entry) => [entry.app, entry.floorTarget]));
        assert.equal(targets['dgfy-api'], '1.3.0');
        assert.equal(targets['dgfy-ims'], '2.1.0');
        assert.equal(targets['dgfy-storefront'], '1.4.0');

        const meetsFloorApps = result.results.filter((entry) => !entry.belowFloor).map((entry) => entry.app).sort();
        assert.deepEqual(meetsFloorApps, ['dgfy-migration-runner', 'dgfy-pos']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
