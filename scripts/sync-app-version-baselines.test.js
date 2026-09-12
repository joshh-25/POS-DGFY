const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const { computeBaselineSync } = require('./sync-app-version-baselines');

// spawnSync is used by the git fixture harness below (runGit), not for CLI invocation --
// see check-app-version-bump.test.js's own convention: exercise exported functions directly with
// a repoRoot override, not the CLI entry point (which hardcodes REPO_ROOT from __dirname).

// --- git fixture harness, same shape as check-app-version-bump.test.js's -----------------------

function makeTempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(cwd, args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return (result.stdout || '').trim();
}

function makeGitRepo() {
    const root = makeTempDir('sync-app-version-baselines-git-');
    runGit(root, ['init', '-q']);
    runGit(root, ['config', 'user.email', 'test@example.com']);
    runGit(root, ['config', 'user.name', 'Sync App Version Baselines Test']);
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

function pkgJson(version) {
    return `${JSON.stringify({ name: 'fixture', version }, null, 2)}\n`;
}

// Mirrors the real repo's five apps -- same list check-app-version-bump.test.js's baseFixture()
// uses.
function versionsFixture(versions) {
    const files = {};
    for (const [app, version] of Object.entries(versions)) {
        files[`apps/${app}/package.json`] = pkgJson(version);
    }
    return files;
}

test('an app below main\'s baseline is reported in needsSync, with both versions', () => {
    const root = makeGitRepo();
    writeFiles(root, versionsFixture({
        'dgfy-api': '1.2.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
    }));
    const developRef = commitAll(root, 'develop snapshot');

    // main has moved dgfy-api forward via a hotfix that never made it back to develop.
    writeFiles(root, versionsFixture({
        'dgfy-api': '1.3.1',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
    }));
    const mainRef = commitAll(root, 'main snapshot');

    try {
        const result = computeBaselineSync({ repoRoot: root, developRef, mainRef });

        const needsSyncApps = result.needsSync.map((entry) => entry.app);
        assert.deepEqual(needsSyncApps, ['dgfy-api']);
        assert.equal(result.needsSync[0].developVersion, '1.2.0');
        assert.equal(result.needsSync[0].mainVersion, '1.3.1');

        const upToDateApps = result.upToDate.map((entry) => entry.app).sort();
        assert.deepEqual(upToDateApps, ['dgfy-ims', 'dgfy-migration-runner', 'dgfy-pos', 'dgfy-storefront']);

        assert.deepEqual(result.invalid, []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('develop already at or above main is left untouched -- never a downgrade (#1807)', () => {
    const root = makeGitRepo();
    writeFiles(root, versionsFixture({
        'dgfy-api': '2.0.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
    }));
    const developRef = commitAll(root, 'develop snapshot');

    // main is behind develop on dgfy-api (an ordinary in-flight state -- develop has already
    // bumped it for unreleased work) -- must never be flagged for sync.
    writeFiles(root, versionsFixture({
        'dgfy-api': '1.4.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
    }));
    const mainRef = commitAll(root, 'main snapshot');

    try {
        const result = computeBaselineSync({ repoRoot: root, developRef, mainRef });

        assert.deepEqual(result.needsSync, []);
        const upToDateApps = result.upToDate.map((entry) => entry.app).sort();
        assert.deepEqual(upToDateApps, ['dgfy-api', 'dgfy-ims', 'dgfy-migration-runner', 'dgfy-pos', 'dgfy-storefront']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('an exact version match is up to date, not flagged -- equality is not "below"', () => {
    const root = makeGitRepo();
    writeFiles(root, versionsFixture({
        'dgfy-api': '1.5.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
    }));
    const developRef = commitAll(root, 'develop snapshot');
    const mainRef = developRef; // identical content at both refs

    try {
        const result = computeBaselineSync({ repoRoot: root, developRef, mainRef });
        assert.deepEqual(result.needsSync, []);
        assert.equal(result.upToDate.length, 5);
        assert.deepEqual(result.invalid, []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('an unreadable/unparseable version at either ref is surfaced as invalid, never silently treated as up to date', () => {
    const root = makeGitRepo();
    writeFiles(root, versionsFixture({
        'dgfy-api': '1.0.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
    }));
    const developRef = commitAll(root, 'develop snapshot');

    writeFiles(root, {
        'apps/dgfy-api/package.json': '{ not valid json',
        ...versionsFixture({
            'dgfy-migration-runner': '1.0.0',
            'dgfy-ims': '1.0.0',
            'dgfy-pos': '1.0.0',
            'dgfy-storefront': '1.0.0',
        }),
    });
    const mainRef = commitAll(root, 'main snapshot');

    try {
        const result = computeBaselineSync({ repoRoot: root, developRef, mainRef });

        const invalidApps = result.invalid.map((entry) => entry.app);
        assert.deepEqual(invalidApps, ['dgfy-api']);
        // Never counted as needsSync or upToDate -- a version that couldn't be read is its own
        // bucket, not silently folded into "nothing to do".
        assert.equal(result.needsSync.some((entry) => entry.app === 'dgfy-api'), false);
        assert.equal(result.upToDate.some((entry) => entry.app === 'dgfy-api'), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('all five apps are always evaluated, unconditionally -- no changed-files scoping (unlike --floor)', () => {
    const root = makeGitRepo();
    const versions = {
        'dgfy-api': '1.0.0',
        'dgfy-migration-runner': '1.0.0',
        'dgfy-ims': '1.0.0',
        'dgfy-pos': '1.0.0',
        'dgfy-storefront': '1.0.0',
    };
    writeFiles(root, versionsFixture(versions));
    const developRef = commitAll(root, 'develop snapshot');
    const mainRef = developRef;

    try {
        const result = computeBaselineSync({ repoRoot: root, developRef, mainRef });
        assert.equal(result.results.length, 5);
        assert.deepEqual(result.results.map((entry) => entry.app).sort(), [
            'dgfy-api', 'dgfy-ims', 'dgfy-migration-runner', 'dgfy-pos', 'dgfy-storefront',
        ]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
